import { NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/server/auth";
import { CV_USER_AGENT, getIssueDetail, getVolume } from "@/lib/server/comicvine";

const MAX_COVER_BYTES = 8 * 1024 * 1024;

/**
 * POST /api/collection/add  { cvIssueId: number, status?: "owned" | "wanted" }
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
  if (!Number.isInteger(cvIssueId) || cvIssueId <= 0) {
    return NextResponse.json({ error: "That comic couldn't be found. Search again." }, { status: 400 });
  }

  try {
    const detail = await getIssueDetail(cvIssueId);
    const volume = detail.issue.volume_id ? await getVolume(detail.issue.volume_id) : null;

    // Keep our own copy of the cover so the collection never depends on Comic Vine later.
    let cover_path: string | null = null;
    const imageUrl = detail.largeImage || detail.issue.image;
    if (imageUrl && imageUrl.startsWith("https://")) {
      try {
        const img = await fetch(imageUrl, { headers: { "User-Agent": CV_USER_AGENT } });
        const type = img.headers.get("content-type") || "";
        if (img.ok && /^image\/(jpeg|png|webp|gif)$/.test(type.split(";")[0])) {
          const bytes = await img.arrayBuffer();
          if (bytes.byteLength > 0 && bytes.byteLength <= MAX_COVER_BYTES) {
            const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : type.includes("gif") ? "gif" : "jpg";
            const path = `${user.id}/cv-${cvIssueId}-${crypto.randomUUID()}.${ext}`;
            const up = await sb.storage.from("covers").upload(path, bytes, { contentType: type.split(";")[0] });
            if (!up.error) cover_path = path;
          }
        }
      } catch {
        // A missing cover shouldn't stop the comic from being added.
      }
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
