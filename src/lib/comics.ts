import type { Comic, CvVolume } from "./types";

/** Orders issue numbers like a collector would: 1, 2, 10, 10.1, then annuals/specials. */
export function issueSortValue(issue: string | null | undefined): number {
  const s = (issue ?? "").toLowerCase();
  const m = s.match(/-?\d+(\.\d+)?/);
  const n = m ? parseFloat(m[0]) : 1e6;
  const special = /annual|special|giant|king|\bai\b/.test(s) ? 1 : 0;
  return special * 1e7 + n;
}

export function issueLabel(issue: string | null | undefined): string {
  const s = (issue ?? "").trim().replace(/^#/, "");
  return s ? `#${s}` : "";
}

export function seriesKey(c: Pick<Comic, "cv_volume_id" | "series" | "volume_year">): string {
  if (c.cv_volume_id) return `cv-${c.cv_volume_id}`;
  return `m-${(c.series || "").trim().toLowerCase()}|${(c.volume_year || "").trim()}`;
}

export function seriesName(c: Pick<Comic, "series" | "volume_year">): string {
  const y = (c.volume_year || "").trim();
  return (c.series || "Unknown series").trim() + (y ? ` (${y})` : "");
}

/** "Avengers (2018–2023)", "Avengers (2023–present)" or "Avengers (1996)" for a Comic Vine series. */
export function volumeTitle(v: Pick<CvVolume, "name" | "start_year"> & Partial<Pick<CvVolume, "end_year" | "ongoing">>): string {
  const start = (v.start_year || "").trim();
  let years = start;
  if (start && v.ongoing) years = `${start}–present`;
  else if (start && v.end_year && v.end_year > start) years = `${start}–${v.end_year}`;
  return v.name + (years ? ` (${years})` : "");
}

export function comicName(c: Comic): string {
  return [seriesName(c), issueLabel(c.issue_number)].filter(Boolean).join(" ");
}

function haystack(c: Comic): string {
  return [
    c.series, c.volume_year, issueLabel(c.issue_number), c.title, c.publisher, c.cover_date, c.variant,
    c.characters.join(" · "), c.creators.join(" · "), c.tags.join(" · "), c.location, c.notes, c.grade,
    c.first_appearances?.length ? `key 1st first appearance ${c.first_appearances.join(" · ")}` : null,
    (c.story_arcs ?? []).map((a) => a.name).join(" · "),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/** Every word in the search must appear somewhere in the comic's details. */
export function matches(c: Comic, q: string): boolean {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean).map((w) => w.replace(/^#/, ""));
  if (!words.length) return true;
  const h = haystack(c);
  return words.every((w) => h.includes(w));
}

export type SeriesGroup = { key: string; name: string; publisher: string; cvVolumeId: number | null; items: Comic[] };

export function groupSeries(list: Comic[]): SeriesGroup[] {
  const map = new Map<string, SeriesGroup>();
  for (const c of list) {
    const k = seriesKey(c);
    let g = map.get(k);
    if (!g) {
      g = { key: k, name: seriesName(c), publisher: c.publisher || "", cvVolumeId: c.cv_volume_id, items: [] };
      map.set(k, g);
    }
    g.items.push(c);
  }
  for (const g of map.values()) g.items.sort((a, b) => issueSortValue(a.issue_number) - issueSortValue(b.issue_number));
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** True when a character's first appearance is in this comic. */
export function isKey(c: { first_appearances?: string[] | null }): boolean {
  return !!c.first_appearances?.length;
}

/** "1st appearance of Miles Morales", or "1st appearances of A, B and 2 more". */
export function keyLine(names: string[], max = 3): string {
  if (!names.length) return "";
  const shown = names.slice(0, max).join(", ");
  const more = names.length > max ? ` and ${names.length - max} more` : "";
  return `1st appearance${names.length > 1 ? "s" : ""} of ${shown}${more}`;
}

export type UpNext = {
  key: string;
  name: string;
  next: Comic;
  /** Unread issues you own in this series, counting the next one. */
  unread: number;
  read: number;
  /** When you last marked something in this series read (roughly). */
  lastReadAt: string;
};

/**
 * What to read next in each series you own: the first unread issue after the highest one
 * you've read (or the first unread one if you've read past everything). Copies of the same
 * issue count once, and an issue counts as read if any copy is.
 */
export function readingQueue(comics: Comic[]): { continuing: UpNext[]; notStarted: UpNext[] } {
  const continuing: UpNext[] = [];
  const notStarted: UpNext[] = [];
  for (const g of groupSeries(comics.filter((c) => c.status === "owned"))) {
    const byIssue = new Map<string, Comic[]>();
    for (const c of g.items) {
      const k = (c.issue_number || c.id).trim().toLowerCase();
      byIssue.set(k, [...(byIssue.get(k) ?? []), c]);
    }
    const issues = [...byIssue.values()].map((copies) => ({ copy: copies.find((c) => c.is_read) ?? copies[0], read: copies.some((c) => c.is_read) }));
    const unread = issues.filter((i) => !i.read);
    if (!unread.length) continue;
    const readCount = issues.length - unread.length;
    let lastRead = -1;
    issues.forEach((i, idx) => { if (i.read) lastRead = idx; });
    const next = issues.slice(lastRead + 1).find((i) => !i.read) ?? unread[0];
    const entry: UpNext = {
      key: g.key,
      name: g.name,
      next: next.copy,
      unread: unread.length,
      read: readCount,
      lastReadAt: issues.filter((i) => i.read).reduce((m, i) => (i.copy.updated_at > m ? i.copy.updated_at : m), ""),
    };
    (readCount ? continuing : notStarted).push(entry);
  }
  continuing.sort((a, b) => b.lastReadAt.localeCompare(a.lastReadAt) || a.name.localeCompare(b.name));
  notStarted.sort((a, b) => a.name.localeCompare(b.name));
  return { continuing, notStarted };
}

export type ArcProgress = { id: number; name: string; owned: Comic[]; read: number; next: Comic | null };

/** Story arcs you own part of, with how far you've read. Parts are ordered by cover date here; the arc page uses Comic Vine's reading order. */
export function arcsInCollection(comics: Comic[]): ArcProgress[] {
  const map = new Map<number, ArcProgress>();
  for (const c of comics) {
    if (c.status !== "owned") continue;
    for (const a of c.story_arcs ?? []) {
      let p = map.get(a.id);
      if (!p) { p = { id: a.id, name: a.name, owned: [], read: 0, next: null }; map.set(a.id, p); }
      if (!p.owned.some((o) => o.cv_issue_id && o.cv_issue_id === c.cv_issue_id)) p.owned.push(c);
    }
  }
  const readIds = new Set(comics.filter((c) => c.is_read && c.cv_issue_id).map((c) => c.cv_issue_id));
  const isRead = (c: Comic) => c.is_read || (c.cv_issue_id ? readIds.has(c.cv_issue_id) : false);
  for (const p of map.values()) {
    p.owned.sort((a, b) => (a.cover_date || "9999").localeCompare(b.cover_date || "9999") || issueSortValue(a.issue_number) - issueSortValue(b.issue_number));
    p.read = p.owned.filter(isRead).length;
    p.next = p.owned.find((c) => !isRead(c)) ?? null;
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function sameIssue(a: Comic, issueNumber: string | null, key: string): boolean {
  return seriesKey(a) === key && (a.issue_number || "").trim().toLowerCase() === (issueNumber || "").trim().toLowerCase();
}

const CSV_COLUMNS: (keyof Comic)[] = [
  "status", "series", "volume_year", "issue_number", "title", "publisher", "cover_date", "variant",
  "characters", "creators", "grade", "slabbed", "price_paid", "is_read", "location", "tags", "notes",
  "first_appearances", "cv_issue_id", "created_at",
];

export function toCsv(list: Comic[]): string {
  const cell = (v: unknown) => {
    const s = Array.isArray(v) ? v.join("; ") : v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [CSV_COLUMNS.join(","), ...list.map((c) => CSV_COLUMNS.map((k) => cell(c[k])).join(","))].join("\n");
}

/** Shrinks a photo to a reasonable JPEG before uploading it. */
export async function shrinkPhoto(file: File, max = 1400): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("That photo couldn't be opened. Try a JPEG or PNG."))), "image/jpeg", 0.86),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function splitList(s: string): string[] {
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}
