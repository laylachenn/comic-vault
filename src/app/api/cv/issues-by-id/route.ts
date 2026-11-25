import { NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/server/auth";
import { getIssuesByIds } from "@/lib/server/comicvine";

/** GET /api/cv/issues-by-id?ids=6428,283008 → those issues (up to 100), in the order asked for. */
export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;

  const ids = (new URL(req.url).searchParams.get("ids") || "")
    .split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 100);
  if (!ids.length) return NextResponse.json({ issues: [] });

  try {
    const found = new Map((await getIssuesByIds(ids)).map((i) => [i.id, i]));
    return NextResponse.json({ issues: ids.map((id) => found.get(id)).filter(Boolean) });
  } catch (e) {
    return errorResponse(e);
  }
}
