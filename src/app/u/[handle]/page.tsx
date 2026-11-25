"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ComicCard, CoverImage } from "@/components/Cover";
import { useVault } from "@/components/VaultProvider";
import { groupSeries, issueSortValue, matches, seriesName, type SeriesGroup } from "@/lib/comics";
import { coverUrl, supabase } from "@/lib/supabase";
import type { Comic } from "@/lib/types";

type View = "issues" | "series" | "wanted";
const PAGE = 1000;

/** Shared rows leave out private fields; fill them with blanks so search and grouping work the same. */
function toComic(r: Partial<Comic>): Comic {
  return {
    user_id: "", cv_issue_id: null, creators: [], price_paid: null, is_read: false, location: null, notes: null, updated_at: "",
    ...r,
    characters: r.characters ?? [], tags: r.tags ?? [], slabbed: !!r.slabbed,
  } as Comic;
}

export default function SharedCollectionPage() {
  const handle = String(useParams<{ handle: string }>().handle ?? "").toLowerCase();
  const { session } = useVault();
  const [state, setState] = useState<"loading" | "missing" | "error" | "ready">("loading");
  const [showWanted, setShowWanted] = useState(false);
  const [comics, setComics] = useState<Comic[]>([]);
  const [q, setQ] = useState("");
  const [view, setView] = useState<View>("issues");
  const [openSeries, setOpenSeries] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sb = supabase();
      const prof = await sb.rpc("shared_profile", { p_handle: handle });
      if (cancelled) return;
      if (prof.error) { setState("error"); return; }
      const p = (prof.data as { handle: string; share_wanted: boolean }[])[0];
      if (!p) { setState("missing"); return; }
      const rows: Comic[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await sb.rpc("shared_comics", { p_handle: handle }).range(from, from + PAGE - 1);
        if (cancelled) return;
        if (error) { setState("error"); return; }
        rows.push(...(data as Partial<Comic>[]).map(toComic));
        if (data.length < PAGE) break;
      }
      setShowWanted(p.share_wanted);
      setComics(rows);
      setState("ready");
    })();
    return () => { cancelled = true; };
  }, [handle]);

  const owned = useMemo(() => comics.filter((c) => c.status === "owned"), [comics]);
  const wanted = useMemo(() => comics.filter((c) => c.status === "wanted"), [comics]);
  const base = view === "wanted" ? wanted : owned;
  const hits = useMemo(
    () => base.filter((c) => matches(c, q.trim()))
      .sort((a, b) => seriesName(a).localeCompare(seriesName(b)) || issueSortValue(a.issue_number) - issueSortValue(b.issue_number)),
    [base, q],
  );
  const groups = useMemo(() => groupSeries(owned), [owned]);
  const opened = openSeries ? groups.find((g) => g.key === openSeries) : null;

  return (
    <>
      <header className="mast">
        <div className="wrap mast-row">
          <span className="brand"><h1>{handle.toUpperCase()}&rsquo;S COMICS</h1></span>
          <nav className="mast-actions">
            <Link href={session ? "/" : "/login"} className="btn">{session ? "My vault" : "Start your own vault"}</Link>
          </nav>
        </div>
      </header>
      <main className="wrap">
        {state === "loading" ? <div className="empty"><span className="spinner" /> Loading the collection…</div> : null}
        {state === "missing" ? (
          <div className="empty"><div className="box-art" /><h2>Nothing to see here</h2><p>There&rsquo;s no shared collection called &ldquo;{handle}&rdquo;, or its owner has turned sharing off.</p></div>
        ) : null}
        {state === "error" ? <p className="notice" role="alert">This collection couldn&rsquo;t be loaded. Check your connection and reload the page.</p> : null}

        {state === "ready" && opened ? (
          <>
            <div className="page-head">
              <button className="btn small back" onClick={() => setOpenSeries(null)}>← All comics</button>
              <h2>{opened.name}</h2>
              <div className="meta">{[opened.publisher, `${opened.items.length} in this collection`].filter(Boolean).join(" · ")}</div>
              <div className="runline">Issues: <b>#{opened.items.map((c) => c.issue_number).filter(Boolean).join(", #")}</b></div>
            </div>
            <div className="grid" style={{ paddingTop: 12 }}>{opened.items.map((c) => <ComicCard key={c.id} comic={c} showSeries={false} href={null} />)}</div>
          </>
        ) : null}

        {state === "ready" && !opened ? (
          <>
            <div className="searchbar">
              <input id="shared-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a character, series, issue…" aria-label="Search this collection" autoComplete="off" />
              {q ? <button className="clear" aria-label="Clear search" onClick={() => setQ("")}>×</button> : null}
            </div>
            <div className="stats">
              <span><b>{owned.length}</b> comics</span>
              <span><b>{groups.length}</b> series</span>
              {showWanted ? <span><b>{wanted.length}</b> on want list</span> : null}
            </div>
            <div className="bar">
              <div className="tabs" role="group" aria-label="View">
                <button aria-pressed={view === "issues"} onClick={() => setView("issues")}>Issues</button>
                <button aria-pressed={view === "series"} onClick={() => setView("series")}>Series</button>
                {showWanted ? <button aria-pressed={view === "wanted"} onClick={() => setView("wanted")}>Want list</button> : null}
              </div>
            </div>
            {!comics.length ? (
              <div className="empty"><p>This collection is empty so far.</p></div>
            ) : view === "series" ? (
              <div className="grid">{groupSeries(hits).map((g) => <SharedSeriesCard key={g.key} g={g} onOpen={() => { setOpenSeries(g.key); window.scrollTo({ top: 0 }); }} />)}</div>
            ) : hits.length ? (
              <div className="grid">{hits.map((c) => <ComicCard key={c.id} comic={c} href={null} />)}</div>
            ) : (
              <div className="empty"><p>{q ? `Nothing here matches “${q}”.` : view === "wanted" ? "The want list is empty." : "Nothing here yet."}</p></div>
            )}
          </>
        ) : null}
      </main>
    </>
  );
}

function SharedSeriesCard({ g, onOpen }: { g: SeriesGroup; onOpen: () => void }) {
  return (
    <button type="button" className="cover" onClick={onOpen}>
      <div className="stack">{g.items.slice(0, 3).map((c) => <CoverImage key={c.id} src={coverUrl(c.cover_path)} title={g.name} />)}</div>
      <span className="t">{g.name}</span>
      <span className="s">{g.items.length} {g.items.length === 1 ? "issue" : "issues"}</span>
    </button>
  );
}
