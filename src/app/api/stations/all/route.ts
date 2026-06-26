import { getAllTubeStations } from "@/lib/tfl";

export const runtime = "nodejs";
// The Tube network rarely changes, so cache the full list aggressively.
export const revalidate = 86_400;

export async function GET() {
  try {
    const stations = await getAllTubeStations();
    return Response.json(
      { stations },
      {
        headers: {
          "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        },
      },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unable to load Tube stations." },
      { status: 502 },
    );
  }
}
