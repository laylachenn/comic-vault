"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { shrinkPhoto } from "@/lib/comics";
import { supabase } from "@/lib/supabase";
import type { Comic } from "@/lib/types";
import { useVault } from "./VaultProvider";

type Cover = { full: string; thumb: string };

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/**
 * Change a comic's cover: tap one of Comic Vine's pictures for the issue (variants included),
 * or take a photo of your own copy.
 */
export function CoverChooser({ comic, intro, onClose }: { comic: Comic; intro?: string; onClose: () => void }) {
  const { putLocal, toast, session } = useVault();
  const [covers, setCovers] = useState<Cover[] | null>(comic.cv_issue_id ? null : []);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!comic.cv_issue_id) return;
    let cancelled = false;
    api<{ covers: Cover[] }>(`/api/cv/covers?issue=${comic.cv_issue_id}`)
      .then((r) => { if (!cancelled) setCovers(r.covers); })
      .catch((e) => { if (!cancelled) { setCovers([]); setLoadError(e instanceof Error ? e.message : "Couldn't load the covers."); } });
    return () => { cancelled = true; };
  }, [comic.cv_issue_id]);

  async function pick(c: Cover) {
    setBusy(c.full);
    setError("");
    try {
      const { comic: saved } = await api<{ comic: Comic }>("/api/collection/cover", { method: "POST", body: JSON.stringify({ comicId: comic.id, imageUrl: c.full }) });
      putLocal(saved);
      toast("Cover changed");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't change the cover. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function usePhoto(file: File) {
    setBusy("photo");
    setError("");
    const sb = supabase();
    const path = `${session!.user.id}/${newId()}.jpg`;
    try {
      const blob = await shrinkPhoto(file);
      const up = await sb.storage.from("covers").upload(path, blob, { contentType: "image/jpeg" });
      if (up.error) throw new Error("The photo couldn't be uploaded. Try again.");
      const { data, error } = await sb.from("comics").update({ cover_path: path, updated_at: new Date().toISOString() }).eq("id", comic.id).select().single();
      if (error) { await sb.storage.from("covers").remove([path]); throw new Error("Couldn't save the cover. Try again."); }
      if (comic.cover_path) await sb.storage.from("covers").remove([comic.cover_path]);
      putLocal(data as Comic);
      toast("Cover changed");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't use that photo. Try again.");
    } finally {
      setBusy(null);
    }
  }

  const others = covers && covers.length > 1;

  return (
    <section className="chooser" aria-label="Change cover">
      <div className="bulk-row">
        <b>{intro ?? "Change the cover"}</b>
        <span className="spacer" />
        <button className="btn small" onClick={onClose} disabled={!!busy}>Close</button>
      </div>
      <p className="hint">
        {others ? "Tap the cover that matches your copy. Comic Vine doesn't label which is which, so go by the picture. " : ""}
        You can also take a photo of your own copy.
      </p>
      <div className="actions">
        <label className="btn small primary" htmlFor={`cover-photo-${comic.id}`}>{busy === "photo" ? "Saving photo…" : "Take a photo of the front"}</label>
        <input id={`cover-photo-${comic.id}`} className="file-hidden" type="file" accept="image/*" capture="environment" disabled={!!busy}
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) usePhoto(f); }} />
      </div>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {loadError ? <p className="hint">{loadError}</p> : null}
      {covers === null ? <div className="empty"><span className="spinner" /> Loading Comic Vine&rsquo;s covers…</div> : null}
      {covers?.length ? (
        <div className="cover-grid">
          {covers.map((c, i) => (
            <button key={c.full} type="button" className="cover-option" onClick={() => pick(c)} disabled={!!busy} aria-label={i === 0 ? "Main cover" : `Other cover ${i}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.thumb} alt="" loading="lazy" />
              <span>{busy === c.full ? "Saving…" : i === 0 ? "Main cover" : `Other ${i}`}</span>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
