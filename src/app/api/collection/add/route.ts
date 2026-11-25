import { NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/server/auth";
import { downloadCover, getIssueDetail, getVolume, isComicVineImage } from "@/lib/server/comicvine";

/**
 * POST /api/collection/add  { cvIssueId: number, status?: "owned" | "wanted", variant?: string, coverUrl?: string }
 * `coverUrl` picks one of Comic Vine's other covers for the issue (a variant) instead of the main one.
 * Looks the issue up on Comic Vine, saves a copy of its cover to the person's storage folder,
 * and adds it to their collection. Returns the new comic.
 */
export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;
  const { sb, user } = auth;

  const body = await req.json().catch(() => ({}));
  const cvIssueId = Number(body.cvIssueId);
  const status = body.status === "wanted" ? "wanted" : "owned";
  const variant = typeof body.variant === "string" ? body.variant.trim().slice(0, 120) : "";
  const chosenCover = typeof body.coverUrl === "string" && isComicVineImage(body.coverUrl) ? body.coverUrl : null;
  if (!Number.isInteger(cvIssueId) || cvIssueId <= 0) {
    return NextResponse.json({ error: "That comic couldn't be found. Search again." }, { status: 400 });
  }

  try {
    const detail = await getIssueDetail(cvIssueId);
    const volume = detail.issue.volume_id ? await getVolume(detail.issue.volume_id) : null;

    // Keep our own copy of the cover so the collection never depends on Comic Vine later.
    let cover_path: string | null = null;
    const imageUrl = chosenCover || detail.largeImage || detail.issue.image;
    const img = imageUrl ? await downloadCover(imageUrl) : null;
    if (img) {
      // A missing cover shouldn't stop the comic from being added, so upload errors are ignored.
      const path = `${user.id}/cv-${cvIssueId}-${crypto.randomUUID()}.${img.ext}`;
      const up = await sb.storage.from("covers").upload(path, img.bytes, { contentType: img.type });
      if (!up.error) cover_path = path;
    }

    const row = {
      user_id: user.id,
      status,
      cv_issue_id: cvIssueId,
      cv_volume_id: detail.issue.volume_id,
      series: volume?.name || detail.issue.volume_name || "Unknown series",
      volume_year: volume?.start_year || null,
      issue_number: detail.issue.issue_number,
      title: detail.issue.name,
      publisher: volume?.publisher || null,
      cover_date: detail.issue.cover_date,
      variant: variant || null,
      characters: detail.characters.slice(0, 200),
      creators: detail.creators.slice(0, 100),
      cover_path,
    };
    const { data, error } = await sb.from("comics").insert(row).select().single();
    if (error) {
      if (cover_path) await sb.storage.from("covers").remove([cover_path]);
      return NextResponse.json({ error: "Couldn't save it to your collection. Try again." }, { status: 500 });
    }
    return NextResponse.json({ comic: data });
  } catch (e) {
    return errorResponse(e);
  }
}
