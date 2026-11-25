import { NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/server/auth";
import { getIssuesByIds, getStoryArc } from "@/lib/server/comicvine";

const MAX_ISSUES = 300;

/** GET /api/cv/arc?id=56343 → the story arc and its issues in reading order (up to 300). */
export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;

  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Pick a story arc first." }, { status: 400 });

  try {
    const { issueIds, ...arc } = await getStoryArc(id);
    const wanted = issueIds.slice(0, MAX_ISSUES);
    const found = new Map<number, Awaited<ReturnType<typeof getIssuesByIds>>[number]>();
    for (let i = 0; i < wanted.length; i += 100) {
      for (const issue of await getIssuesByIds(wanted.slice(i, i + 100))) found.set(issue.id, issue);
    }
    return NextResponse.json({
      arc,
      issues: wanted.map((n) => found.get(n)).filter(Boolean),
      total: issueIds.length,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
