/**
 * Reading comic barcodes: the main UPC/EAN code (which series) plus the 5-digit add-on
 * printed beside it (issue number, cover, printing).
 *
 * The decoder only finds an add-on when the white gap before it is under ~11 bar-widths,
 * but printed comics can use up to 12. So when the main code reads and the add-on doesn't,
 * we cut the extra white space out of the picture and read it again.
 */

export type Pixels = { data: Uint8ClampedArray; width: number; height: number; colorSpace?: "srgb" };
type Point = { x: number; y: number };
export type ReadHit = {
  text: string;
  extra?: string;
  isValid?: boolean;
  position: { topLeft: Point; topRight: Point; bottomLeft: Point; bottomRight: Point };
};
export type Reader = (img: Pixels, options: Record<string, unknown>) => Promise<ReadHit[]>;

export type ComicBarcode = { main: string; addon: string | null };
export type AddOn = { issue: string; cover: string; printing: string };

const READ_OPTIONS = { formats: ["EAN-13", "UPC-A"], eanAddOnSymbol: "Read", tryHarder: true, maxNumberOfSymbols: 1 };

function addonOf(hit: ReadHit): string | null {
  try {
    const a = JSON.parse(hit.extra || "{}").EanAddOn;
    return typeof a === "string" && /^\d{2}$|^\d{5}$/.test(a) ? a : null;
  } catch {
    return null;
  }
}

/** The main code as 12 digits for UPC-A (EAN-13 starting with 0) or 13 for other EANs. */
export function mainCode(hit: ReadHit): string {
  let digits = hit.text.replace(/\D/g, "");
  const addon = addonOf(hit);
  if (addon && digits.endsWith(addon) && digits.length > 13) digits = digits.slice(0, -addon.length);
  if (digits.length === 13 && digits.startsWith("0")) digits = digits.slice(1);
  return digits;
}

/** "00111" → issue 1, cover 1, printing 1. Two-digit add-ons (magazines) carry no issue number. */
export function parseAddOn(addon: string | null): AddOn | null {
  if (!addon || !/^\d{5}$/.test(addon)) return null;
  const issue = parseInt(addon.slice(0, 3), 10);
  if (!issue) return null;
  return { issue: String(issue), cover: addon[3], printing: addon[4] };
}

/** Builds a copy of the picture with the white gap before the add-on shrunk to ~8 bar-widths. */
export function squeezeAddOnGap(img: Pixels, pos: ReadHit["position"]): Pixels | null {
  const { width: w, height: h, data } = img;
  const left = Math.min(pos.topLeft.x, pos.bottomLeft.x);
  const right = Math.max(pos.topRight.x, pos.bottomRight.x);
  const span = right - left;
  if (span < 60) return null;
  if (Math.abs(pos.topRight.y - pos.topLeft.y) > span * 0.08) return null; // too tilted for a straight cut
  const module = span / 95; // UPC-A and EAN-13 are both 95 bar-widths wide
  // For 1D codes the decoder reports the line it read along, not the bars' full height,
  // so sample rows just around that line.
  const midY = (pos.topLeft.y + pos.topRight.y + pos.bottomLeft.y + pos.bottomRight.y) / 4;

  const gray = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    return (data[i] * 306 + data[i + 1] * 601 + data[i + 2] * 117) >> 10;
  };

  const found: number[] = [];
  for (const k of [-6, -3, 0, 3, 6]) {
    const y = Math.round(midY + k * module);
    if (y < 0 || y >= h) continue;
    let lo = 255, hi = 0;
    for (let x = Math.max(0, Math.floor(left)); x <= Math.min(w - 1, Math.ceil(right)); x++) {
      const g = gray(x, y);
      if (g < lo) lo = g;
      if (g > hi) hi = g;
    }
    if (hi - lo < 40) continue;
    const threshold = (lo + hi) / 2;
    const start = Math.ceil(right + 2 * module), end = Math.min(w - 1, Math.floor(right + 22 * module));
    for (let x = start; x <= end; x++) {
      if (gray(x, y) < threshold) { found.push(x); break; }
    }
  }
  if (!found.length) return null;
  found.sort((a, b) => a - b);
  const darkX = found[Math.floor(found.length / 2)];
  const target = Math.round(right + 8 * module);
  const remove = darkX - target;
  if (remove < module) return null; // gap is already narrow; nothing to gain

  const cut = Math.round(right + 4 * module);
  const nw = w - remove;
  const out = new Uint8ClampedArray(nw * h * 4);
  for (let y = 0; y < h; y++) {
    const row = y * w * 4, nrow = y * nw * 4;
    out.set(data.subarray(row, row + cut * 4), nrow);
    out.set(data.subarray(row + (cut + remove) * 4, row + w * 4), nrow + cut * 4);
  }
  return { data: out, width: nw, height: h, colorSpace: "srgb" };
}

/** Reads one picture. Returns the codes, or null if no comic barcode is in it. */
export async function readComicBarcode(read: Reader, img: Pixels): Promise<ComicBarcode | null> {
  const hit = (await read(img, READ_OPTIONS)).find((r) => r.isValid !== false);
  if (!hit) return null;
  const main = mainCode(hit);
  let addon = addonOf(hit);
  if (!addon) {
    const squeezed = squeezeAddOnGap(img, hit.position);
    if (squeezed) {
      const again = (await read(squeezed, READ_OPTIONS)).find((r) => r.isValid !== false && mainCode(r) === main);
      if (again) addon = addonOf(again);
    }
  }
  return { main, addon };
}
