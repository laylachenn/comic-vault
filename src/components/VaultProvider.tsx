"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { usePathname, useRouter } from "next/navigation";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import type { Comic } from "@/lib/types";

type Vault = {
  session: Session | null;
  comics: Comic[];
  loaded: boolean;
  loadError: string;
  reload: () => Promise<void>;
  putLocal: (c: Comic) => void;
  removeLocal: (id: string) => void;
  toast: (msg: string) => void;
  signOut: () => Promise<void>;
};

const Ctx = createContext<Vault | null>(null);

export function useVault(): Vault {
  const v = useContext(Ctx);
  if (!v) throw new Error("useVault must be used inside VaultProvider");
  return v;
}

const PAGE = 1000; // Supabase returns at most 1000 rows per request.

async function fetchAll(): Promise<Comic[]> {
  const out: Comic[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase()
      .from("comics")
      .select("*")
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data as Comic[]));
    if (!data || data.length < PAGE) return out;
  }
}

export function VaultProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<Session | null>(null);
  const [checked, setChecked] = useState(false);
  const [comics, setComics] = useState<Comic[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [toastMsg, setToastMsg] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!supabaseConfigured) { setChecked(true); return; }
    const sb = supabase();
    sb.auth.getSession().then(({ data }) => { setSession(data.session); setChecked(true); });
    const { data: sub } = sb.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;

  const reload = useCallback(async () => {
    if (!userId) return;
    try {
      setComics(await fetchAll());
      setLoadError("");
    } catch {
      setLoadError("Your collection couldn't be loaded. Check your connection and reload the page.");
    } finally {
      setLoaded(true);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) { setLoaded(false); reload(); }
    else { setComics([]); setLoaded(false); }
  }, [userId, reload]);

  // Shared collections (/u/<name>) are open to everyone, signed in or not.
  const isPublic = pathname.startsWith("/u/");

  // Send signed-out people to the sign-in page, and signed-in people away from it.
  useEffect(() => {
    if (!checked || !supabaseConfigured) return;
    if (!session && pathname !== "/login" && !isPublic) router.replace("/login");
    if (session && pathname === "/login") router.replace("/");
  }, [checked, session, pathname, router, isPublic]);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(""), 2800);
  }, []);

  const value = useMemo<Vault>(() => ({
    session,
    comics,
    loaded,
    loadError,
    reload,
    putLocal: (c) => setComics((list) => {
      const i = list.findIndex((x) => x.id === c.id);
      if (i === -1) return [c, ...list];
      const next = list.slice();
      next[i] = c;
      return next;
    }),
    removeLocal: (id) => setComics((list) => list.filter((x) => x.id !== id)),
    toast,
    signOut: async () => { await supabase().auth.signOut(); router.replace("/login"); },
  }), [session, comics, loaded, loadError, reload, toast, router]);

  if (!supabaseConfigured) {
    return (
      <main className="wrap setup">
        <h1>Almost there</h1>
        <p>The site needs its Supabase and Comic Vine settings. Copy <code>.env.local.example</code> to <code>.env.local</code>, fill in the three values, then restart <code>npm run dev</code>.</p>
      </main>
    );
  }

  const waiting = !checked || (!session && pathname !== "/login" && !isPublic) || (session && pathname === "/login");

  return (
    <Ctx.Provider value={value}>
      {waiting ? <div className="splash">Opening the vault…</div> : children}
      {toastMsg ? <div className="toast" role="status">{toastMsg}</div> : null}
    </Ctx.Provider>
  );
}
