"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { issueLabel, issueSortValue } from "@/lib/comics";
import type { Comic, CvIssue, CvVolume, Status } from "@/lib/types";
import { CoverImage } from "./Cover";
import { useVault } from "./VaultProvider";

type IssuesPage = { volume: CvVolume | null; issues: CvIssue[]; total: number; offset: number; pageSize: number };

/** Loads one Comic Vine series, 100 issues at a time, sorted by issue number. */
export function useCvIssues(volumeId: number | null, issueFilter = "") {
  const [volume, setVolume] = useState<CvVolume | null>(null);
  const [issues, setIssues] = useState<CvIssue[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (offset: number) => {
    if (!volumeId) return;
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams({ volume: String(volumeId), offset: String(offset) });
      if (issueFilter) qs.set("issue", issueFilter);
      const page = await api<IssuesPage>(`/api/cv/issues?${qs}`);
      if (page.volume) setVolume(page.volume);
      setTotal(page.total);
      setIssues((prev) => {
        const all = offset === 0 ? page.issues : [...prev, ...page.issues.filter((i) => !prev.some((p) => p.id === i.id))];
        return all.sort((a, b) => issueSortValue(a.issue_number) - issueSortValue(b.issue_number));
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load this series.");
    } finally {
      setLoading(false);
    }
  }, [volumeId, issueFilter]);

  useEffect(() => { setIssues([]); setTotal(0); load(0); }, [load]);

  return { volume, issues, total, loading, error, hasMore: issues.length < total, loadMore: () => load(issues.length), retry: () => load(0) };
}

/** Extra details when adding: the variant name, and which Comic Vine cover picture to use. */
export type AddExtras = { variant?: string | null; coverUrl?: string };

/** Adds a Comic Vine issue to the collection (or want list) through the server. */
export function useAddFromCv() {
  const { putLocal, toast } = useVault();
  const [busy, setBusy] = useState<Record<number, boolean>>({});

  /** Adds one issue without any message, and returns it. Throws if it fails. */
  async function addOne(issue: CvIssue, status: Status, existing?: Comic, extra: AddExtras = {}): Promise<Comic> {
    const { variant, coverUrl } = extra;
    if (existing) {
      // Already on the want list: just mark it owned (and switch its cover if one was picked).
      const patch = { status, updated_at: new Date().toISOString(), ...(variant ? { variant } : {}) };
      const { data, error } = await supabase().from("comics").update(patch).eq("id", existing.id).select().single();
      if (error) throw new Error("Couldn't update it. Try again.");
      let saved = data as Comic;
      if (coverUrl) {
        saved = (await api<{ comic: Comic }>("/api/collection/cover", { method: "POST", body: JSON.stringify({ comicId: saved.id, imageUrl: coverUrl }) })).comic;
      }
      putLocal(saved);
      return saved;
    }
    const { comic } = await api<{ comic: Comic }>("/api/collection/add", { method: "POST", body: JSON.stringify({ cvIssueId: issue.id, status, variant: variant ?? undefined, coverUrl }) });
    putLocal(comic);
    return comic;
  }

  /** Adds one issue and shows a message. Returns the saved comic, or null if it failed. */
  async function add(issue: CvIssue, status: Status, existing?: Comic, extra?: AddExtras): Promise<Comic | null> {
    setBusy((b) => ({ ...b, [issue.id]: true }));
    try {
      const saved = await addOne(issue, status, existing, extra);
      const name = `${issue.volume_name ?? "Issue"} ${issueLabel(issue.issue_number)}`.trim();
      toast(status === "wanted" ? `Added ${name} to your want list` : `Added ${name} to your collection`);
      return saved;
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't add it. Try again.");
      return null;
    } finally {
      setBusy((b) => ({ ...b, [issue.id]: false }));
    }
  }

  return { add, addOne, busy };
}

/** Loads every issue of a Comic Vine series (up to 2,000), page by page. */
export async function fetchAllCvIssues(volumeId: number): Promise<CvIssue[]> {
  const all: CvIssue[] = [];
  for (let offset = 0, total = Infinity; offset < total && offset < 2000; ) {
    const page = await api<IssuesPage>(`/api/cv/issues?volume=${volumeId}&offset=${offset}`);
    all.push(...page.issues);
    total = page.total;
    if (!page.issues.length) break;
    offset += page.issues.length;
  }
  return all;
}

type CoverPick = { full: string; thumb: string };
const coverCache = new Map<number, Promise<CoverPick[]>>();

/** One issue's covers from Comic Vine, fetched once per visit. */
function loadCovers(issueId: number): Promise<CoverPick[]> {
  let p = coverCache.get(issueId);
  if (!p) {
    p = api<{ covers: CoverPick[] }>(`/api/cv/covers?issue=${issueId}`).then((r) => r.covers);
    p.catch(() => coverCache.delete(issueId));
    coverCache.set(issueId, p);
  }
  return p;
}

/** A row of an issue's covers to tap one. Picks the main cover by default unless told not to. */
function CoverRow({ issueId, chosen, onChoose, pickMain }: { issueId: number; chosen: CoverPick | null; onChoose: (c: CoverPick) => void; pickMain: boolean }) {
  const [covers, setCovers] = useState<CoverPick[] | null>(null);
  const [error, setError] = useState("");
  const chooseRef = useRef(onChoose);
  chooseRef.current = onChoose;

  useEffect(() => {
    let cancelled = false;
    loadCovers(issueId)
      .then((list) => { if (cancelled) return; setCovers(list); if (pickMain && list[0]) chooseRef.current(list[0]); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load the covers."); });
    return () => { cancelled = true; };
  }, [issueId, pickMain]);

  if (error) return <p className="error" role="alert">{error}</p>;
  if (!covers) return <div className="hint"><span className="spinner" /> Loading covers…</div>;
  if (!covers.length) return <p className="hint">Comic Vine has no cover pictures for this issue.</p>;
  return (
    <div className="cover-grid" role="radiogroup" aria-label="Covers">
      {covers.map((c, i) => {
        const on = chosen?.full === c.full;
        return (
          <button key={c.full} type="button" role="radio" aria-checked={on} className={`cover-option ${on ? "chosen" : ""}`} onClick={() => onChoose(c)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c.thumb} alt="" loading="lazy" />
            <span>{on ? "✓ " : ""}{i === 0 ? "Main cover" : `Cover ${i + 1}`}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * One Comic Vine issue with buttons that depend on whether you already have it.
 * "Covers" opens a full-width row of the issue's covers below the card; the one you tap is used when adding.
 */
export function CvIssueCard({ issue, mine, busy, onAdd, seriesTitle, startOpen = false, noDefaultCover = false, showSeries = false, extra }: {
  issue: CvIssue;
  mine: Comic[];
  busy: boolean;
  onAdd: (status: Status, existing?: Comic, coverUrl?: string) => void;
  seriesTitle: string;
  /** Show the covers row straight away (used after a scan). */
  startOpen?: boolean;
  /** Don't pre-pick the main cover (the barcode says it's a variant). */
  noDefaultCover?: boolean;
  /** Title the card "Series #12" instead of the story name (for lists that mix series). */
  showSeries?: boolean;
  /** Extra labels shown beside Own/Want, like "Read" or "Part 3". */
  extra?: React.ReactNode;
}) {
  const [open, setOpen] = useState(startOpen);
  const [chosen, setChosen] = useState<CoverPick | null>(null);
  const owned = mine.filter((c) => c.status === "owned");
  const wanted = mine.find((c) => c.status === "wanted");
  const year = issue.cover_date?.slice(0, 4);
  const title = showSeries ? `${seriesTitle} ${issueLabel(issue.issue_number)}`.trim() : issue.name || `${seriesTitle} ${issueLabel(issue.issue_number)}`;
  const cover = <CoverImage src={chosen?.thumb ?? issue.image} title={seriesTitle} issue={issue.issue_number} />;
  const url = chosen?.full;

  const addButtons = (size: "tiny" | "small") => owned.length ? (
    <button className={`btn ${size} add-btn`} disabled={busy} onClick={() => onAdd("owned", undefined, url)}>+ Another copy</button>
  ) : (
    <>
      <button className={`btn ${size} primary add-btn`} disabled={busy} onClick={() => onAdd("owned", wanted, url)}>{busy ? (wanted ? "Moving…" : "Adding…") : wanted ? "Move to owned" : "I have it"}</button>
      {!wanted ? <button className={`btn ${size} add-btn`} disabled={busy} onClick={() => onAdd("wanted", undefined, url)}>Want</button> : null}
    </>
  );

  return (
    <>
      <div className={`cover ${owned.length ? "" : "missing"} ${open ? "is-open" : ""}`}>
        {owned.length ? <Link href={`/comic?id=${owned[0].id}`}>{cover}</Link> : cover}
        <span className="t">{title}</span>
        <span className="s">
          {owned.length ? <b className="pill own">{owned.length > 1 ? `Own ×${owned.length}` : "Own"}</b> : null}
          {wanted ? <b className="pill want">Want</b> : null}
          {extra}
          {year}
        </span>
        <div className="card-actions">
          {addButtons("tiny")}
          <button className="btn tiny" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{open ? "Hide covers" : "Covers"}</button>
        </div>
      </div>
      {open ? (
        <div className="covers-panel">
          <div className="bulk-row">
            <b>{title}: pick your cover</b>
            <span className="spacer" />
            <button className="btn tiny" onClick={() => setOpen(false)}>Close</button>
          </div>
          <CoverRow issueId={issue.id} chosen={chosen} onChoose={setChosen} pickMain={!noDefaultCover} />
          <div className="actions">{addButtons("small")}</div>
          {!chosen ? <p className="hint">Tap the cover that matches your copy. Without a pick, the main cover is used.</p> : null}
        </div>
      ) : null}
    </>
  );
}
