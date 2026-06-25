const LONDON_TIME_ZONE = "Europe/London";

type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const londonFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: LONDON_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

export function minutesBetween(start: Date, end: Date) {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000));
}

export function toIso(date: Date) {
  return date.toISOString();
}

export function formatLondonTime(date: Date | string) {
  const value = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: LONDON_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(value);
}

export function formatLondonStamp(date: Date | string) {
  const value = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: LONDON_TIME_ZONE,
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(value);
}

export function ymdInLondon(date = new Date()) {
  const parts = getLondonParts(date);
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

export function parseTflDateTime(value?: string | null) {
  if (!value) return undefined;
  if (/[zZ]|[+-]\d\d:\d\d$/.test(value)) return new Date(value);
  return londonDateFromParts(parseLocalDateTime(value));
}

export function parseRttDateTime(value?: string | null) {
  if (!value) return undefined;
  return /[zZ]|[+-]\d\d:\d\d$/.test(value)
    ? new Date(value)
    : londonDateFromParts(parseLocalDateTime(value));
}

export function parseLegacyTime(
  runDate: string,
  hhmm?: string | null,
  reference?: Date,
) {
  if (!hhmm || hhmm.length < 4) return undefined;
  const hour = Number(hhmm.slice(0, 2));
  const minute = Number(hhmm.slice(2, 4));
  const [year, month, day] = runDate.split("-").map(Number);
  let date = londonDateFromParts({ year, month, day, hour, minute, second: 0 });

  if (reference && date.getTime() < reference.getTime() - 6 * 60 * 60_000) {
    date = addMinutes(date, 24 * 60);
  }

  return date;
}

function getLondonParts(date: Date): DateParts {
  const parts = londonFormatter.formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    hour: Number(lookup.hour),
    minute: Number(lookup.minute),
    second: Number(lookup.second),
  };
}

function londonDateFromParts(parts: DateParts) {
  const wanted = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  const guess = new Date(wanted);
  const actualParts = getLondonParts(guess);
  const actual = Date.UTC(
    actualParts.year,
    actualParts.month - 1,
    actualParts.day,
    actualParts.hour,
    actualParts.minute,
    actualParts.second,
  );
  return new Date(guess.getTime() + wanted - actual);
}

function parseLocalDateTime(value: string): DateParts {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/,
  );
  if (!match) return getLondonParts(new Date(value));
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6] ?? 0),
  };
}

function pad2(value: number) {
  return value.toString().padStart(2, "0");
}

