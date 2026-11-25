"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Masthead } from "@/components/Masthead";
import { ComicCard, CoverImage } from "@/components/Cover";
import { CvIssueCard, useAddFromCv } from "@/components/CvIssues";
import { useVault } from "@/components/VaultProvider";
import { api } from "@/lib/api";
import { issueLabel, issueSortValue, seriesName } from "@/lib/comics";
import type { Comic, CvCharacter, CvIssue } from "@/lib/types";

const PAGE = 48;

export default function Page() {
  return (
    <Suspense fallback={<div className="splash">Opening the vault…</div>}>
      <Masthead />
      <CharacterView />
    </Suspense>
  );
}

function CharacterView() {
  const id = Number(useSearchParams().get("id"));
  const { comics } = useVault();
  const { add, busy } = useAddFromCv();
  const [character, setCharacter] = useState<CvCharacter | null>(null);
  const [issueIds, setIssueIds] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"mine" | "all">("mine");
  const [order, setOrder] = useState<"newest" | "oldest">("newest");
  const [loadedIssues, setLoadedIssues] = useState<CvIssue[]>([]);
  const [pageError, setPageError] = useState("");
  const [loadingPage, setLoadingPage] = useState(false);

  useEffect(() => {
    if (!Number.isInteger(id) || id <= 0) { setError("That character link is broken."); return; }
    let cancelled = false;
    setCharacter(null);
    setError("");
    api<{ character: CvCharacter; issueIds: number[] }>(`/api/cv/character?id=${id}`)
      .then((r) => { if (cancelled) return; setCharacter(r.character); setIssueIds(r.issueIds); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load this character."); });
    return () => { cancelled = true; };
  }, [id]);

  const idSet = useMemo(() => new Set(issueIds), [issueIds]);
  const mineByIssue = useMemo(() => {
    const m = new Map<number, Comic[]>();
    for (const c of comics) if (c.cv_issue_id) m.set(c.cv_issue_id, [...(m.get(c.cv_issue_id) ?? []), c]);
    return m;
  }, [comics]);
  const mine = useMemo(
    () => comics.filter((c) => c.cv_issue_id && idSet.has(c.cv_issue_id))
      .sort((a, b) => seriesName(a).localeCompare(seriesName(b)) || issueSortValue(a.issue_number) - issueSortValue(b.issue_number)),
    [comics, idSet],
  );
  const ownedMine = mine.filter((c) => c.status === "owned");
  const ownedIssueCount = new Set(ownedMine.map((c) => c.cv_issue_id)).size;

  // Comic Vine lists a character's issues roughly newest first.
  const ordered = useMemo(() => (order === "newest" ? issueIds : [...issueIds].reverse()), [issueIds, order]);

  const loadPage = useCallback(async (from: number): Promise<boolean> => {
    const ids = ordered.slice(from, from + PAGE);
    if (!ids.length) return false;
    setLoadingPage(true);
    setPageError("");
    try {
      const { issues } = await api<{ issues: CvIssue[] }>(`/api/cv/issues-by-id?ids=${ids.join(",")}`);
      setLoadedIssues((prev) => (from === 0 ? issues : [...prev, ...issues]));
      return true;
    } catch (e) {
      setPageError(e instanceof Error ? e.message : "Couldn't load more comics.");
      return false;
    } finally {
      setLoadingPage(false);
    }
  }, [ordered]);

  // Start the "every appearance" list over whenever the order changes.
  const [loadedFrom, setLoadedFrom] = useState(0);
  useEffect(() => {
    if (tab !== "all" || !ordered.length) return;
    setLoadedIssues([]);
    setLoadedFrom(0);
    loadPage(0).then((ok) => { if (ok) setLoadedFrom(PAGE); });
  }, [tab, ordered, loadPage]);

  if (error) return <main className="wrap"><p className="notice" role="alert">{error}</p><Link className="btn small" href="/characters">← Find a character</Link></main>;
  if (!character) return <main className="wrap"><div className="empty"><span className="spinner" /> Loading every appearance… popular characters take a few seconds.</div></main>;

  const first = character.first_issue;
  const ownFirst = first ? (mineByIssue.get(first.id) ?? []).some((c) => c.status === "owned") : false;

  return (
    <main className="wrap">
      <div className="character-head">
        <CoverImage src={character.image} title={character.name} />
        <div className="page-head">
          <Link href="/characters" className="btn small back">← Find a character</Link>
          <h2>{character.name}</h2>
          <div className="meta">{[character.real_name && character.real_name !== character.name ? character.real_name : null, character.publisher].filter(Boolean).join(" · ")}</div>
          <div className="runline">
            In <b>{issueIds.length.toLocaleString()}</b> comics · you own <b>{ownedIssueCount}</b>
            {mine.length > ownedMine.length ? <> · <b>{new Set(mine.filter((c) => c.status === "wanted").map((c) => c.cv_issue_id)).size}</b> on your want list</> : null}
          </div>
          {first ? (
            <div className="runline">
              First appearance: <b>{first.name ? `“${first.name}” ` : ""}{issueLabel(first.issue_number)}</b>{" "}
              {ownFirst ? <b className="pill own">You have it</b> : null}
              {" "}<FirstIssueLink issueId={first.id} />
            </div>
          ) : null}
        </div>
      </div>

      <div className="bar">
        <div className="tabs" role="group" aria-label="Show">
          <button aria-pressed={tab === "mine"} onClick={() => setTab("mine")}>In my collection ({mine.length})</button>
          <button aria-pressed={tab === "all"} onClick={() => setTab("all")}>Every appearance</button>
        </div>
        {tab === "all" ? (
          <label className="sort" htmlFor="char-order">Order
            <select id="char-order" value={order} onChange={(e) => setOrder(e.target.value as typeof order)}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </label>
        ) : null}
      </div>

      {tab === "mine" ? (
        mine.length ? (
          <div className="grid">{mine.map((c) => <ComicCard key={c.id} comic={c} />)}</div>
        ) : (
          <div className="empty">
            <p>None of your comics have {character.name} in them yet.</p>
            <button className="btn small" onClick={() => setTab("all")}>See every appearance</button>
          </div>
        )
      ) : (
        <>
          {pageError ? <p className="notice" role="alert">{pageError}</p> : null}
          <div className="grid">
            {loadedIssues.map((i) => (
              <CvIssueCard key={i.id} issue={i} mine={mineByIssue.get(i.id) ?? []} busy={!!busy[i.id]}
                seriesTitle={i.volume_name ?? ""} showSeries
                extra={first?.id === i.id ? <b className="pill key">1st app.</b> : null}
                onAdd={(status, existing, coverUrl) => add(i, status, existing, { coverUrl })} />
            ))}
          </div>
          {loadingPage ? <div className="empty"><span className="spinner" /> Loading comics…</div> : null}
          {!loadingPage && loadedFrom < ordered.length ? (
            <div className="actions" style={{ justifyContent: "center", paddingBottom: 24 }}>
              <button className="btn" onClick={() => loadPage(loadedFrom).then((ok) => { if (ok) setLoadedFrom((n) => n + PAGE); })}>
                Load more ({Math.min(loadedFrom, ordered.length).toLocaleString()} of {ordered.length.toLocaleString()})
              </button>
            </div>
          ) : null}
        </>
      )}
    </main>
  );
}

/** Links to the series page of a character's first issue, once we know which series it's in. */
function FirstIssueLink({ issueId }: { issueId: number }) {
  const [issue, setIssue] = useState<CvIssue | null>(null);
  useEffect(() => {
    let cancelled = false;
    api<{ issues: CvIssue[] }>(`/api/cv/issues-by-id?ids=${issueId}`)
      .then((r) => { if (!cancelled) setIssue(r.issues[0] ?? null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [issueId]);
  if (!issue?.volume_id) return null;
  return <Link href={`/series?key=cv-${issue.volume_id}`}>in {issue.volume_name} →</Link>;
}
