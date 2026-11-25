"use client";

import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Masthead } from "@/components/Masthead";
import { ComicCard } from "@/components/Cover";
import { CvIssueCard, useAddFromCv, useCvIssues } from "@/components/CvIssues";
import { CvRangeAdd } from "@/components/RangeAdd";
import { useVault } from "@/components/VaultProvider";
import { issueSortValue, seriesKey, seriesName } from "@/lib/comics";
import type { Comic } from "@/lib/types";

export default function Page() {
  return (
    <Suspense fallback={<div className="splash">Opening the vault…</div>}>
      <Masthead />
      <SeriesView />
    </Suspense>
  );
}

function SeriesView() {
  const key = useSearchParams().get("key") ?? "";
  const { comics, loaded } = useVault();
  const mine = useMemo(
    () => comics.filter((c) => seriesKey(c) === key).sort((a, b) => issueSortValue(a.issue_number) - issueSortValue(b.issue_number)),
    [comics, key],
  );
  const cvId = /^cv-\d+$/.test(key) ? Number(key.slice(3)) : null;

  return (
    <main className="wrap">
      {cvId ? <CvSeries volumeId={cvId} mine={mine} /> : !loaded ? (
        <div className="empty"><span className="spinner" /> Loading…</div>
      ) : mine.length ? <ManualSeries mine={mine} /> : (
        <div className="empty"><p>That series isn&rsquo;t in your collection.</p><Link className="btn small" href="/">Back to your comics</Link></div>
      )}
    </main>
  );
}

function missingLine(nums: string[]) {
  if (!nums.length) return null;
  const shown = nums.slice(0, 40).map((n) => `#${n}`).join(", ");
  return nums.length > 40 ? `${shown} and ${nums.length - 40} more` : shown;
}

/** A Comic Vine series: the full run, with what you own in color and the rest grayed out. */
function CvSeries({ volumeId, mine }: { volumeId: number; mine: Comic[] }) {
  const { volume, issues, total, loading, error, hasMore, loadMore, retry } = useCvIssues(volumeId);
  const { add, busy } = useAddFromCv();
  const [show, setShow] = useState<"all" | "missing" | "owned">("all");

  const byIssue = useMemo(() => {
    const m = new Map<number, Comic[]>();
    for (const c of mine) if (c.cv_issue_id) m.set(c.cv_issue_id, [...(m.get(c.cv_issue_id) ?? []), c]);
    return m;
  }, [mine]);

  const ownsIssue = (id: number) => (byIssue.get(id) ?? []).some((c) => c.status === "owned");
  const ownedCount = new Set(mine.filter((c) => c.status === "owned" && c.cv_issue_id).map((c) => c.cv_issue_id)).size;
  const missing = issues.filter((i) => !ownsIssue(i.id)).map((i) => i.issue_number || "?");
  const loadedIds = new Set(issues.map((i) => i.id));
  const extras = !hasMore && !loading ? mine.filter((c) => !c.cv_issue_id || !loadedIds.has(c.cv_issue_id)) : [];
  const visible = issues.filter((i) => show === "all" || (show === "owned" ? ownsIssue(i.id) : !ownsIssue(i.id)));
  const name = volume ? `${volume.name}${volume.start_year ? ` (${volume.start_year})` : ""}` : mine[0] ? seriesName(mine[0]) : "Loading series…";
  const pct = total ? Math.min(100, Math.round((ownedCount / total) * 100)) : 0;

  return (
    <>
      <div className="page-head">
        <Link href="/" className="btn small back">← All comics</Link>
        <h2>{name}</h2>
        <div className="meta">{[volume?.publisher, total ? `You own ${ownedCount} of ${total} issues` : null].filter(Boolean).join(" · ")}</div>
        {total ? <div className="progress" aria-hidden="true"><span style={{ width: `${pct}%` }} /></div> : null}
        {missing.length && issues.length ? (
          <div className="runline">Missing{hasMore ? " (so far)" : ""}: <b>{missingLine(missing)}</b></div>
        ) : issues.length && !hasMore ? <div className="runline"><b>You have the complete run.</b></div> : null}
      </div>

      {error ? <p className="notice" role="alert">{error} <button className="linkish" onClick={retry}>Try again</button></p> : null}

      <div className="bar">
        <div className="tabs" role="group" aria-label="Show">
          <button aria-pressed={show === "all"} onClick={() => setShow("all")}>Every issue</button>
          <button aria-pressed={show === "missing"} onClick={() => setShow("missing")}>Missing</button>
          <button aria-pressed={show === "owned"} onClick={() => setShow("owned")}>Mine</button>
        </div>
        <div className="actions">
          <CvRangeAdd volumeId={volumeId} volumeName={volume?.name ?? ""} />
          <Link className="btn small" href={`/add?q=${encodeURIComponent(volume?.name ?? "")}`}>Search other series</Link>
        </div>
      </div>

      <div className="grid">
        {visible.map((i) => (
          <CvIssueCard key={i.id} issue={i} mine={byIssue.get(i.id) ?? []} busy={!!busy[i.id]} seriesTitle={volume?.name ?? ""}
            onAdd={(status, existing, coverUrl) => add({ ...i, volume_name: i.volume_name ?? volume?.name ?? null }, status, existing, { coverUrl })} />
        ))}
      </div>
      {loading ? <div className="empty"><span className="spinner" /> Loading issues…</div> : null}
      {hasMore && !loading ? (
        <div className="actions" style={{ justifyContent: "center", paddingBottom: 24 }}>
          <button className="btn" onClick={loadMore}>Load more issues ({issues.length} of {total})</button>
        </div>
      ) : null}

      {extras.length ? (
        <>
          <div className="section-label">Also in your collection for this series</div>
          <div className="grid">{extras.map((c) => <ComicCard key={c.id} comic={c} showSeries={false} />)}</div>
        </>
      ) : null}
    </>
  );
}

/** A series you added by hand: your issues, plus gaps between the numbers you own. */
function ManualSeries({ mine }: { mine: Comic[] }) {
  const owned = mine.filter((c) => c.status === "owned");
  const nums = [...new Set(owned.map((c) => Number(c.issue_number)).filter((n) => Number.isInteger(n) && n >= 0))].sort((a, b) => a - b);
  const gaps: string[] = [];
  if (nums.length > 1) {
    const have = new Set(nums);
    for (let n = nums[0]; n <= nums[nums.length - 1] && gaps.length < 500; n++) if (!have.has(n)) gaps.push(String(n));
  }
  const first = mine[0];

  return (
    <>
      <div className="page-head">
        <Link href="/" className="btn small back">← All comics</Link>
        <h2>{seriesName(first)}</h2>
        <div className="meta">{[first.publisher, `${owned.length} in your collection`].filter(Boolean).join(" · ")}</div>
        {nums.length ? <div className="runline">Issues you own: <b>#{owned.map((c) => c.issue_number).filter(Boolean).join(", #")}</b></div> : null}
        {gaps.length ? <div className="runline">Gaps in your run: <b>{missingLine(gaps)}</b></div> : null}
      </div>
      <div className="grid" style={{ paddingTop: 12 }}>{mine.map((c) => <ComicCard key={c.id} comic={c} showSeries={false} />)}</div>
    </>
  );
}
