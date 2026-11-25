"use client";

import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { Comic } from "@/lib/types";
import { useVault } from "./VaultProvider";

/**
 * Comics from Comic Vine that were saved without a cover (an older bug skipped many of
 * Comic Vine's pictures). Offers to fetch each one's main cover again.
 */
export function MissingCovers() {
  const { comics, putLocal } = useVault();
  const [tried, setTried] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const missing = useMemo(() => comics.filter((c) => c.cv_issue_id && !c.cover_path && !tried.has(c.id)), [comics, tried]);

  if (!missing.length && !message) return null;

  async function run() {
    setRunning(true);
    setMessage("");
    let fixed = 0;
    let failed = 0;
    const attempted = new Set(tried);
    for (const c of missing) {
      attempted.add(c.id);
      try {
        const { covers } = await api<{ covers: { full: string }[] }>(`/api/cv/covers?issue=${c.cv_issue_id}`);
        if (!covers[0]) { failed++; continue; }
        const { comic } = await api<{ comic: Comic }>("/api/collection/cover", { method: "POST", body: JSON.stringify({ comicId: c.id, imageUrl: covers[0].full }) });
        putLocal(comic);
        fixed++;
      } catch {
        failed++;
      }
    }
    setTried(attempted);
    setRunning(false);
    setMessage(
      `Got ${fixed} ${fixed === 1 ? "cover" : "covers"}.` +
      (failed ? ` ${failed} couldn't be found on Comic Vine. Use "Change cover" on those to pick one or take a photo.` : ""),
    );
  }

  return (
    <div className="backfill">
      {missing.length ? (
        <>
          <span>{running ? <><span className="spinner" /> Getting covers…</> : <><b>{missing.length} {missing.length === 1 ? "comic is" : "comics are"}</b> missing {missing.length === 1 ? "its cover" : "their covers"}.</>}</span>
          {!running ? <button className="btn small primary" onClick={run}>Get covers</button> : null}
        </>
      ) : null}
      {message ? <span className="hint">{message}</span> : null}
    </div>
  );
}
