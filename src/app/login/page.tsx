"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setDone("");
    const sb = supabase();
    if (mode === "in") {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) setError(error.message === "Invalid login credentials" ? "That email and password don't match. Try again." : error.message);
    } else {
      if (password.length < 8) { setError("Use a password of at least 8 characters."); setBusy(false); return; }
      const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
      if (error) setError(error.message);
      else if (!data.session) setDone("Check your email for a confirmation link, then come back and sign in.");
    }
    setBusy(false);
  }

  return (
    <main className="wrap auth">
      <div className="brand"><h1>LAYLA&rsquo;S COMIC VAULT</h1></div>
      <form onSubmit={submit}>
        <h2>{mode === "in" ? "Sign in" : "Make an account"}</h2>
        <div className="field wide">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field wide">
          <label htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete={mode === "in" ? "current-password" : "new-password"} required minLength={mode === "up" ? 8 : undefined}
            value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error ? <p className="error" role="alert">{error}</p> : null}
        {done ? <p className="ok" role="status">{done}</p> : null}
        <button className="btn primary" type="submit" disabled={busy}>{busy ? "One moment…" : mode === "in" ? "Sign in" : "Make my vault"}</button>
        <p className="hint">
          {mode === "in" ? "New here? " : "Already have an account? "}
          <button type="button" className="linkish" onClick={() => { setMode(mode === "in" ? "up" : "in"); setError(""); setDone(""); }}>
            {mode === "in" ? "Make an account" : "Sign in"}
          </button>
        </p>
      </form>
    </main>
  );
}
