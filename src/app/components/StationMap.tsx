"use client";

import "leaflet/dist/leaflet.css";

import { useMemo } from "react";
import { CircleMarker, MapContainer, TileLayer, Tooltip } from "react-leaflet";
import type { Station } from "@/app/types";

type StationMapProps = {
  stations: Station[];
  selectedId?: string;
  onSelect: (station: Station) => void;
};

const LONDON_CENTER: [number, number] = [51.5094, -0.1182];

export default function StationMap({ stations, selectedId, onSelect }: StationMapProps) {
  const mappable = useMemo(
    () => stations.filter((station) => station.lat != null && station.lon != null),
    [stations],
  );

  return (
    <MapContainer
      center={LONDON_CENTER}
      zoom={11}
      scrollWheelZoom
      className="stationMap"
      aria-label="Underground station map"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {mappable.map((station) => {
        const selected = station.id === selectedId;
        return (
          <CircleMarker
            key={station.id}
            center={[station.lat as number, station.lon as number]}
            radius={selected ? 8 : 5}
            pathOptions={{
              color: selected ? "#b91c1c" : "#1d4ed8",
              fillColor: selected ? "#ef4444" : "#3b82f6",
              fillOpacity: 0.9,
              weight: selected ? 3 : 1.5,
            }}
            eventHandlers={{ click: () => onSelect(station) }}
          >
            <Tooltip>{shortName(station.name)}</Tooltip>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}

function shortName(name: string) {
  return name.replace(" Underground Station", "").replace(" Station", "");
}
