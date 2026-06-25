import { getNearestTubeStation } from "@/lib/tfl";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const lat = Number(url.searchParams.get("lat"));
  const lon = Number(url.searchParams.get("lon"));

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return Response.json({ error: "lat and lon are required." }, { status: 400 });
  }

  try {
    const station = await getNearestTubeStation(lat, lon);
    return Response.json(
      { station },
      { headers: { "Cache-Control": "private, max-age=60" } },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to find nearest station." },
      { status: 502 },
    );
  }
}

