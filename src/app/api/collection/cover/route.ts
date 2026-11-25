import { NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/server/auth";
import { downloadCover, isComicVineImage } from "@/lib/server/comicvine";

/**
 * POST /api/collection/cover  { comicId: string, imageUrl: string }
 * Switches one of your comics to a different Comic Vine cover picture (for example a variant).
 * Only Comic Vine picture addresses are accepted.
 */
export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;
  const { sb, user } = auth;

  const body = await req.json().catch(() => ({}));
  const comicId = typeof body.comicId === "string" ? body.comicId : "";
  const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl : "";
  if (!/^[0-9a-f-]{36}$/i.test(comicId) || !isComicVineImage(imageUrl)) {
    return NextResponse.json({ error: "That cover can't be used. Pick another." }, { status: 400 });
  }

  try {
    // The database rules only return comics that belong to this person.
    const { data: comic } = await sb.from("comics").select("id, cover_path").eq("id", comicId).maybeSingle();
    if (!comic) return NextResponse.json({ error: "That comic isn't in your collection." }, { status: 404 });

    const img = await downloadCover(imageUrl);
    if (!img) return NextResponse.json({ error: "Comic Vine didn't send that picture. Try another." }, { status: 502 });

    const path = `${user.id}/cover-${crypto.randomUUID()}.${img.ext}`;
    const up = await sb.storage.from("covers").upload(path, img.bytes, { contentType: img.type });
    if (up.error) return NextResponse.json({ error: "Couldn't save the cover. Try again." }, { status: 500 });

    const { data, error } = await sb.from("comics").update({ cover_path: path, updated_at: new Date().toISOString() }).eq("id", comicId).select().single();
    if (error) {
      await sb.storage.from("covers").remove([path]);
      return NextResponse.json({ error: "Couldn't save the cover. Try again." }, { status: 500 });
    }
    if (comic.cover_path) await sb.storage.from("covers").remove([comic.cover_path]);
    return NextResponse.json({ comic: data });
  } catch (e) {
    return errorResponse(e);
  }
}
