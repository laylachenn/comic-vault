import { NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/server/auth";
import { addRunYears, cv, VOLUME_FIELDS, type RawVolume } from "@/lib/server/comicvine";

/** GET /api/cv/volumes?q=scarlet witch → matching series on Comic Vine. */
export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;

  const q = (new URL(req.url).searchParams.get("q") || "").trim().slice(0, 100);
  if (q.length < 2) return NextResponse.json({ volumes: [] });

  try {
    const body = await cv<{ results: RawVolume[] }>(
      "search",
      { query: q, resources: "volume", field_list: VOLUME_FIELDS, limit: "40" },
      3600,
    );
    const volumes = await addRunYears(body.results || []);
    // Originals first, reprint editions after; otherwise keep Comic Vine's best-match order.
    volumes.sort((a, b) => Number(!!a.edition) - Number(!!b.edition));
    return NextResponse.json({ volumes });
  } catch (e) {
    return errorResponse(e);
  }
}
