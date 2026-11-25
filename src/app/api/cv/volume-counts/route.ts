import { NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/server/auth";
import { getVolumeCounts } from "@/lib/server/comicvine";

/** POST /api/cv/volume-counts  { ids: number[] } → { counts: { [seriesId]: number of issues } } */
export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter((n: number) => Number.isInteger(n) && n > 0) : [];
  if (!ids.length) return NextResponse.json({ counts: {} });

  try {
    return NextResponse.json({ counts: await getVolumeCounts(ids) });
  } catch (e) {
    return errorResponse(e);
  }
}
