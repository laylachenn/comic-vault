"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Masthead } from "@/components/Masthead";
import { CoverImage } from "@/components/Cover";
import { ComicForm } from "@/components/ComicForm";
import { CvIssueCard, useAddFromCv, useCvIssues } from "@/components/CvIssues";
import { CvRangeAdd } from "@/components/RangeAdd";
import { seriesKey, volumeTitle } from "@/lib/comics";
import { useVault } from "@/components/VaultProvider";
import { api } from "@/lib/api";
import type { CvVolume } from "@/lib/types";

export default function Page() {
  return (
    <Suspense fallback={<div className="splash">Opening the vault…</div>}>
      <Masthead />
      <AddComic />
    </Suspense>
  );
}

/** "Avengers #16" → { name: "Avengers", issue: "16" }. Only a "#" marks an issue number, so "Spider-Man 2099" stays a name. */
function parseQuery(q: string) {
  const m = q.match(/^(.*?)\s*#\s*([\w.\-]+)\s*$/);
  return m && m[1].trim() ? { name: m[1].trim(), issue: m[2] } : { name: q.trim(), issue: "" };
}

function AddComic() {
  const params = useSearchParams();
  const router = useRouter();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [volumes, setVolumes] = useState<CvVolume[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState<{ id: number; issue: string } | null>(null);
  const [manual, setManual] = useState(false);
  const ran = useRef(false);
  const pendingIssue = useRef("");

  async function search(text = q) {
    const { name, issue } = parseQuery(text);
    if (name.length < 2) { setError("Type at least two letters of a series name."); return; }
    setSearching(true);
    setError("");
    setPicked(null);
    router.replace(`/add?q=${encodeURIComponent(text)}`, { scroll: false });
    try {
      const { volumes } = await api<{ volumes: CvVolume[] }>(`/api/cv/volumes?q=${encodeURIComponent(name)}`);
      setVolumes(volumes);
      pendingIssue.current = issue;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed. Try again.");
      setVolumes(null);
    } finally {
      setSearching(false);
    }
  }

  useEffect(() => {
    if (!ran.current && q.trim()) { ran.current = true; search(q); }
    // run once for a ?q= link
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (manual) {
    return (
      <main className="wrap">
        <div className="page-head">
          <button className="btn small back" onClick={() => setManual(false)}>← Back to search</button>
          <h2>Add a comic by hand</h2>
          <p className="meta">For anything Comic Vine doesn&rsquo;t have. Snap your own cover photo.</p>
        </div>
        <ComicForm defaults={{ series: parseQuery(q).name, issue_number: parseQuery(q).issue }} onDone={(c, added) => router.push(added > 1 ? `/series?key=${encodeURIComponent(seriesKey(c))}` : `/comic?id=${c.id}`)} onCancel={() => setManual(false)} />
      </main>
    );
  }

  return (
    <main className="wrap">
      <div className="page-head">
        <h2>Add a comic</h2>
        <p className="meta">Search for the series, pick it, then tap the issue you have.</p>
      </div>
      <form className="searchbar" onSubmit={(e) => { e.preventDefault(); search(); }} role="search">
        <input id="cv-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder='Try "Scarlet Witch" or "Avengers #16"' autoComplete="off" aria-label="Search Comic Vine" autoFocus />
      </form>
      <div className="actions" style={{ marginTop: 10 }}>
        <button className="btn small primary" onClick={() => search()} disabled={searching}>{searching ? "Searching…" : "Search"}</button>
        <Link className="btn small" href="/scan">Scan a barcode</Link>
        <Link className="btn small" href={q.trim() ? `/characters?q=${encodeURIComponent(parseQuery(q).name)}` : "/characters"}>Search by character</Link>
        <button className="btn small" onClick={() => setManual(true)}>Add by hand instead</button>
      </div>

      {error ? <p className="notice" role="alert">{error}</p> : null}

      {picked ? (
        <IssuePicker volumeId={picked.id} issueFilter={picked.issue} onBack={() => setPicked(null)} onClearFilter={() => setPicked({ id: picked.id, issue: "" })} />
      ) : volumes ? (
        volumes.length ? (
          <div className="results">
            <div className="section-label">{volumes.length} series found. Pick yours.</div>
            {volumes.map((v) => (
              <button key={v.id} className={`vol${v.edition ? " reprint" : ""}`} onClick={() => setPicked({ id: v.id, issue: pendingIssue.current })}>
                <CoverImage src={v.image} title={v.name} />
                <span>
                  <span className="name">{volumeTitle(v)}</span><br />
                  <span className="sub">{v.publisher || "Unknown publisher"}{v.edition ? <span className="reprint-tag">{v.edition}</span> : null}</span>
                </span>
                <span className="count">{v.count_of_issues ?? "?"} issues</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="empty">
            <p>Comic Vine didn&rsquo;t find a series called &ldquo;{parseQuery(q).name}&rdquo;. Check the spelling, try fewer words, or add it by hand.</p>
            <button className="btn small" onClick={() => setManual(true)}>Add by hand</button>
          </div>
        )
      ) : null}
    </main>
  );
}

function IssuePicker({ volumeId, issueFilter, onBack, onClearFilter }: { volumeId: number; issueFilter: string; onBack: () => void; onClearFilter: () => void }) {
  const { comics } = useVault();
  const { volume, issues, total, loading, error, hasMore, loadMore, retry } = useCvIssues(volumeId, issueFilter);
  const { add, busy } = useAddFromCv();
  const title = volume ? volumeTitle(volume) : "Loading series…";
  const mineByIssue = useMemo(() => {
    const m = new Map<number, typeof comics>();
    for (const c of comics) if (c.cv_issue_id) m.set(c.cv_issue_id, [...(m.get(c.cv_issue_id) ?? []), c]);
    return m;
  }, [comics]);

  return (
    <section>
      <div className="page-head">
        <button className="btn small back" onClick={onBack}>← Other series</button>
        <h2>{title}</h2>
        <p className="meta">
          {volume?.publisher ? `${volume.publisher} · ` : ""}
          {issueFilter ? `Showing issue #${issueFilter}. ` : `${total} issues. `}
          <Link href={`/series?key=cv-${volumeId}`}>See your run of this series</Link>
        </p>
        {issueFilter ? <button className="linkish" style={{ justifySelf: "start" }} onClick={onClearFilter}>Show every issue</button> : null}
        <div className="actions"><CvRangeAdd volumeId={volumeId} volumeName={volume?.name ?? ""} /></div>
      </div>
      {error ? <p className="notice" role="alert">{error} <button className="linkish" onClick={retry}>Try again</button></p> : null}
      {!loading && !error && !issues.length ? (
        <div className="empty"><p>{issueFilter ? `No issue #${issueFilter} in this series.` : "Comic Vine has no issues listed for this series yet."}</p>
          {issueFilter ? <button className="btn small" onClick={onClearFilter}>Show every issue</button> : null}</div>
      ) : null}
      <div className="grid" style={{ paddingTop: 12 }}>
        {issues.map((i) => (
          <CvIssueCard key={i.id} issue={i} mine={mineByIssue.get(i.id) ?? []} busy={!!busy[i.id]} seriesTitle={volume?.name ?? ""}
            onAdd={(status, existing, coverUrl) => add({ ...i, volume_name: i.volume_name ?? volume?.name ?? null }, status, existing, { coverUrl })} />
        ))}
      </div>
      {loading ? <div className="empty"><span className="spinner" /> Loading issues…</div> : null}
      {hasMore && !loading ? <div className="actions" style={{ justifyContent: "center", paddingBottom: 32 }}><button className="btn" onClick={loadMore}>Load more issues</button></div> : null}
    </section>
  );
}
