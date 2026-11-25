import { NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/server/auth";
import { cv, getVolume, ISSUE_FIELDS, mapIssue } from "@/lib/server/comicvine";

const PAGE = 100;

/**
 * GET /api/cv/issues?volume=2127&offset=0[&issue=16]
 * → the issues in one Comic Vine series, 100 at a time, plus the series itself on the first page.
 */
export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;

  const params = new URL(req.url).searchParams;
  const volume = Number(params.get("volume"));
  const offset = Math.max(0, Number(params.get("offset")) || 0);
  const issue = (params.get("issue") || "").trim().replace(/^#/, "").replace(/[^\w.\-]/g, "").slice(0, 12);
  if (!Number.isInteger(volume) || volume <= 0) {
    return NextResponse.json({ error: "Pick a series first." }, { status: 400 });
  }

  try {
    const filter = `volume:${volume}` + (issue ? `,issue_number:${issue}` : "");
    const [list, vol] = await Promise.all([
      cv<{ results: Parameters<typeof mapIssue>[0][]; number_of_total_results: number }>(
        "issues",
        { filter, field_list: ISSUE_FIELDS, limit: String(PAGE), offset: String(offset) },
        86400,
      ),
      offset === 0 ? getVolume(volume) : Promise.resolve(null),
    ]);
    return NextResponse.json({
      volume: vol,
      issues: (list.results || []).map(mapIssue),
      total: list.number_of_total_results ?? 0,
      offset,
      pageSize: PAGE,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
