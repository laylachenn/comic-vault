import "server-only";
import type { CvIssue, CvVolume } from "../types";

const BASE = "https://comicvine.gamespot.com/api";
// Comic Vine rejects requests without a real User-Agent.
export const CV_USER_AGENT = "ComicVault/0.1 (personal comic collection app)";

export class CvError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

type CvImage = { super_url?: string; medium_url?: string; small_url?: string; thumb_url?: string; original_url?: string } | null;

/**
 * Calls the Comic Vine API from the server only, so the key never reaches the browser.
 * `revalidate` caches answers (in seconds) to stay well inside Comic Vine's rate limit.
 */
export async function cv<T = unknown>(path: string, params: Record<string, string>, revalidate: number): Promise<T> {
  const key = process.env.COMICVINE_API_KEY;
  if (!key) throw new CvError("The Comic Vine key is missing. Add COMICVINE_API_KEY to .env.local and restart the site.", 500);

  const qs = new URLSearchParams({ ...params, api_key: key, format: "json" });
  let res: Response;
  try {
    res = await fetch(`${BASE}/${path}/?${qs}`, {
      headers: { "User-Agent": CV_USER_AGENT, Accept: "application/json" },
      next: { revalidate },
    });
  } catch {
    throw new CvError("Couldn't reach Comic Vine. Try again in a moment.", 502);
  }

  if (res.status === 420 || res.status === 429) {
    throw new CvError("Comic Vine is limiting requests right now. Wait a few minutes and try again.", 429);
  }
  if (res.status === 401 || res.status === 403) {
    throw new CvError("Comic Vine refused the request. Check that COMICVINE_API_KEY is correct.", 502);
  }
  if (!res.ok) throw new CvError(`Comic Vine didn't answer (HTTP ${res.status}). Try again.`, 502);

  const body = (await res.json().catch(() => null)) as { status_code?: number; results?: unknown } | null;
  if (!body) throw new CvError("Comic Vine sent back something unreadable. Try again.", 502);
  switch (body.status_code) {
    case 1:
      return body as T;
    case 100:
      throw new CvError("Comic Vine rejected the API key. Check COMICVINE_API_KEY in .env.local.", 500);
    case 101:
      throw new CvError("Comic Vine doesn't have that comic.", 404);
    case 107:
      throw new CvError("Comic Vine is limiting requests right now. Wait a few minutes and try again.", 429);
    default:
      throw new CvError("Comic Vine couldn't answer that request. Try again.", 502);
  }
}

function pickImage(img: CvImage, size: "medium" | "large" = "medium"): string | null {
  if (!img) return null;
  const url = size === "large"
    ? img.super_url || img.original_url || img.medium_url
    : img.medium_url || img.small_url || img.super_url;
  // Comic Vine's "no cover" placeholder isn't worth showing or saving.
  if (!url || /blank\.(png|gif|jpg)/i.test(url)) return null;
  return url;
}

type RawVolume = { id: number; name: string; start_year?: string | null; publisher?: { name?: string } | null; count_of_issues?: number | null; image?: CvImage };
type RawIssue = { id: number; name?: string | null; issue_number?: string | null; cover_date?: string | null; image?: CvImage; volume?: { id?: number; name?: string } | null };

export function mapVolume(v: RawVolume): CvVolume {
  return {
    id: v.id,
    name: v.name,
    start_year: v.start_year || null,
    publisher: v.publisher?.name || null,
    count_of_issues: v.count_of_issues ?? null,
    image: pickImage(v.image ?? null),
  };
}

export function mapIssue(i: RawIssue): CvIssue {
  return {
    id: i.id,
    name: i.name || null,
    issue_number: i.issue_number || null,
    cover_date: i.cover_date || null,
    image: pickImage(i.image ?? null),
    volume_id: i.volume?.id ?? null,
    volume_name: i.volume?.name ?? null,
  };
}

export const VOLUME_FIELDS = "id,name,start_year,publisher,count_of_issues,image";
export const ISSUE_FIELDS = "id,name,issue_number,cover_date,image,volume";

export type RawIssueDetail = RawIssue & {
  associated_images?: { original_url?: string }[];
  character_credits?: { name: string }[];
  person_credits?: { name: string; role?: string }[];
};

export async function getIssueDetail(id: number) {
  const body = await cv<{ results: RawIssueDetail }>(
    `issue/4000-${id}`,
    { field_list: `${ISSUE_FIELDS},character_credits,person_credits,associated_images` },
    86400,
  );
  const r = body.results;
  return {
    issue: mapIssue(r),
    largeImage: pickImage(r.image ?? null, "large"),
    // Other cover pictures Comic Vine has for this issue (usually variants). They aren't labeled reliably.
    otherCovers: (r.associated_images || [])
      .map((a) => a.original_url || "")
      .filter((u) => isComicVineImage(u) && !/blank\.(png|gif|jpg)/i.test(u))
      .slice(0, 24),
    characters: (r.character_credits || []).map((c) => c.name).filter(Boolean),
    creators: (r.person_credits || []).map((p) => (p.role ? `${p.name} (${p.role})` : p.name)).filter(Boolean),
  };
}

/** True only for picture addresses on Comic Vine's own server, so we never fetch anything else. */
export function isComicVineImage(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && (u.hostname === "comicvine.gamespot.com" || u.hostname.endsWith(".gamespot.com")) && u.pathname.startsWith("/a/uploads/");
  } catch {
    return false;
  }
}

const MAX_COVER_BYTES = 8 * 1024 * 1024;

/** Downloads a Comic Vine picture. Returns null if it isn't a usable image. */
export async function downloadCover(url: string): Promise<{ bytes: ArrayBuffer; type: string; ext: string } | null> {
  if (!isComicVineImage(url)) return null;
  try {
    const res = await fetch(url, { headers: { "User-Agent": CV_USER_AGENT }, redirect: "error" });
    const type = (res.headers.get("content-type") || "").split(";")[0];
    if (!res.ok || !/^image\/(jpeg|png|webp|gif)$/.test(type)) return null;
    const bytes = await res.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > MAX_COVER_BYTES) return null;
    const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : type.includes("gif") ? "gif" : "jpg";
    return { bytes, type, ext };
  } catch {
    return null;
  }
}

export async function getVolume(id: number): Promise<CvVolume> {
  const body = await cv<{ results: RawVolume }>(`volume/4050-${id}`, { field_list: VOLUME_FIELDS }, 86400);
  return mapVolume(body.results);
}
