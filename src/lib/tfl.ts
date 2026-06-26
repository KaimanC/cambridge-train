import type { AccessJourney, JourneyLeg, Station } from "@/app/types";
import type { Terminus } from "@/lib/constants";
import { parseTflDateTime, toIso } from "@/lib/time";

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

export async function getAccessJourney(origin: TflOrigin, terminus: Terminus) {
  const from =
    origin.kind === "coordinates"
      ? `${origin.lat},${origin.lon}`
      : origin.stationId;

  if (origin.kind === "station" && origin.stationId === terminus.tflStopId) {
    const now = new Date();
    return {
      terminusId: terminus.id,
      terminusName: terminus.name,
      durationMinutes: 0,
      leaveTime: toIso(now),
      arrivalTime: toIso(now),
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
    useRealTimeLiveArrivals: "true",
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
    throw new Error(`TfL returned no usable journey to ${terminus.name}.`);
  }

  const leaveTime = parseTflDateTime(journey.startDateTime) ?? new Date();
  const arrivalTime = parseTflDateTime(journey.arrivalDateTime) ?? leaveTime;

  return {
    terminusId: terminus.id,
    terminusName: terminus.name,
    durationMinutes: journey.duration ?? minutesFromDates(leaveTime, arrivalTime),
    leaveTime: toIso(leaveTime),
    arrivalTime: toIso(arrivalTime),
    legs: (journey.legs ?? []).map(normalizeLeg),
    statusMessages: payload.stopMessages ?? [],
  } satisfies AccessJourney;
}

async function tflFetchJson<T>(
  path: string,
  params: Record<string, string | undefined>,
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
    next: { revalidate: 60 },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`TfL request failed (${response.status}): ${body.slice(0, 180)}`);
  }

  return (await response.json()) as T;
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
