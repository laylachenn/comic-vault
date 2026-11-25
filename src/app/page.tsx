"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Masthead } from "@/components/Masthead";
import { BulkBar } from "@/components/BulkEdit";
import { ComicCard, CoverImage } from "@/components/Cover";
import { useVault } from "@/components/VaultProvider";
import { groupSeries, isKey, issueSortValue, matches, seriesName, type SeriesGroup } from "@/lib/comics";
import { ExtrasBackfill } from "@/components/Reading";
import { MissingCovers } from "@/components/MissingCovers";
import { coverUrl } from "@/lib/supabase";

type View = "issues" | "series" | "wanted" | "keys";
const VIEWS: View[] = ["issues", "series", "wanted", "keys"];
type Sort = "series" | "added" | "year";

export default function Page() {
  return (
    <Suspense fallback={<div className="splash">Opening the vault…</div>}>
      <Masthead />
      <Collection />
    </Suspense>
  );
}

function SeriesCard({ g }: { g: SeriesGroup }) {
  const nums = g.items.map((c) => c.issue_number).filter(Boolean);
  return (
    <Link href={`/series?key=${encodeURIComponent(g.key)}`} className="cover">
      <div className="stack">
        {g.items.slice(0, 3).map((c) => (
          <CoverImage key={c.id} src={coverUrl(c.cover_path)} title={g.name} />
        ))}
      </div>
      <span className="t">{g.name}</span>
      <span className="s">
        {g.items.length} {g.items.length === 1 ? "issue" : "issues"}
        {nums.length ? ` · #${nums.slice(0, 6).join(", #")}${nums.length > 6 ? "…" : ""}` : ""}
      </span>
    </Link>
  );
}

function Collection() {
  const { comics, loaded, loadError } = useVault();
  const params = useSearchParams();
  const router = useRouter();
  const urlQ = params.get("q") ?? "";
  const [q, setQ] = useState(urlQ);
  const urlView = params.get("view") as View | null;
  const [view, setView] = useState<View>(urlView && VIEWS.includes(urlView) ? urlView : "issues");
  const [sort, setSort] = useState<Sort>("series");
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function stopSelecting() { setSelecting(false); setPicked(new Set()); }

  useEffect(() => setQ(urlQ), [urlQ]);

  function changeQuery(v: string) {
    setQ(v);
    router.replace(v ? `/?q=${encodeURIComponent(v)}` : "/", { scroll: false });
  }

  const owned = useMemo(() => comics.filter((c) => c.status === "owned"), [comics]);
  const wanted = useMemo(() => comics.filter((c) => c.status === "wanted"), [comics]);
  const ownedGroups = useMemo(() => groupSeries(owned), [owned]);

  const stats = useMemo(() => {
    const spent = owned.reduce((s, c) => s + (c.price_paid ?? 0), 0);
    return { read: owned.filter((c) => c.is_read).length, spent };
  }, [owned]);

  const query = q.trim();
  const keys = useMemo(() => owned.filter(isKey), [owned]);
  const base = view === "wanted" ? wanted : view === "keys" ? keys : owned;
  const hits = useMemo(() => {
    const list = base.filter((c) => matches(c, query));
    if (sort === "added") return list.sort((a, b) => b.created_at.localeCompare(a.created_at));
    if (sort === "year") return list.sort((a, b) => (a.cover_date || "9999").localeCompare(b.cover_date || "9999"));
    return list.sort((a, b) => seriesName(a).localeCompare(seriesName(b)) || issueSortValue(a.issue_number) - issueSortValue(b.issue_number));
  }, [base, query, sort]);

  const seriesHits = useMemo(
    () => (query && view !== "series" ? groupSeries(comics).filter((g) => g.name.toLowerCase().includes(query.toLowerCase())) : []),
    [comics, query, view],
  );

  return (
    <main className="wrap">
      <div className="searchbar">
        <input
          id="search" type="search" value={q} onChange={(e) => changeQuery(e.target.value)}
          placeholder="Search a character, series, issue, tag…" aria-label="Search your collection" autoComplete="off"
        />
        {q ? <button className="clear" aria-label="Clear search" onClick={() => changeQuery("")}>×</button> : null}
      </div>

      {loaded && !loadError ? (
        <div className="stats">
          <span><b>{owned.length}</b> comics</span>
          <span><b>{ownedGroups.length}</b> series</span>
          <span><b>{stats.read}</b> read</span>
          <span><b>{wanted.length}</b> on want list</span>
          {stats.spent > 0 ? <span><b>${stats.spent.toFixed(2)}</b> spent</span> : null}
        </div>
      ) : null}

      {loadError ? <p className="notice" role="alert">{loadError}</p> : null}
      {loaded && !loadError ? <MissingCovers /> : null}

      <div className="bar">
        <div className="tabs" role="group" aria-label="View">
          <button aria-pressed={view === "issues"} onClick={() => setView("issues")}>Issues</button>
          <button aria-pressed={view === "series"} onClick={() => { setView("series"); stopSelecting(); }}>Series</button>
          <button aria-pressed={view === "wanted"} onClick={() => setView("wanted")}>Want list</button>
          <button aria-pressed={view === "keys"} onClick={() => setView("keys")}>Keys</button>
        </div>
        {view !== "series" ? (
          <div className="actions">
          {comics.length && !selecting ? <button className="btn small" onClick={() => setSelecting(true)}>Select</button> : null}
          <label className="sort" htmlFor="sort">Sort
            <select id="sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="series">Series &amp; issue</option>
              <option value="added">Recently added</option>
              <option value="year">Cover date</option>
            </select>
          </label>
          </div>
        ) : null}
      </div>

      {!loaded ? (
        <div className="empty"><span className="spinner" /> Loading your comics…</div>
      ) : !comics.length ? (
        <div className="empty">
          <div className="box-art" />
          <h2>Your vault is empty</h2>
          <p>Tap <b>Add comic</b> and search a series like &ldquo;Scarlet Witch&rdquo; or &ldquo;Avengers #16&rdquo;. Pick your issue and its cover comes with it.</p>
          <Link href="/add" className="btn primary">+ Add your first comic</Link>
        </div>
      ) : (
        <>
          {seriesHits.length ? (
            <>
              <div className="section-label">Series</div>
              <div className="chips">
                {seriesHits.map((g) => (
                  <Link key={g.key} className="chip" href={`/series?key=${encodeURIComponent(g.key)}`}>{g.name}<b>{g.items.length}</b></Link>
                ))}
              </div>
            </>
          ) : null}
          {query ? (
            <div className="section-label">
              {hits.length} {hits.length === 1 ? "comic matches" : "comics match"} &ldquo;{query}&rdquo;{view === "wanted" ? " on your want list" : view === "keys" ? " among your key issues" : ""}
              {" · "}<Link href={`/characters?q=${encodeURIComponent(query)}`}>Every comic with &ldquo;{query}&rdquo; as a character</Link>
            </div>
          ) : null}

          {view === "series" ? (
            groupSeries(hits).length ? (
              <div className="grid">{groupSeries(hits).map((g) => <SeriesCard key={g.key} g={g} />)}</div>
            ) : <NoHits query={query} />
          ) : hits.length ? (
            <div className="grid">{hits.map((c) => (
              selecting
                ? <ComicCard key={c.id} comic={c} selected={picked.has(c.id)} onToggle={() => toggle(c.id)} />
                : <ComicCard key={c.id} comic={c} />
            ))}</div>
          ) : view === "wanted" && !query ? (
            <div className="empty"><p>Your want list is empty. On any series page, tap <b>Want</b> on an issue you&rsquo;re missing.</p></div>
          ) : view === "keys" && !query ? (
            <div className="empty"><p>No key issues yet. When a character&rsquo;s first appearance is in one of your comics, it shows up here.</p><ExtrasBackfill /></div>
          ) : (
            <NoHits query={query} />
          )}
        </>
      )}
      {selecting ? (
        <BulkBar
          selected={comics.filter((c) => picked.has(c.id))}
          visibleIds={view === "series" ? [] : hits.map((c) => c.id)}
          onSelectAll={() => setPicked((s) => new Set([...s, ...hits.map((c) => c.id)]))}
          onDone={stopSelecting}
        />
      ) : null}
    </main>
  );
}

function NoHits({ query }: { query: string }) {
  return (
    <div className="empty">
      <p>Nothing in your collection matches{query ? ` “${query}”` : ""}. Try a character, a series, or an issue number like #16.</p>
      {query ? <Link className="btn small" href={`/add?q=${encodeURIComponent(query)}`}>Search Comic Vine for “{query}”</Link> : null}
    </div>
  );
}
