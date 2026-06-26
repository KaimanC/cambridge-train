import { buildRoutes } from "@/lib/ranking";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const lat = Number(url.searchParams.get("lat"));
  const lon = Number(url.searchParams.get("lon"));
  const stationId = url.searchParams.get("stationId");
  const stationName = url.searchParams.get("stationName");
  const whenParam = url.searchParams.get("when");
  const when = whenParam && !Number.isNaN(Date.parse(whenParam)) ? whenParam : undefined;

  try {
    if (stationId && !stationName) {
      return Response.json(
        { error: "stationName is required when stationId is provided." },
        { status: 400 },
      );
    }

    if (!stationId && (!Number.isFinite(lat) || !Number.isFinite(lon))) {
      return Response.json(
        { error: "Either lat/lon or stationId/stationName is required." },
        { status: 400 },
      );
    }

    const data =
      stationId && stationName
        ? await buildRoutes({ kind: "station", stationId, stationName, when })
        : await buildRoutes({ kind: "coordinates", lat, lon, when });

    return Response.json(data, {
      headers: {
        "Cache-Control": "private, max-age=15, stale-while-revalidate=45",
      },
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Route planning failed.",
      },
      { status: 500 },
    );
  }
}
