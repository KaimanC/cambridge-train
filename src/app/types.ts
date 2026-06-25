export type Station = {
  id: string;
  name: string;
  lat?: number;
  lon?: number;
  distanceMeters?: number;
  lines?: string[];
};

export type OriginSummary = {
  kind: "coordinates" | "station";
  label: string;
  lat?: number;
  lon?: number;
  stationId?: string;
};

export type JourneyLeg = {
  mode: string;
  lineName?: string;
  instruction: string;
  direction?: string;
  durationMinutes: number;
  departureTime?: string;
  arrivalTime?: string;
};

export type AccessJourney = {
  terminusId: string;
  terminusName: string;
  durationMinutes: number;
  leaveTime: string;
  arrivalTime: string;
  legs: JourneyLeg[];
  statusMessages: string[];
};

export type TrainOption = {
  serviceId: string;
  terminusId: string;
  terminusName: string;
  crs: string;
  operator: string;
  destinationName: string;
  departureTime: string;
  arrivalTime: string;
  platform?: string;
  status: string;
  delayMinutes?: number;
  isCancelled?: boolean;
};

export type RankedRoute = {
  rank: number;
  terminus: {
    id: string;
    name: string;
    railCrs: string;
    interchangeMinutes: number;
    interchangeNote: string;
  };
  access: AccessJourney;
  train: TrainOption;
  readyAt: string;
  leaveBy: string;
  arrivalTime: string;
  totalMinutes: number;
  warnings: string[];
};

export type RoutesResponse = {
  generatedAt: string;
  mock: boolean;
  origin: OriginSummary;
  nearestStation?: Station;
  routes: RankedRoute[];
  errors: string[];
  assumptions: string[];
  sources: {
    tfl: string;
    rtt: string;
  };
};

