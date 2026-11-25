"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Masthead } from "@/components/Masthead";
import { useVault } from "@/components/VaultProvider";
import { supabase } from "@/lib/supabase";

type Profile = { handle: string; share_enabled: boolean; share_wanted: boolean };

const HANDLE = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;

export default function SharePage() {
  return (
    <>
      <Masthead />
      <ShareSettings />
    </>
  );
}

function ShareSettings() {
  const { session, toast } = useVault();
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState<Profile | null>(null);
  const [handle, setHandle] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [wanted, setWanted] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const userId = session?.user.id;

  useEffect(() => {
    if (!userId) return;
    supabase().from("profiles").select("handle, share_enabled, share_wanted").eq("user_id", userId).maybeSingle().then(({ data }) => {
      if (data) {
        setSaved(data as Profile);
        setHandle(data.handle);
        setEnabled(data.share_enabled);
        setWanted(data.share_wanted);
      } else {
        const fromEmail = (session?.user.email ?? "").split("@")[0].toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, "").slice(0, 30);
        setHandle(fromEmail.length >= 3 ? fromEmail : "");
      }
      setLoaded(true);
    });
  }, [userId, session?.user.email]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const h = handle.trim().toLowerCase();
    if (!HANDLE.test(h)) {
      setError("Use 3–30 lowercase letters, numbers or dashes, starting and ending with a letter or number.");
      return;
    }
    setBusy(true);
    setError("");
    const row = { user_id: userId, handle: h, share_enabled: enabled, share_wanted: wanted, updated_at: new Date().toISOString() };
    const { data, error } = await supabase().from("profiles").upsert(row, { onConflict: "user_id" }).select("handle, share_enabled, share_wanted").single();
    setBusy(false);
    if (error) {
      setError(error.code === "23505" ? `“${h}” is already taken. Try another name.` : "Couldn't save. Try again.");
      return;
    }
    setSaved(data as Profile);
    setHandle((data as Profile).handle);
    toast(enabled ? "Sharing is on" : "Sharing is off");
  }

  const link = saved ? `${typeof window !== "undefined" ? window.location.origin : ""}/u/${saved.handle}` : "";

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      toast("Link copied");
    } catch {
      toast("Couldn't copy. Select the link and copy it.");
    }
  }

  return (
    <main className="wrap narrow">
      <div className="page-head">
        <Link href="/" className="btn small back">← All comics</Link>
        <h2>Share my collection</h2>
        <p className="meta">Friends can browse your comics at your own link, without an account. They can&rsquo;t change anything, and they never see what you paid, your notes, or where you keep each comic.</p>
      </div>

      {!loaded ? <div className="empty"><span className="spinner" /> Loading…</div> : (
        <form className="share-form" onSubmit={save}>
          <div className="field wide">
            <label htmlFor="handle">Your link name</label>
            <div className="handle-row">
              <span className="prefix">/u/</span>
              <input id="handle" value={handle} onChange={(e) => setHandle(e.target.value.toLowerCase())} placeholder="layla" autoComplete="off" autoCapitalize="none" spellCheck={false} />
            </div>
          </div>
          <label className="check"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Share my collection</label>
          <label className="check"><input type="checkbox" checked={wanted} onChange={(e) => setWanted(e.target.checked)} disabled={!enabled} /> Show my want list too (handy for gift ideas)</label>
          {error ? <p className="error" role="alert">{error}</p> : null}
          <div className="actions"><button className="btn primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</button></div>

          {saved?.share_enabled ? (
            <div className="share-link">
              <span className="section-label" style={{ margin: 0 }}>Your link</span>
              <code>{link}</code>
              <div className="actions">
                <button type="button" className="btn small" onClick={copy}>Copy link</button>
                <Link className="btn small" href={`/u/${saved.handle}`}>Open it</Link>
              </div>
            </div>
          ) : saved ? <p className="hint">Sharing is off. Your link shows nothing until you turn it back on.</p> : null}
        </form>
      )}
    </main>
  );
}
