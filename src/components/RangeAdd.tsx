"use client";

import { useRef, useState } from "react";
import type { Comic, CvIssue, Status } from "@/lib/types";
import { fetchAllCvIssues, useAddFromCv } from "./CvIssues";
import { useVault } from "./VaultProvider";

const MAX_RANGE = 100;
const PLAIN_NUMBER = /^\d+(\.\d+)?$/;

type Progress = { done: number; total: number; skipped: number; failed: number; note: string };

/** Parses "1" and "12" into a checked range, or explains what's wrong. */
export function parseRange(fromText: string, toText: string): { from: number; to: number } | string {
  const from = Number(fromText.trim().replace(/^#/, ""));
  const to = Number(toText.trim().replace(/^#/, ""));
  if (!fromText.trim() || !toText.trim()) return "Fill in both issue numbers.";
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0) return "Use whole issue numbers, like 1 and 12.";
  if (to < from) return "The second number should be the bigger one.";
  if (to - from + 1 > MAX_RANGE) return `Add up to ${MAX_RANGE} issues at a time.`;
  return { from, to };
}

/** "Add issues #1 to #12" for a Comic Vine series. Adds them one by one with progress and a Stop button. */
export function CvRangeAdd({ volumeId, volumeName }: { volumeId: number; volumeName: string }) {
  const { comics, toast } = useVault();
  const { addOne } = useAddFromCv();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState<Status>("owned");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [running, setRunning] = useState(false);
  const stopRef = useRef(false);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    const range = parseRange(from, to);
    if (typeof range === "string") { setError(range); return; }
    setError("");
    stopRef.current = false;
    setRunning(true);
    setProgress({ done: 0, total: 0, skipped: 0, failed: 0, note: "" });
    try {
      await addRange(range);
    } finally {
      setRunning(false);
    }
  }

  async function addRange(range: { from: number; to: number }) {

    let issues: CvIssue[];
    try {
      issues = await fetchAllCvIssues(volumeId);
    } catch (err) {
      setProgress(null);
      setError(err instanceof Error ? err.message : "Couldn't load this series. Try again.");
      return;
    }

    const targets = issues
      .filter((i) => PLAIN_NUMBER.test((i.issue_number ?? "").trim()))
      .filter((i) => { const n = Number(i.issue_number); return n >= range.from && n <= range.to; })
      .sort((a, b) => Number(a.issue_number) - Number(b.issue_number));

    if (!targets.length) {
      setProgress(null);
      setError(`This series has no issues #${range.from}–#${range.to} on Comic Vine.`);
      return;
    }

    // Work out up front what to do with each issue, from the collection as it is now.
    const plan = targets.map((issue) => {
      const mine = comics.filter((c) => c.cv_issue_id === issue.id);
      const owned = mine.some((c) => c.status === "owned");
      const wanted = mine.find((c) => c.status === "wanted");
      if (status === "owned") return owned ? { issue, skip: true } : { issue, skip: false, existing: wanted as Comic | undefined };
      return owned || wanted ? { issue, skip: true } : { issue, skip: false };
    });

    const p: Progress = { done: 0, total: plan.length, skipped: plan.filter((x) => x.skip).length, failed: 0, note: "" };
    setProgress({ ...p });

    for (const step of plan) {
      if (step.skip) continue;
      if (stopRef.current) { p.note = "stopped"; break; }
      try {
        await addOne({ ...step.issue, volume_name: step.issue.volume_name ?? volumeName }, status, step.existing);
        p.done++;
      } catch (err) {
        p.failed++;
        const msg = err instanceof Error ? err.message : "";
        if (/limiting requests/i.test(msg)) { p.note = "rate"; setProgress({ ...p }); break; }
      }
      setProgress({ ...p });
    }
    if (!p.note) p.note = "done";
    setProgress({ ...p });
    if (!p.done) return;

    const where = status === "wanted" ? "your want list" : "your collection";
    toast(`Added ${p.done} ${p.done === 1 ? "issue" : "issues"} to ${where}`);
  }

  if (!open) {
    return <button className="btn small" onClick={() => setOpen(true)}>Add a range of issues</button>;
  }

  return (
    <form className="range" onSubmit={run}>
      <div className="range-row">
        <span className="range-label">Add issues</span>
        <label className="sr-only" htmlFor={`range-from-${volumeId}`}>From issue</label>
        <input id={`range-from-${volumeId}`} inputMode="numeric" placeholder="#1" value={from} onChange={(e) => setFrom(e.target.value)} disabled={running} />
        <span>to</span>
        <label className="sr-only" htmlFor={`range-to-${volumeId}`}>To issue</label>
        <input id={`range-to-${volumeId}`} inputMode="numeric" placeholder="#12" value={to} onChange={(e) => setTo(e.target.value)} disabled={running} />
        <label className="sr-only" htmlFor={`range-status-${volumeId}`}>Add as</label>
        <select id={`range-status-${volumeId}`} value={status} onChange={(e) => setStatus(e.target.value as Status)} disabled={running}>
          <option value="owned">to my collection</option>
          <option value="wanted">to my want list</option>
        </select>
      </div>
      <div className="actions">
        {running ? (
          <button type="button" className="btn small danger" onClick={() => { stopRef.current = true; }}>Stop</button>
        ) : (
          <>
            <button type="submit" className="btn small primary">Add issues</button>
            <button type="button" className="btn small" onClick={() => { setOpen(false); setProgress(null); setError(""); }}>Close</button>
          </>
        )}
      </div>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {progress ? <p className="hint" role="status">{describe(progress, status)}</p> : null}
      {!progress && !error ? <p className="hint">Issues you already have are skipped. Each new issue takes a moment while its cover is saved.</p> : null}
    </form>
  );
}

function describe(p: Progress, status: Status): string {
  if (!p.total) return "Finding the issues…";
  const toAdd = p.total - p.skipped;
  const extra = [
    p.skipped ? `${p.skipped} already ${status === "wanted" ? "listed" : "in your collection"}` : "",
    p.failed ? `${p.failed} couldn't be added` : "",
  ].filter(Boolean).join(", ");
  const tail = extra ? ` (${extra})` : "";
  if (p.note === "rate") return `Added ${p.done} of ${toAdd}. Comic Vine is limiting requests right now, so the rest were not added. Try again in a few minutes${tail}.`;
  if (p.note === "stopped") return `Stopped after adding ${p.done} of ${toAdd}${tail}.`;
  if (p.note === "done" && !toAdd) return `You already have all of these${status === "wanted" ? " listed" : ""}.`;
  if (p.note === "done") return `Done. Added ${p.done} of ${toAdd}${tail}.`;
  return `Adding ${p.done + p.failed + 1} of ${toAdd}…${tail}`;
}
