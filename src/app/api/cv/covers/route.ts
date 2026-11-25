import { NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/server/auth";
import { getIssueDetail } from "@/lib/server/comicvine";

/** Comic Vine serves smaller copies of each picture at the same path with a different size folder. */
function sized(url: string, size: "scale_medium" | "scale_large") {
  return url.replace(/\/a\/uploads\/[^/]+\//, `/a/uploads/${size}/`);
}

/**
 * GET /api/cv/covers?issue=507779
 * → every cover picture Comic Vine has for an issue: the main one first, then the others
 *   (usually variants, in no reliable order).
 */
export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;

  const id = Number(new URL(req.url).searchParams.get("issue"));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Pick a comic first." }, { status: 400 });

  try {
    const detail = await getIssueDetail(id);
    const urls = [detail.largeImage, ...detail.otherCovers].filter((u): u is string => !!u);
    const seen = new Set<string>();
    const covers = urls
      .filter((u) => { const k = sized(u, "scale_large"); if (seen.has(k)) return false; seen.add(k); return true; })
      .map((u) => ({ full: sized(u, "scale_large"), thumb: sized(u, "scale_medium") }));
    return NextResponse.json({ covers });
  } catch (e) {
    return errorResponse(e);
  }
}
