"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Masthead } from "@/components/Masthead";
import { ExtrasBackfill } from "@/components/Reading";
import { useVault } from "@/components/VaultProvider";
import { api } from "@/lib/api";
import { arcsInCollection, groupSeries, isKey } from "@/lib/comics";
import type { Comic } from "@/lib/types";

export default function StatsPage() {
  return (
    <>
      <Masthead />
      <Stats />
    </>
  );
}

type Count = { label: string; n: number; href?: string };

/** Counts how often each value appears and returns the most common ones. */
function topCounts(values: string[], limit: number, href?: (v: string) => string): Count[] {
  const m = new Map<string, { label: string; n: number }>();
  for (const v of values) {
    const label = v.trim();
    if (!label) continue;
    const k = label.toLowerCase();
    const e = m.get(k);
    if (e) e.n++; else m.set(k, { label, n: 1 });
  }
  return [...m.values()]
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label))
    .slice(0, limit)
    .map((e) => ({ ...e, href: href?.(e.label) }));
}

/** "Brian Michael Bendis (writer)" → "Brian Michael Bendis". */
function creatorName(s: string) {
  return s.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

function Stats() {
  const { comics, loaded } = useVault();
  const owned = useMemo(() => comics.filter((c) => c.status === "owned"), [comics]);
  const groups = useMemo(() => groupSeries(owned), [owned]);

  const numbers = useMemo(() => {
    const read = owned.filter((c) => c.is_read).length;
    return {
      owned: owned.length,
      series: groups.length,
      read,
      readPct: owned.length ? Math.round((read / owned.length) * 100) : 0,
      wanted: comics.filter((c) => c.status === "wanted").length,
      keys: owned.filter(isKey).length,
      arcs: arcsInCollection(comics).length,
    };
  }, [owned, groups, comics]);

  const lists = useMemo(() => {
    const decade = (c: Comic) => {
      const y = Number((c.cover_date || "").slice(0, 4));
      return y > 1900 ? `${Math.floor(y / 10) * 10}s` : "";
    };
    const decades = topCounts(owned.map(decade), 20).sort((a, b) => a.label.localeCompare(b.label));
    return {
      characters: topCounts(owned.flatMap((c) => c.characters), 10, (v) => `/?q=${encodeURIComponent(v)}`),
      creators: topCounts(owned.flatMap((c) => [...new Set(c.creators.map(creatorName))]), 10, (v) => `/?q=${encodeURIComponent(v)}`),
      publishers: topCounts(owned.map((c) => c.publisher || ""), 8, (v) => `/?q=${encodeURIComponent(v)}`),
      decades,
    };
  }, [owned]);

  if (!loaded) return <main className="wrap"><div className="empty"><span className="spinner" /> Loading…</div></main>;

  return (
    <main className="wrap">
      <div className="page-head">
        <Link href="/" className="btn small back">← All comics</Link>
        <h2>Your collection in numbers</h2>
      </div>

      {!owned.length ? (
        <div className="empty"><p>Add some comics and your stats show up here.</p><Link href="/add" className="btn primary">+ Add comic</Link></div>
      ) : (
        <>
          <div className="tiles">
            <Tile n={numbers.owned} label={numbers.owned === 1 ? "comic" : "comics"} />
            <Tile n={numbers.series} label="series" />
            <Tile n={`${numbers.readPct}%`} label={`read (${numbers.read} of ${numbers.owned})`} href="/read" />
            <Tile n={numbers.keys} label={numbers.keys === 1 ? "key issue" : "key issues"} href="/?view=keys" />
            <Tile n={numbers.arcs} label={numbers.arcs === 1 ? "story arc" : "story arcs"} href="/read#arcs" />
            <Tile n={numbers.wanted} label="on your want list" href="/?view=wanted" />
          </div>

          <ExtrasBackfill />

          <RunCompleteness comics={owned} />

          <div className="stat-cols">
            <Ranked title="Characters you collect most" rows={lists.characters} unit="comic" />
            <Ranked title="Writers and artists" rows={lists.creators} unit="comic" />
            <Ranked title="Publishers" rows={lists.publishers} unit="comic" />
            <Ranked title="By decade" rows={lists.decades} unit="comic" note="By cover date" />
          </div>
        </>
      )}
    </main>
  );
}

function Tile({ n, label, href }: { n: number | string; label: string; href?: string }) {
  const body = <><b>{n}</b><span>{label}</span></>;
  return href ? <Link className="tile" href={href}>{body}</Link> : <div className="tile">{body}</div>;
}

/** One list of counts as bars on a shared scale, biggest first (or in their natural order). */
function Ranked({ title, rows, unit, note }: { title: string; rows: Count[]; unit: string; note?: string }) {
  if (!rows.length) return null;
  const max = Math.max(...rows.map((r) => r.n));
  return (
    <section className="stat-card">
      <h3>{title}</h3>
      {note ? <p className="hint">{note}</p> : null}
      <ol className="bars">
        {rows.map((r) => {
          const tip = `${r.label}: ${r.n} ${r.n === 1 ? unit : `${unit}s`}`;
          return (
            <li key={r.label} title={tip}>
              {r.href ? <Link href={r.href} className="bar-label">{r.label}</Link> : <span className="bar-label">{r.label}</span>}
              <span className="bar-track" aria-hidden="true"><span className="bar-fill" style={{ width: `${Math.max(2, (r.n / max) * 100)}%` }} /></span>
              <span className="bar-value"><span className="sr-only">{tip}</span><span aria-hidden="true">{r.n}</span></span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

type Run = { key: string; name: string; owned: number; total: number | null };

/** How many issues of each Comic Vine series you own, out of how many there are. */
function RunCompleteness({ comics }: { comics: Comic[] }) {
  const groups = useMemo(() => groupSeries(comics).filter((g) => g.cvVolumeId), [comics]);
  const manualCount = useMemo(() => groupSeries(comics).filter((g) => !g.cvVolumeId).length, [comics]);
  const [counts, setCounts] = useState<Record<number, number | null> | null>(null);
  const [error, setError] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [sort, setSort] = useState<"closest" | "most" | "name">("closest");
  const idsKey = groups.map((g) => g.cvVolumeId).join(",");

  useEffect(() => {
    if (!idsKey) { setCounts({}); return; }
    let cancelled = false;
    api<{ counts: Record<number, number | null> }>("/api/cv/volume-counts", { method: "POST", body: JSON.stringify({ ids: idsKey.split(",").map(Number) }) })
      .then((r) => { if (!cancelled) setCounts(r.counts); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load series sizes."); });
    return () => { cancelled = true; };
  }, [idsKey]);

  const runs: Run[] = useMemo(() => groups.map((g) => {
    const owned = new Set(g.items.map((c) => c.cv_issue_id).filter(Boolean)).size;
    const total = counts?.[g.cvVolumeId!] ?? null;
    return { key: g.key, name: g.name, owned, total: total ? Math.max(total, owned) : null };
  }), [groups, counts]);

  const pct = (r: Run) => (r.total ? r.owned / r.total : 0);
  const sorted = [...runs].sort((a, b) =>
    sort === "name" ? a.name.localeCompare(b.name)
      : sort === "most" ? b.owned - a.owned || a.name.localeCompare(b.name)
      // "Closest to done": complete runs first, then by fewest issues left, then by percent.
      : ((b.total ? b.owned === b.total : false) ? 1 : 0) - ((a.total ? a.owned === a.total : false) ? 1 : 0)
        || ((a.total ?? 1e9) - a.owned) - ((b.total ?? 1e9) - b.owned)
        || pct(b) - pct(a));
  const shown = showAll ? sorted : sorted.slice(0, 12);
  const complete = runs.filter((r) => r.total && r.owned >= r.total).length;

  return (
    <section className="stat-card runs">
      <div className="bulk-row">
        <h3>How complete each run is</h3>
        <span className="spacer" />
        <label className="sort" htmlFor="run-sort">Sort
          <select id="run-sort" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
            <option value="closest">Closest to done</option>
            <option value="most">Most issues owned</option>
            <option value="name">Name</option>
          </select>
        </label>
      </div>
      {counts ? (
        <p className="hint">
          {complete ? <><b>{complete} complete {complete === 1 ? "run" : "runs"}</b> · </> : null}
          {runs.length} {runs.length === 1 ? "series" : "series"} from Comic Vine
          {manualCount ? ` · ${manualCount} added by hand aren't counted (no issue total)` : ""}
        </p>
      ) : null}
      {error ? <p className="notice" role="alert">{error}</p> : null}
      {!counts && !error ? <div className="hint"><span className="spinner" /> Counting issues in each series…</div> : null}
      {counts ? (
        <ul className="meters">
          {shown.map((r) => {
            const done = !!r.total && r.owned >= r.total;
            const p = Math.round(pct(r) * 100);
            const figure = r.total ? `${r.owned} of ${r.total}` : `${r.owned} owned`;
            return (
              <li key={r.key}>
                <Link className="meter-name" href={`/series?key=${encodeURIComponent(r.key)}`}>{r.name}</Link>
                <span className="meter-track" role="img" aria-label={r.total ? `${p}% complete` : "Issue total unknown"}>
                  <span className={`meter-fill ${done ? "done" : ""}`} style={{ width: `${r.total ? Math.max(p, 2) : 0}%` }} />
                </span>
                <span className="meter-figure">
                  {done ? <b className="pill own">Complete</b> : <>{figure}{r.total ? <span className="muted"> · {r.total - r.owned} to go</span> : null}</>}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
      {counts && sorted.length > 12 ? (
        <button className="btn small" onClick={() => setShowAll((s) => !s)}>{showAll ? "Show fewer" : `Show all ${sorted.length} series`}</button>
      ) : null}
    </section>
  );
}
