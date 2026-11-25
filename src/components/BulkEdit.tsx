"use client";

import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Comic, Status } from "@/lib/types";
import { TagInput } from "./TagInput";
import { useVault } from "./VaultProvider";

const uniq = (xs: (string | null | undefined)[]) =>
  [...new Set(xs.map((x) => (x ?? "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));

/** Runs `fn` over `items`, a few at a time. */
async function inBatches<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  return out;
}

/** The bar at the bottom of the screen while comics are selected, with Edit and Remove. */
export function BulkBar({ selected, visibleIds, onSelectAll, onDone }: {
  selected: Comic[];
  visibleIds: string[];
  onSelectAll: () => void;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<"bar" | "edit" | "remove">("bar");
  const n = selected.length;
  const allShown = visibleIds.length > 0 && visibleIds.every((id) => selected.some((c) => c.id === id));

  return (
    <div className="bulk" role="region" aria-label="Selected comics">
      <div className="wrap bulk-inner">
        {mode === "edit" ? (
          <BulkEditForm selected={selected} onClose={() => setMode("bar")} onDone={onDone} />
        ) : mode === "remove" ? (
          <BulkRemove selected={selected} onClose={() => setMode("bar")} onDone={onDone} />
        ) : (
          <div className="bulk-row">
            <b>{n} selected</b>
            {!allShown ? <button className="btn small" onClick={onSelectAll}>Select all shown</button> : null}
            <span className="spacer" />
            <button className="btn small primary" disabled={!n} onClick={() => setMode("edit")}>Edit</button>
            <button className="btn small danger" disabled={!n} onClick={() => setMode("remove")}>Remove</button>
            <button className="btn small" onClick={onDone}>Done</button>
          </div>
        )}
      </div>
    </div>
  );
}

function BulkEditForm({ selected, onClose, onDone }: { selected: Comic[]; onClose: () => void; onDone: () => void }) {
  const { comics, putLocal, toast } = useVault();
  const [status, setStatus] = useState<"" | Status>("");
  const [read, setRead] = useState<"" | "read" | "unread">("");
  const [location, setLocation] = useState("");
  const [clearLocation, setClearLocation] = useState(false);
  const [addTags, setAddTags] = useState<string[]>([]);
  const [removeTags, setRemoveTags] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const sug = useMemo(() => ({
    tags: uniq(["Key issue", "First appearance", "Signed", "Variant", ...comics.flatMap((c) => c.tags)]),
    selectedTags: uniq(selected.flatMap((c) => c.tags)),
    locations: uniq(comics.map((c) => c.location)),
  }), [comics, selected]);

  const nothing = !status && !read && !location.trim() && !clearLocation && !addTags.length && !removeTags.length;

  async function apply(e: React.FormEvent) {
    e.preventDefault();
    if (nothing) { setError("Choose at least one change."); return; }
    setBusy(true);
    setError("");
    const drop = removeTags.map((t) => t.toLowerCase());
    const now = new Date().toISOString();
    let failed = 0;

    await inBatches(selected, 8, async (c) => {
      const patch: Partial<Comic> = { updated_at: now };
      if (status) patch.status = status;
      if (read) patch.is_read = read === "read";
      if (clearLocation) patch.location = null;
      else if (location.trim()) patch.location = location.trim();
      if (addTags.length || removeTags.length) {
        const kept = c.tags.filter((t) => !drop.includes(t.toLowerCase()));
        const have = kept.map((t) => t.toLowerCase());
        patch.tags = [...kept, ...addTags.filter((t) => !have.includes(t.toLowerCase()))];
      }
      const { data, error } = await supabase().from("comics").update(patch).eq("id", c.id).select().single();
      if (error) failed++;
      else putLocal(data as Comic);
    });

    setBusy(false);
    if (failed) {
      setError(`${failed} of ${selected.length} couldn't be updated. Check your connection and try again.`);
      return;
    }
    toast(`Updated ${selected.length} ${selected.length === 1 ? "comic" : "comics"}`);
    onDone();
  }

  return (
    <form className="bulk-form" onSubmit={apply}>
      <div className="bulk-row"><b>Change {selected.length} {selected.length === 1 ? "comic" : "comics"}</b><span className="hint">Anything left blank stays as it is.</span></div>
      <div className="fields">
        <div className="field w2">
          <label htmlFor="bulk-status">Move to</label>
          <select id="bulk-status" value={status} onChange={(e) => setStatus(e.target.value as "" | Status)}>
            <option value="">No change</option>
            <option value="owned">My collection</option>
            <option value="wanted">My want list</option>
          </select>
        </div>
        <div className="field w2">
          <label htmlFor="bulk-read">Read</label>
          <select id="bulk-read" value={read} onChange={(e) => setRead(e.target.value as "" | "read" | "unread")}>
            <option value="">No change</option>
            <option value="read">Mark as read</option>
            <option value="unread">Mark as not read</option>
          </select>
        </div>
        <div className="field w2">
          <label htmlFor="bulk-loc">Where it&rsquo;s kept</label>
          <input id="bulk-loc" list="bulk-loc-list" value={location} onChange={(e) => { setLocation(e.target.value); setClearLocation(false); }} placeholder="Box 3" autoComplete="off" disabled={clearLocation} />
          <datalist id="bulk-loc-list">{sug.locations.map((s) => <option key={s} value={s} />)}</datalist>
          <label className="check small-check"><input type="checkbox" checked={clearLocation} onChange={(e) => { setClearLocation(e.target.checked); if (e.target.checked) setLocation(""); }} /> Clear it</label>
        </div>
      </div>
      <div className="fields">
        <div className="field w3"><TagInput id="bulk-add-tags" label="Add tags" value={addTags} onChange={setAddTags} suggestions={sug.tags} placeholder="Key issue" /></div>
        <div className="field w3"><TagInput id="bulk-remove-tags" label="Remove tags" value={removeTags} onChange={setRemoveTags} suggestions={sug.selectedTags} placeholder={sug.selectedTags[0] ?? ""} /></div>
      </div>
      {error ? <p className="error" role="alert">{error}</p> : null}
      <div className="actions">
        <button className="btn small primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Apply changes"}</button>
        <button className="btn small" type="button" onClick={onClose} disabled={busy}>Back</button>
      </div>
    </form>
  );
}

function BulkRemove({ selected, onClose, onDone }: { selected: Comic[]; onClose: () => void; onDone: () => void }) {
  const { removeLocal, toast } = useVault();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const n = selected.length;

  async function remove() {
    setBusy(true);
    setError("");
    const sb = supabase();
    let removed = 0;
    for (let i = 0; i < selected.length; i += 100) {
      const chunk = selected.slice(i, i + 100);
      const { error } = await sb.from("comics").delete().in("id", chunk.map((c) => c.id));
      if (error) { setError(`Removed ${removed} of ${n}. The rest couldn't be removed. Try again.`); setBusy(false); return; }
      const covers = chunk.map((c) => c.cover_path).filter((p): p is string => !!p);
      if (covers.length) await sb.storage.from("covers").remove(covers);
      chunk.forEach((c) => removeLocal(c.id));
      removed += chunk.length;
    }
    toast(`Removed ${n} ${n === 1 ? "comic" : "comics"}`);
    onDone();
  }

  return (
    <div className="bulk-form">
      <div className="bulk-row"><b>Remove {n} {n === 1 ? "comic" : "comics"} and {n === 1 ? "its cover" : "their covers"}? This can&rsquo;t be undone.</b></div>
      {error ? <p className="error" role="alert">{error}</p> : null}
      <div className="actions">
        <button className="btn small danger" onClick={remove} disabled={busy}>{busy ? "Removing…" : `Yes, remove ${n}`}</button>
        <button className="btn small" onClick={onClose} disabled={busy}>Keep them</button>
      </div>
    </div>
  );
}
