import { NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/server/auth";
import { CvError, getIssueExtras } from "@/lib/server/comicvine";

const BATCH = 8;

/**
 * POST /api/collection/extras  { ids: string[] }
 * Looks up first appearances and story arcs for up to 8 of your comics that were added before
 * these were saved. Returns the updated comics. If Comic Vine starts limiting requests partway
 * through, returns what was finished so far with `limited: true`.
 */
export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;
  const { sb } = auth;

  const body = await req.json().catch(() => ({}));
  const ids = Array.isArray(body.ids) ? body.ids.filter((x: unknown): x is string => typeof x === "string").slice(0, BATCH) : [];
  if (!ids.length) return NextResponse.json({ comics: [], limited: false });

  // The database's own rules mean this only ever finds the signed-in person's comics.
  const { data: rows, error } = await sb.from("comics").select("id, cv_issue_id").in("id", ids);
  if (error) return NextResponse.json({ error: "Couldn't load those comics. Try again." }, { status: 500 });

  const updated: unknown[] = [];
  for (const row of rows ?? []) {
    let patch = {};
    if (row.cv_issue_id) {
      try {
        const x = await getIssueExtras(row.cv_issue_id);
        patch = { first_appearances: x.firstAppearances, story_arcs: x.storyArcs };
      } catch (e) {
        if (e instanceof CvError && e.status === 429) return NextResponse.json({ comics: updated, limited: true });
        // An issue Comic Vine no longer has is still marked checked, so it isn't retried forever.
        if (!(e instanceof CvError && e.status === 404)) {
          return updated.length ? NextResponse.json({ comics: updated, limited: false }) : errorResponse(e);
        }
      }
    }
    const { data, error: upErr } = await sb.from("comics")
      .update({ ...patch, extras_checked_at: new Date().toISOString() })
      .eq("id", row.id).select().single();
    if (!upErr && data) updated.push(data);
  }
  return NextResponse.json({ comics: updated, limited: false });
}
