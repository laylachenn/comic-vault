"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Masthead } from "@/components/Masthead";
import { CvIssueCard, useAddFromCv } from "@/components/CvIssues";
import { useMarkRead } from "@/components/Reading";
import { useVault } from "@/components/VaultProvider";
import { api } from "@/lib/api";
import { issueLabel } from "@/lib/comics";
import type { Comic, CvIssue, CvStoryArc } from "@/lib/types";

type ArcResponse = { arc: Omit<CvStoryArc, "issueIds">; issues: CvIssue[]; total: number };

export default function Page() {
  return (
    <Suspense fallback={<div className="splash">Opening the vault…</div>}>
      <Masthead />
      <ArcView />
    </Suspense>
  );
}

function ArcView() {
  const id = Number(useSearchParams().get("id"));
  const { comics } = useVault();
  const { add, busy } = useAddFromCv();
  const { markRead, busy: marking } = useMarkRead();
  const [data, setData] = useState<ArcResponse | null>(null);
  const [error, setError] = useState("");
  const [show, setShow] = useState<"all" | "mine" | "missing">("all");

  useEffect(() => {
    if (!Number.isInteger(id) || id <= 0) { setError("That story arc link is broken."); return; }
    let cancelled = false;
    setData(null);
    setError("");
    api<ArcResponse>(`/api/cv/arc?id=${id}`)
      .then((r) => { if (!cancelled) setData(r); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load this story arc."); });
    return () => { cancelled = true; };
  }, [id]);

  const mineByIssue = useMemo(() => {
    const m = new Map<number, Comic[]>();
    for (const c of comics) if (c.cv_issue_id) m.set(c.cv_issue_id, [...(m.get(c.cv_issue_id) ?? []), c]);
    return m;
  }, [comics]);

  if (error) return <main className="wrap"><p className="notice" role="alert">{error}</p><Link className="btn small" href="/read">← Read next</Link></main>;
  if (!data) return <main className="wrap"><div className="empty"><span className="spinner" /> Loading the reading order…</div></main>;

  const ownedOf = (i: CvIssue) => (mineByIssue.get(i.id) ?? []).filter((c) => c.status === "owned");
  const isRead = (i: CvIssue) => ownedOf(i).some((c) => c.is_read);
  const parts = data.issues.map((issue, n) => ({ issue, part: n + 1 }));
  const ownedCount = parts.filter((p) => ownedOf(p.issue).length).length;
  const readCount = parts.filter((p) => isRead(p.issue)).length;
  const next = parts.find((p) => ownedOf(p.issue).length && !isRead(p.issue));
  const missing = parts.filter((p) => !ownedOf(p.issue).length);
  const visible = parts.filter((p) => show === "all" || (show === "mine" ? ownedOf(p.issue).length : !ownedOf(p.issue).length));
  const pct = parts.length ? Math.round((ownedCount / parts.length) * 100) : 0;

  return (
    <main className="wrap">
      <div className="page-head">
        <Link href="/read" className="btn small back">← Read next</Link>
        <h2>{data.arc.name}</h2>
        <div className="meta">
          {[data.arc.publisher, `${data.total} ${data.total === 1 ? "issue" : "issues"}`, `you own ${ownedCount}`, ownedCount ? `read ${readCount}` : null].filter(Boolean).join(" · ")}
        </div>
        {data.arc.deck ? <p className="hint" style={{ margin: 0 }}>{data.arc.deck}</p> : null}
        <div className="progress" aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>
        {next ? (
          <div className="next-up">
            <span>Next up: <b>Part {next.part} · {next.issue.volume_name} {issueLabel(next.issue.issue_number)}</b></span>
            <button className="btn small primary" disabled={!!marking} onClick={() => markRead(ownedOf(next.issue)[0])}>Mark it read</button>
          </div>
        ) : ownedCount && ownedCount === parts.length ? <div className="runline"><b>You&rsquo;ve read the whole arc.</b></div> : null}
        {missing.length && ownedCount ? (
          <div className="runline">Missing: <b>{missing.slice(0, 12).map((p) => `${p.issue.volume_name} ${issueLabel(p.issue.issue_number)}`).join(", ")}{missing.length > 12 ? ` and ${missing.length - 12} more` : ""}</b></div>
        ) : null}
        {data.total > data.issues.length ? <p className="hint">Showing the first {data.issues.length} issues.</p> : null}
      </div>

      <div className="bar">
        <div className="tabs" role="group" aria-label="Show">
          <button aria-pressed={show === "all"} onClick={() => setShow("all")}>Reading order</button>
          <button aria-pressed={show === "mine"} onClick={() => setShow("mine")}>Mine</button>
          <button aria-pressed={show === "missing"} onClick={() => setShow("missing")}>Missing</button>
        </div>
      </div>

      <div className="grid">
        {visible.map(({ issue, part }) => (
          <CvIssueCard key={issue.id} issue={issue} mine={mineByIssue.get(issue.id) ?? []} busy={!!busy[issue.id]}
            seriesTitle={issue.volume_name ?? ""} showSeries
            extra={<>
              <b className="pill">Part {part}</b>
              {isRead(issue) ? <b className="pill read">Read</b> : null}
              {next?.issue.id === issue.id ? <b className="pill key">Next</b> : null}
            </>}
            onAdd={(status, existing, coverUrl) => add(issue, status, existing, { coverUrl })} />
        ))}
      </div>
    </main>
  );
}
