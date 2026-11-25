"use client";

import Link from "next/link";
import { Fragment, Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Masthead } from "@/components/Masthead";
import { CoverImage } from "@/components/Cover";
import { ComicForm } from "@/components/ComicForm";
import { useVault } from "@/components/VaultProvider";
import { comicName, seriesKey, seriesName } from "@/lib/comics";
import { coverUrl, supabase } from "@/lib/supabase";
import type { Comic } from "@/lib/types";

export default function Page() {
  return (
    <Suspense fallback={<div className="splash">Opening the vault…</div>}>
      <Masthead />
      <ComicView />
    </Suspense>
  );
}

function ComicView() {
  const id = useSearchParams().get("id") ?? "";
  const { comics, loaded } = useVault();
  const comic = comics.find((c) => c.id === id);

  if (!loaded) return <main className="wrap"><div className="empty"><span className="spinner" /> Loading…</div></main>;
  if (!comic) {
    return (
      <main className="wrap">
        <div className="empty"><p>That comic isn&rsquo;t in your collection anymore.</p><Link className="btn small" href="/">Back to your comics</Link></div>
      </main>
    );
  }
  return <main className="wrap"><ComicDetail comic={comic} /></main>;
}

function ComicDetail({ comic: c }: { comic: Comic }) {
  const router = useRouter();
  const { putLocal, removeLocal, toast } = useVault();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (editing) {
    return (
      <>
        <div className="page-head">
          <button className="btn small back" onClick={() => setEditing(false)}>← Back</button>
          <h2>Edit {comicName(c)}</h2>
        </div>
        <ComicForm comic={c} onDone={() => { setEditing(false); toast("Saved"); }} onCancel={() => setEditing(false)} />
      </>
    );
  }

  async function markOwned() {
    setBusy(true);
    const { data, error } = await supabase().from("comics").update({ status: "owned", updated_at: new Date().toISOString() }).eq("id", c.id).select().single();
    setBusy(false);
    if (error) { toast("Couldn't update it. Try again."); return; }
    putLocal(data as Comic);
    toast("Moved to your collection");
  }

  async function remove() {
    setBusy(true);
    const { error } = await supabase().from("comics").delete().eq("id", c.id);
    if (error) { setBusy(false); toast("Couldn't remove it. Try again."); return; }
    if (c.cover_path) await supabase().storage.from("covers").remove([c.cover_path]);
    removeLocal(c.id);
    toast("Removed");
    router.push("/");
  }

  const rows: [string, string | null][] = [
    ["Publisher", c.publisher],
    ["Cover date", c.cover_date],
    ["Story", c.title],
    ["Variant", c.variant],
    ["Grade", [c.grade, c.slabbed ? "graded slab" : null].filter(Boolean).join(", ") || null],
    ["Paid", c.price_paid != null ? `$${Number(c.price_paid).toFixed(2)}` : null],
    ["Read", c.status === "owned" ? (c.is_read ? "Yes" : "Not yet") : null],
    ["Kept in", c.location],
  ];

  return (
    <div className="detail">
      <CoverImage src={coverUrl(c.cover_path)} title={seriesName(c)} issue={c.issue_number} />
      <div className="info">
        <div className="actions">
          <button className="btn small back" onClick={() => router.back()}>← Back</button>
        </div>
        {c.status === "wanted" ? <span><b className="pill want">On your want list</b></span> : null}
        <h2>{comicName(c)}</h2>
        <dl className="kv">
          {rows.filter(([, v]) => v).map(([k, v]) => (<Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>))}
        </dl>

        {c.characters.length ? (
          <div>
            <div className="section-label" style={{ marginTop: 0 }}>Characters</div>
            <div className="chips">
              {c.characters.map((n) => <Link key={n} className="tag" href={`/?q=${encodeURIComponent(n)}`}>{n}</Link>)}
            </div>
          </div>
        ) : null}

        {c.tags.length ? (
          <div className="chips">{c.tags.map((t) => <Link key={t} className="tag" href={`/?q=${encodeURIComponent(t)}`}>{t}</Link>)}</div>
        ) : null}

        {c.notes ? <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{c.notes}</p> : null}

        {c.creators.length ? (
          <details>
            <summary>Creators ({c.creators.length})</summary>
            <p className="hint">{c.creators.join(" · ")}</p>
          </details>
        ) : null}

        <div className="actions">
          {c.status === "wanted" ? <button className="btn small primary" disabled={busy} onClick={markOwned}>Got it!</button> : null}
          <button className="btn small" onClick={() => setEditing(true)}>Edit details</button>
          <Link className="btn small" href={`/series?key=${encodeURIComponent(seriesKey(c))}`}>See the whole series</Link>
          <button className="btn small danger" onClick={() => setConfirming(true)}>Remove</button>
        </div>

        {confirming ? (
          <div className="confirm" role="alertdialog" aria-label="Confirm removal">
            <span>Remove {comicName(c)} from your {c.status === "wanted" ? "want list" : "collection"}? This can&rsquo;t be undone.</span>
            <div className="actions">
              <button className="btn small danger" disabled={busy} onClick={remove}>{busy ? "Removing…" : "Yes, remove it"}</button>
              <button className="btn small" onClick={() => setConfirming(false)}>Keep it</button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
