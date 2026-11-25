import type { Comic } from "./types";

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

export function comicName(c: Comic): string {
  return [seriesName(c), issueLabel(c.issue_number)].filter(Boolean).join(" ");
}

function haystack(c: Comic): string {
  return [
    c.series, c.volume_year, issueLabel(c.issue_number), c.title, c.publisher, c.cover_date, c.variant,
    c.characters.join(" · "), c.creators.join(" · "), c.tags.join(" · "), c.location, c.notes, c.grade,
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

export function sameIssue(a: Comic, issueNumber: string | null, key: string): boolean {
  return seriesKey(a) === key && (a.issue_number || "").trim().toLowerCase() === (issueNumber || "").trim().toLowerCase();
}

const CSV_COLUMNS: (keyof Comic)[] = [
  "status", "series", "volume_year", "issue_number", "title", "publisher", "cover_date", "variant",
  "characters", "creators", "grade", "slabbed", "price_paid", "is_read", "location", "tags", "notes",
  "cv_issue_id", "created_at",
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
