"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
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

/** Adds a Comic Vine issue to the collection (or want list) through the server. */
export function useAddFromCv() {
  const { putLocal, toast } = useVault();
  const [busy, setBusy] = useState<Record<number, boolean>>({});

  async function add(issue: CvIssue, status: Status, existing?: Comic) {
    setBusy((b) => ({ ...b, [issue.id]: true }));
    try {
      if (existing) {
        // Already on the want list: just mark it owned.
        const { data, error } = await supabase().from("comics").update({ status, updated_at: new Date().toISOString() }).eq("id", existing.id).select().single();
        if (error) throw new Error("Couldn't update it. Try again.");
        putLocal(data as Comic);
      } else {
        const { comic } = await api<{ comic: Comic }>("/api/collection/add", { method: "POST", body: JSON.stringify({ cvIssueId: issue.id, status }) });
        putLocal(comic);
      }
      const name = `${issue.volume_name ?? "Issue"} ${issueLabel(issue.issue_number)}`.trim();
      toast(status === "wanted" ? `Added ${name} to your want list` : `Added ${name} to your collection`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't add it. Try again.");
    } finally {
      setBusy((b) => ({ ...b, [issue.id]: false }));
    }
  }

  return { add, busy };
}

/** One Comic Vine issue with buttons that depend on whether you already have it. */
export function CvIssueCard({ issue, mine, busy, onAdd, seriesTitle }: {
  issue: CvIssue;
  mine: Comic[];
  busy: boolean;
  onAdd: (status: Status, existing?: Comic) => void;
  seriesTitle: string;
}) {
  const owned = mine.filter((c) => c.status === "owned");
  const wanted = mine.find((c) => c.status === "wanted");
  const year = issue.cover_date?.slice(0, 4);
  const cover = <CoverImage src={issue.image} title={seriesTitle} issue={issue.issue_number} />;

  return (
    <div className={`cover ${owned.length ? "" : "missing"}`}>
      {owned.length ? <Link href={`/comic?id=${owned[0].id}`}>{cover}</Link> : cover}
      <span className="t">{issue.name || `${seriesTitle} ${issueLabel(issue.issue_number)}`}</span>
      <span className="s">
        {owned.length ? <b className="pill own">{owned.length > 1 ? `Own ×${owned.length}` : "Own"}</b> : null}
        {wanted ? <b className="pill want">Want</b> : null}
        {year}
      </span>
      <div className="card-actions">
        {owned.length ? (
          <button className="btn tiny" disabled={busy} onClick={() => onAdd("owned")}>+ Another copy</button>
        ) : (
          <>
            <button className="btn tiny primary" disabled={busy} onClick={() => onAdd("owned", wanted)}>{busy ? "Adding…" : wanted ? "Got it!" : "I have it"}</button>
            {!wanted ? <button className="btn tiny" disabled={busy} onClick={() => onAdd("wanted")}>Want</button> : null}
          </>
        )}
      </div>
    </div>
  );
}
