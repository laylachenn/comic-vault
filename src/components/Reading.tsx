"use client";

import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { comicName } from "@/lib/comics";
import { supabase } from "@/lib/supabase";
import type { Comic } from "@/lib/types";
import { useVault } from "./VaultProvider";

/** Marks an issue read or unread, along with any other copies of the same issue you own. */
export function useMarkRead() {
  const { comics, putLocal, toast } = useVault();
  const [busy, setBusy] = useState<string | null>(null);

  async function markRead(c: Comic, read = true) {
    const ids = c.cv_issue_id
      ? comics.filter((x) => x.status === "owned" && x.cv_issue_id === c.cv_issue_id).map((x) => x.id)
      : [c.id];
    setBusy(c.id);
    const { data, error } = await supabase().from("comics")
      .update({ is_read: read, updated_at: new Date().toISOString() })
      .in("id", ids.length ? ids : [c.id]).select();
    setBusy(null);
    if (error) { toast("Couldn't save that. Try again."); return; }
    for (const row of (data ?? []) as Comic[]) putLocal(row);
    toast(read ? `Marked ${comicName(c)} read` : `Marked ${comicName(c)} unread`);
  }

  return { markRead, busy };
}

/**
 * Comics added before first appearances and story arcs were saved: offers to look them up,
 * a few at a time so Comic Vine doesn't start refusing requests.
 */
export function ExtrasBackfill() {
  const { comics, putLocal } = useVault();
  const pending = useMemo(() => comics.filter((c) => c.cv_issue_id && !c.extras_checked_at), [comics]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [message, setMessage] = useState("");

  if (!pending.length && !message) return null;

  async function run() {
    setRunning(true);
    setMessage("");
    setDone(0);
    let queue = pending.map((c) => c.id);
    let count = 0;
    try {
      while (queue.length) {
        const batch = queue.slice(0, 8);
        const res = await api<{ comics: Comic[]; limited: boolean }>("/api/collection/extras", { method: "POST", body: JSON.stringify({ ids: batch }) });
        for (const c of res.comics) putLocal(c);
        count += res.comics.length;
        setDone(count);
        if (res.limited) { setMessage("Comic Vine needs a break. Try again in an hour to finish the rest."); return; }
        if (!res.comics.length) { setMessage("Comic Vine couldn't answer for some comics. Try again later."); return; }
        const finished = new Set(res.comics.map((c) => c.id));
        queue = queue.filter((id) => !finished.has(id));
      }
      setMessage(`Done. Checked ${count} ${count === 1 ? "comic" : "comics"}.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="backfill">
      {pending.length ? (
        <>
          <span>
            {running
              ? <><span className="spinner" /> Checking Comic Vine… {done} of {done + pending.length} done</>
              : <><b>{pending.length} {pending.length === 1 ? "comic hasn't" : "comics haven't"}</b> been checked for first appearances and story arcs yet.</>}
          </span>
          {!running ? <button className="btn small primary" onClick={run}>Check them now</button> : null}
        </>
      ) : null}
      {message ? <span className="hint">{message}</span> : null}
    </div>
  );
}
