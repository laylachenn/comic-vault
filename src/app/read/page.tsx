"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Masthead } from "@/components/Masthead";
import { CoverImage } from "@/components/Cover";
import { ExtrasBackfill, useMarkRead } from "@/components/Reading";
import { useVault } from "@/components/VaultProvider";
import { arcsInCollection, issueLabel, readingQueue, seriesName, type UpNext } from "@/lib/comics";
import { coverUrl } from "@/lib/supabase";
import type { Comic } from "@/lib/types";

export default function ReadPage() {
  return (
    <>
      <Masthead />
      <ReadNext />
    </>
  );
}

function ReadNext() {
  const { comics, loaded } = useVault();
  const { continuing, notStarted } = useMemo(() => readingQueue(comics), [comics]);
  const arcs = useMemo(() => arcsInCollection(comics).filter((a) => a.next && a.owned.length > 1), [comics]);
  const startedArcs = arcs.filter((a) => a.read > 0);
  const otherArcs = arcs.filter((a) => a.read === 0);
  const [showAllNew, setShowAllNew] = useState(false);

  if (!loaded) return <main className="wrap"><div className="empty"><span className="spinner" /> Loading…</div></main>;

  const nothing = !continuing.length && !notStarted.length;

  return (
    <main className="wrap">
      <div className="page-head">
        <Link href="/" className="btn small back">← All comics</Link>
        <h2>Read next</h2>
        <p className="meta">The next unread issue you own in each series, picking up after the last one you read.</p>
      </div>

      {nothing ? (
        <div className="empty">
          <p>{comics.some((c) => c.status === "owned") ? "You've read everything you own. Time to go shopping." : "Add some comics and your reading list shows up here."}</p>
        </div>
      ) : null}

      {continuing.length ? (
        <>
          <div className="section-label">Keep reading</div>
          <div className="grid">{continuing.map((u) => <UpNextCard key={u.key} u={u} />)}</div>
        </>
      ) : null}

      <div id="arcs" />
      {startedArcs.length || otherArcs.length ? (
        <>
          <div className="section-label">Story arcs you own parts of</div>
          <ul className="arc-list">
            {[...startedArcs, ...otherArcs].map((a) => (
              <li key={a.id}>
                <Link href={`/arc?id=${a.id}`} className="arc-row">
                  <CoverImage src={coverUrl(a.next?.cover_path ?? null)} title={a.name} issue={a.next?.issue_number} />
                  <span>
                    <span className="name">{a.name}</span><br />
                    <span className="sub">
                      {a.read ? `Read ${a.read} of the ${a.owned.length} you own` : `You own ${a.owned.length} parts, none read yet`}
                      {a.next ? <> · next: <b>{seriesName(a.next)} {issueLabel(a.next.issue_number)}</b></> : null}
                    </span>
                  </span>
                  <span className="count">Reading order →</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <ExtrasBackfill />

      {notStarted.length ? (
        <>
          <div className="section-label">Not started yet</div>
          <div className="grid">{(showAllNew ? notStarted : notStarted.slice(0, 12)).map((u) => <UpNextCard key={u.key} u={u} />)}</div>
          {notStarted.length > 12 ? (
            <div className="actions" style={{ justifyContent: "center", paddingBottom: 24 }}>
              <button className="btn small" onClick={() => setShowAllNew((s) => !s)}>{showAllNew ? "Show fewer" : `Show all ${notStarted.length}`}</button>
            </div>
          ) : null}
        </>
      ) : null}
    </main>
  );
}

function UpNextCard({ u }: { u: UpNext }) {
  const { markRead, busy } = useMarkRead();
  const c: Comic = u.next;
  return (
    <div className="cover">
      <Link href={`/comic?id=${c.id}`}><CoverImage src={coverUrl(c.cover_path)} title={u.name} issue={c.issue_number} /></Link>
      <span className="t">{u.name}</span>
      <span className="s">
        {u.read ? `Read ${u.read} · ${u.unread} to go` : `${u.unread} unread`}
      </span>
      <div className="card-actions">
        <button className="btn tiny primary" disabled={busy === c.id} onClick={() => markRead(c)}>
          {busy === c.id ? "Saving…" : "Mark read"}
        </button>
        <Link className="btn tiny" href={`/series?key=${encodeURIComponent(u.key)}`}>Series</Link>
      </div>
    </div>
  );
}
