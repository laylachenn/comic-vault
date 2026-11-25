import { NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/server/auth";
import { searchCharacters } from "@/lib/server/comicvine";

/** GET /api/cv/characters?q=miles morales → matching characters on Comic Vine, most-appearing first. */
export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;

  const q = (new URL(req.url).searchParams.get("q") || "").trim().slice(0, 100);
  if (q.length < 2) return NextResponse.json({ characters: [] });

  try {
    return NextResponse.json({ characters: await searchCharacters(q) });
  } catch (e) {
    return errorResponse(e);
  }
}
