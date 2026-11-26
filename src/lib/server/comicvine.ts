import "server-only";
import type { CvCharacter, CvIssue, CvStoryArc, CvVolume, StoryArcRef } from "../types";

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

export type RawVolume = {
  id: number; name: string; start_year?: string | null; publisher?: { name?: string } | null; count_of_issues?: number | null; image?: CvImage;
  last_issue?: { id?: number } | null;
};

/**
 * Publishers that mostly put out translated or local reprints of American comics, and the
 * country each one sells in. Comic Vine lists these editions alongside the originals under the
 * same name, which makes a search for "Avengers" a wall of look-alikes.
 * More specific names come first ("Panini Verlag" before plain "Panini").
 */
const REPRINT_PUBLISHERS: [RegExp, string][] = [
  [/^panini (verlag|deutschland)/i, "German"],
  [/^panini france/i, "French"],
  [/^panini (españa|espana)/i, "Spanish"],
  [/^panini (uk|books uk)/i, "UK"],
  [/^panini (brasil|brazil)/i, "Brazilian"],
  [/^panini (méxico|mexico)/i, "Mexican"],
  [/^panini (italia|italy)/i, "Italian"],
  [/^egmont polska/i, "Polish"],
  [/^egmont (ehapa|verlag)|^ehapa|^carlsen|^dino comics|^bastei|^marvel deutschland|^dark horse deutschland/i, "German"],
  [/^editorial (televisa|vid|novaro)/i, "Mexican"],
  [/^(editora )?abril\b|^mythos/i, "Brazilian"],
  [/^planeta|^planet deagostini|^ecc ediciones|^ediciones zinco|^salvat|^norma editorial/i, "Spanish"],
  [/^ovni press/i, "Argentine"],
  [/^urban comics|^hachette|^marvel france|^lug\b|^aredit|^soleil us comics/i, "French"],
  [/^mondadori|^rw (edizioni|lion)|^star comics|^marvel italia/i, "Italian"],
  [/^levoir|^g\. ?floy/i, "Portuguese"],
  [/^eaglemoss|^thorpe & porter|^world distributors|^l\. miller/i, "UK"],
  [/^newton comics|^horwitz|^k\. ?g\. murray|^yaffa/i, "Australian"],
  // These names cover several countries, so we can only say it's a reprint.
  [/^panini|^egmont|^semic/i, ""],
];

/** "German edition" for a known reprint publisher, "Reprint edition" if the country is unclear, else null. */
export function reprintEdition(publisher: string | null): string | null {
  const p = (publisher || "").trim();
  if (!p) return null;
  for (const [re, country] of REPRINT_PUBLISHERS) if (re.test(p)) return `${country || "Reprint"} edition`;
  return null;
}

type RawIssue = { id: number; name?: string | null; issue_number?: string | null; cover_date?: string | null; image?: CvImage; volume?: { id?: number; name?: string } | null };

export function mapVolume(v: RawVolume): CvVolume {
  return {
    id: v.id,
    name: v.name,
    start_year: v.start_year || null,
    publisher: v.publisher?.name || null,
    count_of_issues: v.count_of_issues ?? null,
    image: pickImage(v.image ?? null),
    end_year: null,
    ongoing: false,
    edition: reprintEdition(v.publisher?.name || null),
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

export const VOLUME_FIELDS = "id,name,start_year,publisher,count_of_issues,image,last_issue";

/**
 * Fills in the year each series' last issue came out, so look-alike series read as
 * "Avengers (2018–2023)" instead of just "Avengers (2018)". One Comic Vine request covers up to 100 series.
 */
export async function addRunYears(raw: RawVolume[]): Promise<CvVolume[]> {
  const volumes = raw.map(mapVolume);
  const lastIds = raw.map((v) => v.last_issue?.id).filter((id): id is number => Number.isInteger(id) && id! > 0);
  if (!lastIds.length) return volumes;
  let dates: Map<number, string>;
  try {
    const body = await cv<{ results: { id: number; cover_date?: string | null }[] }>(
      "issues",
      { filter: `id:${[...new Set(lastIds)].slice(0, 100).join("|")}`, field_list: "id,cover_date", limit: "100" },
      86400,
    );
    dates = new Map((body.results || []).filter((i) => i.cover_date).map((i) => [i.id, i.cover_date!]));
  } catch {
    return volumes; // The years are a nice extra; never fail the search over them.
  }
  // Cover dates run a couple of months ahead of the shelf date, so anything dated in the
  // last few months (or later) is a series still coming out.
  const recent = new Date();
  recent.setMonth(recent.getMonth() - 4);
  const cutoff = recent.toISOString().slice(0, 10);
  return volumes.map((v, i) => {
    const date = dates.get(raw[i].last_issue?.id ?? 0);
    if (!date) return v;
    const ongoing = date >= cutoff && (v.count_of_issues ?? 0) > 1;
    return { ...v, end_year: date.slice(0, 4), ongoing };
  });
}
export const ISSUE_FIELDS = "id,name,issue_number,cover_date,image,volume";

export type RawIssueDetail = RawIssue & {
  associated_images?: { original_url?: string }[];
  character_credits?: { id: number; name: string }[];
  person_credits?: { name: string; role?: string }[];
  story_arc_credits?: { id: number; name: string }[];
};

export async function getIssueDetail(id: number) {
  const body = await cv<{ results: RawIssueDetail }>(
    `issue/4000-${id}`,
    { field_list: `${ISSUE_FIELDS},character_credits,person_credits,associated_images,story_arc_credits` },
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
    characterIds: (r.character_credits || []).map((c) => c.id).filter((id) => Number.isInteger(id) && id > 0),
    storyArcs: (r.story_arc_credits || [])
      .filter((a) => Number.isInteger(a.id) && a.id > 0 && a.name)
      .map((a): StoryArcRef => ({ id: a.id, name: a.name.trim() })),
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

/** Works out the picture format from a file's first bytes. */
function imageKind(bytes: ArrayBuffer): { type: string; ext: string } | null {
  const b = new Uint8Array(bytes.slice(0, 12));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { type: "image/jpeg", ext: "jpg" };
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { type: "image/png", ext: "png" };
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return { type: "image/gif", ext: "gif" };
  const ascii = (from: number, to: number) => String.fromCharCode(...b.slice(from, to));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return { type: "image/webp", ext: "webp" };
  return null;
}

/**
 * Downloads a Comic Vine picture. Returns null if it isn't a usable image.
 * Comic Vine labels many of its pictures "application/octet-stream" instead of an image type,
 * so the format is read from the file itself rather than trusted from the label.
 */
export async function downloadCover(url: string): Promise<{ bytes: ArrayBuffer; type: string; ext: string } | null> {
  if (!isComicVineImage(url)) return null;
  try {
    const res = await fetch(url, { headers: { "User-Agent": CV_USER_AGENT }, redirect: "error" });
    if (!res.ok) return null;
    const bytes = await res.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > MAX_COVER_BYTES) return null;
    const kind = imageKind(bytes);
    return kind ? { bytes, ...kind } : null;
  } catch {
    return null;
  }
}

export async function getVolume(id: number, withRunYears = false): Promise<CvVolume> {
  const body = await cv<{ results: RawVolume }>(`volume/4050-${id}`, { field_list: VOLUME_FIELDS }, 86400);
  return withRunYears ? (await addRunYears([body.results]))[0] : mapVolume(body.results);
}

/** Splits a list into chunks of `size` (Comic Vine's id filters take up to 100 at a time). */
function chunks<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

type RawFirstIssue = { id?: number; name?: string | null; issue_number?: string | null } | null;

/**
 * The characters who first appear in an issue, and the story arcs it belongs to.
 * Comic Vine's own "first appearances" field on issues is almost always empty, so instead we
 * look up each character in the issue and check which issue they first appeared in.
 */
export async function getIssueExtras(issueId: number): Promise<{ firstAppearances: string[]; storyArcs: StoryArcRef[] }> {
  const detail = await getIssueDetail(issueId);
  const ids = [...new Set(detail.characterIds)].slice(0, 300);
  const firstAppearances: string[] = [];
  for (const group of chunks(ids, 100)) {
    const body = await cv<{ results: { id: number; name: string; first_appeared_in_issue?: RawFirstIssue }[] }>(
      "characters",
      { filter: `id:${group.join("|")}`, field_list: "id,name,first_appeared_in_issue", limit: "100" },
      86400,
    );
    for (const c of body.results || []) if (c.first_appeared_in_issue?.id === issueId && c.name) firstAppearances.push(c.name.trim());
  }
  return { firstAppearances: firstAppearances.sort((a, b) => a.localeCompare(b)), storyArcs: detail.storyArcs };
}

/** Up to 100 issues by their Comic Vine ids, in no particular order. */
export async function getIssuesByIds(ids: number[]): Promise<CvIssue[]> {
  const clean = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))].slice(0, 100);
  if (!clean.length) return [];
  const body = await cv<{ results: RawIssue[] }>(
    "issues",
    { filter: `id:${clean.join("|")}`, field_list: ISSUE_FIELDS, limit: "100" },
    86400,
  );
  return (body.results || []).map(mapIssue);
}

/** How many issues each series has on Comic Vine, keyed by series id. */
export async function getVolumeCounts(ids: number[]): Promise<Record<number, number | null>> {
  const clean = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))].slice(0, 1000);
  const out: Record<number, number | null> = {};
  for (const group of chunks(clean, 100)) {
    const body = await cv<{ results: { id: number; count_of_issues?: number | null }[] }>(
      "volumes",
      { filter: `id:${group.join("|")}`, field_list: "id,count_of_issues", limit: "100" },
      86400,
    );
    for (const v of body.results || []) out[v.id] = v.count_of_issues ?? null;
  }
  return out;
}

type RawCharacter = {
  id: number; name: string; real_name?: string | null; publisher?: { name?: string } | null; image?: CvImage;
  count_of_issue_appearances?: number | null; first_appeared_in_issue?: RawFirstIssue;
};
const CHARACTER_FIELDS = "id,name,real_name,publisher,image,count_of_issue_appearances,first_appeared_in_issue";

function mapCharacter(c: RawCharacter): CvCharacter {
  const f = c.first_appeared_in_issue;
  return {
    id: c.id,
    name: (c.name || "").trim(),
    real_name: c.real_name?.trim() || null,
    publisher: c.publisher?.name || null,
    image: pickImage(c.image ?? null),
    appearances: c.count_of_issue_appearances ?? null,
    first_issue: f?.id ? { id: f.id, name: f.name || null, issue_number: f.issue_number || null } : null,
  };
}

export async function searchCharacters(q: string): Promise<CvCharacter[]> {
  const body = await cv<{ results: RawCharacter[] }>(
    "search",
    { query: q, resources: "character", field_list: CHARACTER_FIELDS, limit: "30" },
    3600,
  );
  // Most-used characters first, so "Miles Morales" beats a one-off namesake.
  return (body.results || []).map(mapCharacter).sort((a, b) => (b.appearances ?? 0) - (a.appearances ?? 0));
}

// A popular character's issue list is several megabytes, too big for Next's fetch cache,
// so the last few are kept in memory here instead.
const characterCache = new Map<number, { at: number; value: CvCharacter & { issueIds: number[] } }>();

/** A character and the ids of every issue they appear in (newest first, as Comic Vine lists them). */
export async function getCharacter(id: number): Promise<CvCharacter & { issueIds: number[] }> {
  const hit = characterCache.get(id);
  if (hit && Date.now() - hit.at < 6 * 3600_000) return hit.value;
  const body = await cv<{ results: RawCharacter & { issue_credits?: { id: number }[] } }>(
    `character/4005-${id}`,
    { field_list: `${CHARACTER_FIELDS},issue_credits` },
    0,
  );
  const value = {
    ...mapCharacter(body.results),
    issueIds: (body.results.issue_credits || []).map((i) => i.id).filter((n) => Number.isInteger(n) && n > 0),
  };
  characterCache.set(id, { at: Date.now(), value });
  if (characterCache.size > 30) characterCache.delete(characterCache.keys().next().value!);
  return value;
}

export async function getStoryArc(id: number): Promise<CvStoryArc> {
  const body = await cv<{ results: { id: number; name: string; deck?: string | null; publisher?: { name?: string } | null; image?: CvImage; issues?: { id: number }[] } }>(
    `story_arc/4045-${id}`,
    { field_list: "id,name,deck,publisher,image,issues" },
    86400,
  );
  const r = body.results;
  return {
    id: r.id,
    name: (r.name || "").trim(),
    deck: r.deck?.trim() || null,
    publisher: r.publisher?.name || null,
    image: pickImage(r.image ?? null),
    issueIds: [...new Set((r.issues || []).map((i) => i.id).filter((n) => Number.isInteger(n) && n > 0))],
  };
}
