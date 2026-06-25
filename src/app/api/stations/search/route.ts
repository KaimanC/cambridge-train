import { searchTubeStations } from "@/lib/tfl";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";

  if (query.trim().length < 2) {
    return Response.json({ stations: [] });
  }

  try {
    const stations = await searchTubeStations(query);
    return Response.json(
      { stations },
      { headers: { "Cache-Control": "private, max-age=300" } },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Station search failed." },
      { status: 502 },
    );
  }
}

