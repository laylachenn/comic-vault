"use client";

import { useMemo, useState } from "react";
import { supabase, coverUrl } from "@/lib/supabase";
import { shrinkPhoto } from "@/lib/comics";
import type { Comic, ComicInput, Status } from "@/lib/types";
import { useVault } from "./VaultProvider";
import { TagInput } from "./TagInput";

type Draft = {
  status: Status;
  series: string; issue_number: string; volume_year: string; publisher: string; cover_date: string;
  title: string; variant: string; characters: string[];
  grade: string; slabbed: boolean; price_paid: string; is_read: boolean; location: string; tags: string[]; notes: string;
};

function toDraft(c: ComicInput | undefined): Draft {
  return {
    status: c?.status ?? "owned",
    series: c?.series ?? "", issue_number: c?.issue_number ?? "", volume_year: c?.volume_year ?? "",
    publisher: c?.publisher ?? "", cover_date: c?.cover_date ?? "", title: c?.title ?? "", variant: c?.variant ?? "",
    characters: c?.characters ?? [],
    grade: c?.grade ?? "", slabbed: c?.slabbed ?? false, price_paid: c?.price_paid != null ? String(c.price_paid) : "",
    is_read: c?.is_read ?? false, location: c?.location ?? "", tags: c?.tags ?? [], notes: c?.notes ?? "",
  };
}

const uniq = (xs: (string | null | undefined)[]) =>
  [...new Set(xs.map((x) => (x ?? "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** Add a comic by hand, or edit any comic's details. */
export function ComicForm({ comic, defaults, onDone, onCancel, submitLabel }: {
  comic?: Comic;
  defaults?: ComicInput;
  onDone: (c: Comic) => void;
  onCancel?: () => void;
  submitLabel?: string;
}) {
  const { comics, putLocal, session } = useVault();
  const [d, setD] = useState<Draft>(() => toDraft(comic ?? defaults));
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const p = comic ? `edit-${comic.id}` : "new";

  const sug = useMemo(() => ({
    series: uniq(comics.map((c) => c.series)),
    publishers: uniq(comics.map((c) => c.publisher)),
    characters: uniq(comics.flatMap((c) => c.characters)),
    tags: uniq(["Key issue", "First appearance", "Signed", "Variant", ...comics.flatMap((c) => c.tags)]),
    locations: uniq(comics.map((c) => c.location)),
  }), [comics]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!d.series.trim()) { setError("Add the series name."); return; }
    const price = d.price_paid.trim() ? Number(d.price_paid.replace(/[$,]/g, "")) : null;
    if (price != null && (!Number.isFinite(price) || price < 0)) { setError("Price paid should be a number, like 4.99."); return; }
    setSaving(true);
    setError("");
    const sb = supabase();
    let newPath: string | null = null;
    try {
      if (photo) {
        const blob = await shrinkPhoto(photo);
        newPath = `${session!.user.id}/${newId()}.jpg`;
        const up = await sb.storage.from("covers").upload(newPath, blob, { contentType: "image/jpeg" });
        if (up.error) throw new Error("The cover photo couldn't be uploaded. Try again.");
      }
      const row = {
        status: d.status,
        series: d.series.trim(), issue_number: d.issue_number.trim().replace(/^#/, "") || null,
        volume_year: d.volume_year.trim() || null, publisher: d.publisher.trim() || null,
        cover_date: d.cover_date.trim() || null, title: d.title.trim() || null, variant: d.variant.trim() || null,
        characters: d.characters,
        grade: d.grade.trim() || null, slabbed: d.slabbed, price_paid: price, is_read: d.is_read,
        location: d.location.trim() || null, tags: d.tags, notes: d.notes.trim() || null,
        ...(newPath ? { cover_path: newPath } : {}),
        ...(comic ? { updated_at: new Date().toISOString() } : {}),
      };
      const res = comic
        ? await sb.from("comics").update(row).eq("id", comic.id).select().single()
        : await sb.from("comics").insert(row).select().single();
      if (res.error) throw new Error("Couldn't save. Check your connection and try again.");
      if (newPath && comic?.cover_path) await sb.storage.from("covers").remove([comic.cover_path]);
      putLocal(res.data as Comic);
      onDone(res.data as Comic);
    } catch (err) {
      if (newPath) await sb.storage.from("covers").remove([newPath]).catch(() => {});
      setError(err instanceof Error ? err.message : "Couldn't save. Try again.");
      setSaving(false);
    }
  }

  const shownCover = preview || coverUrl(comic?.cover_path);

  return (
    <form className="comic-form" onSubmit={save}>
      <div className="photo-field">
        <div className="img photo-preview">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {shownCover ? <img src={shownCover} alt="Cover" /> : <div className="no-cover"><span>No cover yet</span></div>}
        </div>
        <label className="btn small" htmlFor={`${p}-photo`}>{shownCover ? "Replace photo" : "Add cover photo"}</label>
        <input
          id={`${p}-photo`} className="file-hidden" type="file" accept="image/*"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setPhoto(f);
            if (preview) URL.revokeObjectURL(preview);
            setPreview(f ? URL.createObjectURL(f) : null);
          }}
        />
      </div>

      <div className="form-body">
        <fieldset>
          <legend>The comic</legend>
          <div className="fields">
            <div className="field w4">
              <label htmlFor={`${p}-series`}>Series *</label>
              <input id={`${p}-series`} list={`${p}-series-list`} value={d.series} onChange={(e) => set("series", e.target.value)} autoComplete="off" required />
              <datalist id={`${p}-series-list`}>{sug.series.map((s) => <option key={s} value={s} />)}</datalist>
            </div>
            <div className="field w2">
              <label htmlFor={`${p}-issue`}>Issue #</label>
              <input id={`${p}-issue`} value={d.issue_number} onChange={(e) => set("issue_number", e.target.value)} inputMode="text" autoComplete="off" />
            </div>
            <div className="field w2">
              <label htmlFor={`${p}-vol`}>Volume year</label>
              <input id={`${p}-vol`} value={d.volume_year} onChange={(e) => set("volume_year", e.target.value)} inputMode="numeric" placeholder="1963" autoComplete="off" />
            </div>
            <div className="field w2">
              <label htmlFor={`${p}-pub`}>Publisher</label>
              <input id={`${p}-pub`} list={`${p}-pub-list`} value={d.publisher} onChange={(e) => set("publisher", e.target.value)} autoComplete="off" />
              <datalist id={`${p}-pub-list`}>{sug.publishers.map((s) => <option key={s} value={s} />)}</datalist>
            </div>
            <div className="field w2">
              <label htmlFor={`${p}-date`}>Cover date</label>
              <input id={`${p}-date`} value={d.cover_date} onChange={(e) => set("cover_date", e.target.value)} placeholder="1965-05" autoComplete="off" />
            </div>
            <div className="field w3">
              <label htmlFor={`${p}-title`}>Story title</label>
              <input id={`${p}-title`} value={d.title} onChange={(e) => set("title", e.target.value)} autoComplete="off" />
            </div>
            <div className="field w3">
              <label htmlFor={`${p}-variant`}>Variant</label>
              <input id={`${p}-variant`} value={d.variant} onChange={(e) => set("variant", e.target.value)} placeholder="e.g. 1:25 Ross cover" autoComplete="off" />
            </div>
          </div>
          <TagInput id={`${p}-chars`} label="Characters (press Enter after each)" value={d.characters} onChange={(v) => set("characters", v)} suggestions={sug.characters} placeholder="Scarlet Witch" />
        </fieldset>

        <fieldset>
          <legend>Your copy</legend>
          <div className="fields">
            <div className="field w2">
              <label htmlFor={`${p}-status`}>In collection?</label>
              <select id={`${p}-status`} value={d.status} onChange={(e) => set("status", e.target.value as Status)}>
                <option value="owned">I own it</option>
                <option value="wanted">On my want list</option>
              </select>
            </div>
            <div className="field w2">
              <label htmlFor={`${p}-grade`}>Grade / condition</label>
              <input id={`${p}-grade`} value={d.grade} onChange={(e) => set("grade", e.target.value)} placeholder="NM 9.4" autoComplete="off" />
            </div>
            <div className="field w2">
              <label htmlFor={`${p}-price`}>Price paid</label>
              <input id={`${p}-price`} value={d.price_paid} onChange={(e) => set("price_paid", e.target.value)} inputMode="decimal" placeholder="4.99" autoComplete="off" />
            </div>
            <div className="field w3">
              <label htmlFor={`${p}-loc`}>Where it&rsquo;s kept</label>
              <input id={`${p}-loc`} list={`${p}-loc-list`} value={d.location} onChange={(e) => set("location", e.target.value)} placeholder="Box 3" autoComplete="off" />
              <datalist id={`${p}-loc-list`}>{sug.locations.map((s) => <option key={s} value={s} />)}</datalist>
            </div>
            <div className="field w3 checks">
              <label className="check"><input type="checkbox" checked={d.is_read} onChange={(e) => set("is_read", e.target.checked)} /> Read it</label>
              <label className="check"><input type="checkbox" checked={d.slabbed} onChange={(e) => set("slabbed", e.target.checked)} /> Graded slab</label>
            </div>
          </div>
          <TagInput id={`${p}-tags`} label="Tags" value={d.tags} onChange={(v) => set("tags", v)} suggestions={sug.tags} placeholder="Key issue" />
          <div className="field wide">
            <label htmlFor={`${p}-notes`}>Notes</label>
            <textarea id={`${p}-notes`} value={d.notes} onChange={(e) => set("notes", e.target.value)} rows={3} />
          </div>
        </fieldset>

        {error ? <p className="error" role="alert">{error}</p> : null}
        <div className="actions">
          <button className="btn primary" type="submit" disabled={saving}>{saving ? "Saving…" : submitLabel ?? (comic ? "Save changes" : "Add to collection")}</button>
          {onCancel ? <button className="btn" type="button" onClick={onCancel} disabled={saving}>Cancel</button> : null}
        </div>
      </div>
    </form>
  );
}
