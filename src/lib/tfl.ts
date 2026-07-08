import type { AccessJourney, JourneyLeg, Station } from "@/app/types";
import type { Terminus } from "@/lib/constants";
import {
  addMinutes,
  londonDateParam,
  londonTimeParam,
  parseTflDateTime,
  toIso,
} from "@/lib/time";

type TflStopPoint = {
  id?: string;
  naptanId?: string;
  stationNaptan?: string;
  commonName?: string;
  name?: string;
  lat?: number;
  lon?: number;
  distance?: number;
  lines?: { id?: string; name?: string }[];
  lineGroup?: {
    stationAtcoCode?: string;
    lineIdentifier?: string[];
  }[];
  children?: TflStopPoint[];
  modes?: string[];
  stopType?: string;
};

type TflJourney = {
  startDateTime?: string;
  duration?: number;
  arrivalDateTime?: string;
  legs?: TflJourneyLeg[];
};

type TflJourneyLeg = {
  duration?: number;
  instruction?: {
    summary?: string;
    detailed?: string;
  };
  mode?: {
    id?: string;
    name?: string;
  };
  departureTime?: string;
  arrivalTime?: string;
  routeOptions?: { name?: string; directions?: string[] }[];
};

export type TflOrigin =
  | { kind: "coordinates"; lat: number; lon: number; label?: string }
  | { kind: "station"; stationId: string; stationName: string };

type DirectAccessEstimate = {
  durationMinutes: number;
  lineName: string;
  instruction: string;
  warning: string;
};

const DIRECT_ACCESS_ESTIMATES: Record<string, Record<string, DirectAccessEstimate>> = {
  // TfL can occasionally return very poor Journey Planner options from Barons
  // Court even though King's Cross and Finsbury Park are simple direct Piccadilly
  // line journeys. Keep live TfL journeys when they look sane, but cap obvious
  // outliers so catchability and leave-by times are not wildly pessimistic.
  "940GZZLUBSC": {
    "kings-cross": {
      durationMinutes: 26,
      lineName: "Piccadilly",
      instruction: "Take the Piccadilly line direct from Barons Court to King's Cross St Pancras.",
      warning: "TfL returned a slower-than-expected Barons Court route, so a direct Piccadilly estimate was used.",
    },
    "finsbury-park": {
      durationMinutes: 34,
      lineName: "Piccadilly",
      instruction: "Take the Piccadilly line direct from Barons Court to Finsbury Park.",
      warning: "TfL returned a slower-than-expected Barons Court route, so a direct Piccadilly estimate was used.",
    },
  },
};

const DIRECT_ACCESS_OUTLIER_GRACE_MINUTES = 5;

export async function getAllTubeStations(): Promise<Station[]> {
  // Type/NaptanMetroStation (~2.7MB) is far leaner than Mode/tube (~21MB) and
  // already returns one entry per station with coordinates. Skip Next's fetch
  // cache (the body exceeds the 2MB limit); the route handler does its own ISR.
  const stops = await tflFetchJson<TflStopPoint[]>(
    "/StopPoint/Type/NaptanMetroStation",
    {},
    { cache: false },
  );

  const byId = new Map<string, Station>();
  for (const stop of stops ?? []) {
    if (!stop.modes?.includes("tube")) continue;
    const station = normalizeStation(stop);
    if (station?.id && station.name && station.lat != null && station.lon != null) {
      byId.set(station.id, station);
    }
  }

  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function getNearestTubeStation(lat: number, lon: number) {
  const payload = await tflFetchJson<{
    stopPoints?: TflStopPoint[];
  }>("/StopPoint", {
    lat: lat.toString(),
    lon: lon.toString(),
    stopTypes: "NaptanMetroStation",
    radius: "2500",
    modes: "tube",
  });

  return (payload.stopPoints ?? [])
    .map(normalizeStation)
    .filter((station): station is Station => Boolean(station?.id && station.name))
    .sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity))[0];
}

export async function searchTubeStations(query: string) {
  if (query.trim().length < 2) return [];

  const payload = await tflFetchJson<{
    matches?: TflStopPoint[];
  }>(`/StopPoint/Search/${encodeURIComponent(query.trim())}`, {
    modes: "tube",
  });

  const expanded = await Promise.all(
    (payload.matches ?? []).map((stop) => expandSearchStop(stop)),
  );

  return expanded
    .flat()
    .filter((station): station is Station => Boolean(station?.id && station.name))
    .slice(0, 8);
}

async function expandSearchStop(stop: TflStopPoint) {
  const station = normalizeStation(stop);
  if (!station?.id.startsWith("HUB")) return station ? [station] : [];

  try {
    const hub = await tflFetchJson<TflStopPoint>(`/StopPoint/${station.id}`, {});
    const tubeGroups = new Map<string, string[]>();

    for (const group of hub.lineGroup ?? []) {
      const stationAtcoCode = group.stationAtcoCode;
      if (!stationAtcoCode?.startsWith("940GZZLU")) continue;
      tubeGroups.set(stationAtcoCode, [
        ...(tubeGroups.get(stationAtcoCode) ?? []),
        ...(group.lineIdentifier ?? []),
      ]);
    }

    return [...tubeGroups.entries()].map(([id, lineIds]) => ({
      id,
      name: hubNameForStation(hub, id),
      lat: hub.lat,
      lon: hub.lon,
      lines: [...new Set(lineIds)].map(formatLineName),
    }));
  } catch {
    return [station];
  }
}

export async function getAccessJourney(
  origin: TflOrigin,
  terminus: Terminus,
  departAt?: Date,
) {
  const from =
    origin.kind === "coordinates"
      ? `${origin.lat},${origin.lon}`
      : origin.stationId;

  if (origin.kind === "station" && origin.stationId === terminus.tflStopId) {
    const at = departAt ?? new Date();
    return {
      terminusId: terminus.id,
      terminusName: terminus.name,
      durationMinutes: 0,
      leaveTime: toIso(at),
      arrivalTime: toIso(at),
      legs: [],
      statusMessages: [],
    } satisfies AccessJourney;
  }

  const payload = await tflFetchJson<{
    journeys?: TflJourney[];
    stopMessages?: string[];
  }>(`/Journey/JourneyResults/${encodeURIComponent(from)}/to/${terminus.tflStopId}`, {
    mode: "walking,tube,dlr,elizabeth-line,overground",
    journeyPreference: "leasttime",
    timeIs: "Departing",
    date: departAt ? londonDateParam(departAt) : undefined,
    time: departAt ? londonTimeParam(departAt) : undefined,
    useRealTimeLiveArrivals: departAt ? "false" : "true",
    routeBetweenEntrances: "true",
    walkingSpeed: "average",
  });

  const journey = (payload.journeys ?? [])
    .map((candidate) => ({
      raw: candidate,
      arrival: parseTflDateTime(candidate.arrivalDateTime),
    }))
    .filter((candidate): candidate is { raw: TflJourney; arrival: Date } =>
      Boolean(candidate.arrival),
    )
    .sort((a, b) => a.arrival.getTime() - b.arrival.getTime())[0]?.raw;

  if (!journey) {
    const directEstimate = directAccessEstimate(origin, terminus, departAt);
    if (directEstimate) return directEstimate;
    throw new Error(`TfL returned no usable journey to ${terminus.name}.`);
  }

  const leaveTime = parseTflDateTime(journey.startDateTime) ?? new Date();
  const arrivalTime = parseTflDateTime(journey.arrivalDateTime) ?? leaveTime;

  const access = {
    terminusId: terminus.id,
    terminusName: terminus.name,
    durationMinutes: journey.duration ?? minutesFromDates(leaveTime, arrivalTime),
    leaveTime: toIso(leaveTime),
    arrivalTime: toIso(arrivalTime),
    legs: (journey.legs ?? []).map(normalizeLeg),
    statusMessages: payload.stopMessages ?? [],
  } satisfies AccessJourney;

  return capOutlierAccessJourney(origin, terminus, access, departAt);
}

async function tflFetchJson<T>(
  path: string,
  params: Record<string, string | undefined>,
  options: { cache?: boolean } = {},
) {
  const url = new URL(path, "https://api.tfl.gov.uk");
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }

  if (process.env.TFL_APP_KEY) {
    url.searchParams.set("app_key", process.env.TFL_APP_KEY);
  }

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    ...(options.cache === false
      ? { cache: "no-store" as const }
      : { next: { revalidate: 60 } }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`TfL request failed (${response.status}): ${body.slice(0, 180)}`);
  }

  return (await response.json()) as T;
}

function directAccessEstimate(
  origin: TflOrigin,
  terminus: Terminus,
  departAt?: Date,
): AccessJourney | undefined {
  if (origin.kind !== "station") return undefined;
  const estimate = DIRECT_ACCESS_ESTIMATES[origin.stationId]?.[terminus.id];
  if (!estimate) return undefined;

  const leaveTime = departAt ?? new Date();
  const arrivalTime = addMinutes(leaveTime, estimate.durationMinutes);

  return {
    terminusId: terminus.id,
    terminusName: terminus.name,
    durationMinutes: estimate.durationMinutes,
    leaveTime: toIso(leaveTime),
    arrivalTime: toIso(arrivalTime),
    legs: [
      {
        mode: "tube",
        lineName: estimate.lineName,
        instruction: estimate.instruction,
        direction: terminus.name,
        durationMinutes: estimate.durationMinutes,
        departureTime: toIso(leaveTime),
        arrivalTime: toIso(arrivalTime),
      },
    ],
    statusMessages: [estimate.warning],
  } satisfies AccessJourney;
}

function capOutlierAccessJourney(
  origin: TflOrigin,
  terminus: Terminus,
  access: AccessJourney,
  departAt?: Date,
) {
  const directEstimate = directAccessEstimate(origin, terminus, departAt);
  if (!directEstimate) return access;
  if (
    access.durationMinutes <=
    directEstimate.durationMinutes + DIRECT_ACCESS_OUTLIER_GRACE_MINUTES
  ) {
    return access;
  }

  return directEstimate;
}

function normalizeStation(stop: TflStopPoint): Station | undefined {
  const id = stop.id ?? stop.naptanId;
  const name = stop.commonName ?? stop.name;
  if (!id || !name) return undefined;

  return {
    id,
    name,
    lat: stop.lat,
    lon: stop.lon,
    distanceMeters: stop.distance,
    lines: stop.lines?.map((line) => line.name ?? line.id ?? "").filter(Boolean),
  };
}

function hubNameForStation(hub: TflStopPoint, stationId: string) {
  const childName = hub.children?.find((child) => child.stationNaptan === stationId)?.commonName;
  if (childName) return childName.replace(/-Underground$/, " Underground Station");
  return `${hub.commonName ?? hub.name ?? "Station"} Underground Station`;
}

function formatLineName(lineId: string) {
  return lineId
    .split("-")
    .map((word) => (word === "and" ? "&" : word[0].toUpperCase() + word.slice(1)))
    .join(" ");
}

function normalizeLeg(leg: TflJourneyLeg): JourneyLeg {
  const instruction =
    leg.instruction?.detailed ??
    leg.instruction?.summary ??
    leg.routeOptions?.[0]?.name ??
    "Travel";
  const direction = extractDirection(instruction) ?? leg.routeOptions?.[0]?.directions?.[0];

  return {
    mode: leg.mode?.id ?? leg.mode?.name ?? "unknown",
    lineName: leg.routeOptions?.[0]?.name,
    instruction,
    direction,
    durationMinutes: leg.duration ?? 0,
    departureTime: parseTflDateTime(leg.departureTime)?.toISOString(),
    arrivalTime: parseTflDateTime(leg.arrivalTime)?.toISOString(),
  };
}

function extractDirection(instruction: string) {
  const match = instruction.match(/\btowards\s+(.+)$/i);
  return match?.[1];
}

function minutesFromDates(start: Date, end: Date) {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000));
}
