import { NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/server/auth";
import { cv, mapVolume, VOLUME_FIELDS } from "@/lib/server/comicvine";

/** GET /api/cv/volumes?q=scarlet witch → matching series on Comic Vine. */
export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;

  const q = (new URL(req.url).searchParams.get("q") || "").trim().slice(0, 100);
  if (q.length < 2) return NextResponse.json({ volumes: [] });

  try {
    const body = await cv<{ results: Parameters<typeof mapVolume>[0][] }>(
      "search",
      { query: q, resources: "volume", field_list: VOLUME_FIELDS, limit: "40" },
      3600,
    );
    return NextResponse.json({ volumes: (body.results || []).map(mapVolume) });
  } catch (e) {
    return errorResponse(e);
  }
}
