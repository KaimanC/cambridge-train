"use client";

import {
  AlertTriangle,
  Clock,
  LocateFixed,
  Map as MapIcon,
  MapPin,
  RefreshCw,
  Search,
  TrainFront,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RankedRoute, RoutesResponse, Station } from "@/app/types";
import { QUICK_STATIONS } from "@/lib/constants";
import { formatLondonStamp, formatLondonTime } from "@/lib/time";

const StationMap = dynamic(() => import("@/app/components/StationMap"), {
  ssr: false,
  loading: () => <div className="stationMap mapLoading">Loading map…</div>,
});

type OriginState =
  | { kind: "coordinates"; lat: number; lon: number; label: string }
  | { kind: "station"; station: Station };

const REFRESH_MS = Number(process.env.NEXT_PUBLIC_REFRESH_INTERVAL_MS ?? 60_000);

export default function HomePlanner() {
  const [origin, setOrigin] = useState<OriginState | null>(null);
  const [data, setData] = useState<RoutesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [stationQuery, setStationQuery] = useState("");
  const [stationResults, setStationResults] = useState<Station[]>([]);
  const [stationSearchError, setStationSearchError] = useState<string | null>(null);
  const [departAt, setDepartAt] = useState("");
  const [showMap, setShowMap] = useState(false);
  const [allStations, setAllStations] = useState<Station[]>([]);
  const [mapStatus, setMapStatus] = useState<"idle" | "loading" | "error">("idle");

  // Read inside the stable fetchRoutes callback without making it depend on the value.
  const departAtRef = useRef(departAt);
  useEffect(() => {
    departAtRef.current = departAt;
  }, [departAt]);

  const originLabel = useMemo(() => {
    if (!origin) return "No start selected";
    return origin.kind === "station" ? origin.station.name : origin.label;
  }, [origin]);

  const selectedStationId = origin?.kind === "station" ? origin.station.id : undefined;

  const fetchRoutes = useCallback(async (nextOrigin: OriginState, showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (nextOrigin.kind === "station") {
      params.set("stationId", nextOrigin.station.id);
      params.set("stationName", nextOrigin.station.name);
    } else {
      params.set("lat", String(nextOrigin.lat));
      params.set("lon", String(nextOrigin.lon));
    }

    const whenIso = toWhenIso(departAtRef.current);
    if (whenIso) params.set("when", whenIso);

    try {
      const response = await fetch(`/api/routes?${params.toString()}`, {
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Route planning failed.");
      setData(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Route planning failed.");
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, []);

  const requestCurrentLocation = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setLocationMessage("Geolocation is not available in this browser.");
      return;
    }

    setLocating(true);
    setLocationMessage(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextOrigin = {
          kind: "coordinates",
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          label: "Current location",
        } as const;
        setOrigin(nextOrigin);
        fetchRoutes(nextOrigin);
        setLocating(false);
      },
      (geoError) => {
        setLocationMessage(
          geoError.code === geoError.PERMISSION_DENIED
            ? "Location permission was denied."
            : "Current location could not be read.",
        );
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }, [fetchRoutes]);

  useEffect(() => {
    const timer = window.setTimeout(() => requestCurrentLocation(), 0);
    return () => window.clearTimeout(timer);
  }, [requestCurrentLocation]);

  useEffect(() => {
    if (!origin) return;
    const timer = window.setInterval(() => {
      fetchRoutes(origin, false);
    }, Number.isFinite(REFRESH_MS) ? REFRESH_MS : 60_000);
    return () => window.clearInterval(timer);
  }, [fetchRoutes, origin]);

  // Re-plan whenever the depart-at time changes for an already-selected start.
  // Deferred so the ref-sync effect above runs first and to avoid a synchronous
  // setState cascade inside the effect body.
  useEffect(() => {
    if (!origin) return;
    const timer = window.setTimeout(() => fetchRoutes(origin), 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departAt]);

  useEffect(() => {
    const query = stationQuery.trim();
    if (query.length < 2) {
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/stations/search?q=${encodeURIComponent(query)}`);
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Station search failed.");
        setStationResults(payload.stations ?? []);
        setStationSearchError(null);
      } catch (err) {
        setStationSearchError(err instanceof Error ? err.message : "Station search failed.");
      }
    }, 250);

    return () => window.clearTimeout(timer);
  }, [stationQuery]);

  const loadAllStations = useCallback(async () => {
    if (allStations.length || mapStatus === "loading") return;
    setMapStatus("loading");
    try {
      const response = await fetch("/api/stations/all");
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Unable to load Tube stations.");
      setAllStations(payload.stations ?? []);
      setMapStatus("idle");
    } catch {
      setMapStatus("error");
    }
  }, [allStations.length, mapStatus]);

  function toggleMap() {
    setShowMap((open) => {
      const next = !open;
      if (next) loadAllStations();
      return next;
    });
  }

  function pickStation(station: Station) {
    const nextOrigin = { kind: "station" as const, station };
    setOrigin(nextOrigin);
    setStationQuery(station.name);
    setStationResults([]);
    fetchRoutes(nextOrigin);
  }

  function updateStationQuery(value: string) {
    setStationQuery(value);
    if (value.trim().length < 2) {
      setStationResults([]);
      setStationSearchError(null);
    }
  }

  return (
    <main className="appShell">
      <section className="heroBand">
        <div>
          <p className="eyebrow">London to Cambridge</p>
          <h1>Quickest train home to Cambridge</h1>
        </div>
        <div className="heroActions">
          <button className="button secondary" onClick={requestCurrentLocation} disabled={locating}>
            <LocateFixed size={18} aria-hidden="true" />
            {locating ? "Locating" : "Current location"}
          </button>
          <button
            className="button primary"
            onClick={() => origin && fetchRoutes(origin)}
            disabled={!origin || loading}
          >
            <RefreshCw size={18} aria-hidden="true" />
            Refresh
          </button>
        </div>
      </section>

      <section className="controlBand" aria-label="Journey controls">
        <div className="originPanel">
          <div className="originLine">
            <MapPin size={18} aria-hidden="true" />
            <span>{originLabel}</span>
          </div>
          {data?.nearestStation ? (
            <p className="mutedText">
              Nearest Tube: {data.nearestStation.name}
              {data.nearestStation.distanceMeters
                ? `, ${Math.round(data.nearestStation.distanceMeters)} m away`
                : ""}
            </p>
          ) : null}
          {locationMessage ? <p className="warningText">{locationMessage}</p> : null}

          <div className="departControl">
            <label htmlFor="depart-at">
              <Clock size={16} aria-hidden="true" />
              Depart
            </label>
            <input
              id="depart-at"
              type="datetime-local"
              value={departAt}
              onChange={(event) => setDepartAt(event.target.value)}
            />
            {departAt ? (
              <button className="linkButton" onClick={() => setDepartAt("")}>
                Now
              </button>
            ) : (
              <span className="mutedText">Leaving now</span>
            )}
          </div>
        </div>

        <div className="stationSearch">
          <label htmlFor="station-search">Manual start</label>
          <div className="searchBox">
            <Search size={18} aria-hidden="true" />
            <input
              id="station-search"
              value={stationQuery}
              onChange={(event) => updateStationQuery(event.target.value)}
              placeholder="Search Tube station"
              autoComplete="off"
            />
          </div>

          {stationResults.length ? (
            <div className="resultList">
              {stationResults.map((station) => (
                <button key={station.id} onClick={() => pickStation(station)}>
                  {station.name}
                </button>
              ))}
            </div>
          ) : null}

          {stationSearchError ? <p className="warningText">{stationSearchError}</p> : null}

          <div className="quickStations">
            {QUICK_STATIONS.slice(0, 6).map((station) => (
              <button key={station.id} onClick={() => pickStation(station)}>
                {shortStationName(station.name)}
              </button>
            ))}
          </div>

          <button className="button ghost mapToggle" onClick={toggleMap} aria-expanded={showMap}>
            <MapIcon size={18} aria-hidden="true" />
            {showMap ? "Hide station map" : "Pick on map"}
          </button>
        </div>
      </section>

      {showMap ? (
        <section className="mapBand" aria-label="Underground station map">
          {mapStatus === "error" ? (
            <ErrorPanel message="Could not load the Tube station map." subdued />
          ) : (
            <StationMap
              stations={allStations}
              selectedId={selectedStationId}
              onSelect={pickStation}
            />
          )}
          <p className="mutedText">Drag to pan, scroll to zoom, click a station to set your start.</p>
        </section>
      ) : null}

      <section className="statusBand" aria-live="polite">
        <div>
          {data?.generatedAt ? (
            <span>Updated {formatLondonStamp(data.generatedAt)}</span>
          ) : (
            <span>{loading ? "Calculating routes" : "Waiting for a start point"}</span>
          )}
          {data?.mock ? <span className="badge">Mock train data</span> : null}
        </div>
        <span>Auto-refresh {Math.round((Number.isFinite(REFRESH_MS) ? REFRESH_MS : 60_000) / 1000)}s</span>
      </section>

      {error ? <ErrorPanel message={error} /> : null}
      {data?.errors?.map((message) => <ErrorPanel key={message} message={message} subdued />)}

      {loading && !data ? <LoadingRoutes /> : null}

      {data && !loading ? (
        <section className="routesList" aria-label="Ranked routes">
          {data.routes.length ? (
            data.routes.map((route) => <RouteCard key={route.rank} route={route} />)
          ) : (
            <div className="emptyState">
              <AlertTriangle size={20} aria-hidden="true" />
              <p>No catchable Cambridge route is available from this start point right now.</p>
            </div>
          )}
        </section>
      ) : null}
    </main>
  );
}

function RouteCard({ route }: { route: RankedRoute }) {
  return (
    <article className="routeCard">
      <div className="routeHeader">
        <div>
          <span className="rank">#{route.rank}</span>
          <h2>{route.terminus.name}</h2>
        </div>
        <div className="arrivalBlock">
          <span>{formatLondonTime(route.arrivalTime)}</span>
          <small>{route.totalMinutes} min total</small>
        </div>
      </div>

      <div className="routeGrid">
        <div className="journeyPart">
          <p className="partLabel">
            <Clock size={16} aria-hidden="true" />
            Leave by {formatLondonTime(route.leaveBy)}
          </p>
          <p className="mainText">
            {route.access.durationMinutes
              ? `${route.access.durationMinutes} min to ${route.terminus.name}`
              : "Already at the interchange"}
          </p>
          <div className="legList">
            {route.access.legs.length ? (
              route.access.legs.map((leg, index) => (
                <span key={`${leg.instruction}-${index}`}>
                  {leg.instruction}
                  {leg.durationMinutes ? ` (${leg.durationMinutes} min)` : ""}
                </span>
              ))
            ) : (
              <span>{route.terminus.interchangeNote}</span>
            )}
          </div>
          <p className="mutedText">
            Ready at {formatLondonTime(route.readyAt)} after {route.terminus.interchangeMinutes} min interchange.
          </p>
        </div>

        <div className="journeyPart trainPart">
          <p className="partLabel">
            <TrainFront size={16} aria-hidden="true" />
            {route.train.operator}
          </p>
          <p className="mainText">
            {formatLondonTime(route.train.departureTime)} to {route.train.destinationName}
          </p>
          <dl className="trainFacts">
            <div>
              <dt>Arrives</dt>
              <dd>{formatLondonTime(route.train.arrivalTime)}</dd>
            </div>
            <div>
              <dt>Platform</dt>
              <dd>{route.train.platform ?? "TBC"}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd className={route.train.delayMinutes && route.train.delayMinutes > 0 ? "late" : ""}>
                {route.train.status}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </article>
  );
}

function ErrorPanel({ message, subdued = false }: { message: string; subdued?: boolean }) {
  return (
    <div className={subdued ? "errorPanel subdued" : "errorPanel"}>
      <AlertTriangle size={18} aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

function LoadingRoutes() {
  return (
    <section className="routesList" aria-label="Loading routes">
      {[0, 1, 2].map((item) => (
        <div className="routeCard skeleton" key={item}>
          <div />
          <div />
          <div />
        </div>
      ))}
    </section>
  );
}

function shortStationName(name: string) {
  return name.replace(" Underground Station", "").replace(" Station", "");
}

function toWhenIso(local: string) {
  if (!local) return undefined;
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}
