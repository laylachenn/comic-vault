import { NextResponse } from "next/server";
import { errorResponse, requireUser } from "@/lib/server/auth";
import { getCharacter } from "@/lib/server/comicvine";

/**
 * GET /api/cv/character?id=79420
 * → the character, plus the ids of every issue they appear in (newest first).
 *   Load the issues' details a page at a time with /api/cv/issues-by-id.
 */
export async function GET(req: Request) {
  const auth = await requireUser(req);
  if (auth instanceof NextResponse) return auth;

  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Pick a character first." }, { status: 400 });

  try {
    const { issueIds, ...character } = await getCharacter(id);
    return NextResponse.json({ character, issueIds });
  } catch (e) {
    return errorResponse(e);
  }
}
