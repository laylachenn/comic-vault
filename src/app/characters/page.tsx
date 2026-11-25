"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Masthead } from "@/components/Masthead";
import { CoverImage } from "@/components/Cover";
import { api } from "@/lib/api";
import type { CvCharacter } from "@/lib/types";

export default function Page() {
  return (
    <Suspense fallback={<div className="splash">Opening the vault…</div>}>
      <Masthead />
      <CharacterSearch />
    </Suspense>
  );
}

function CharacterSearch() {
  const params = useSearchParams();
  const router = useRouter();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [results, setResults] = useState<CvCharacter[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ran = useRef(false);

  async function search(text = q) {
    const term = text.trim();
    if (term.length < 2) { setError("Type at least two letters of a name."); return; }
    setBusy(true);
    setError("");
    router.replace(`/characters?q=${encodeURIComponent(term)}`, { scroll: false });
    try {
      setResults((await api<{ characters: CvCharacter[] }>(`/api/cv/characters?q=${encodeURIComponent(term)}`)).characters);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!ran.current && q.trim()) { ran.current = true; search(q); }
    // run once for a ?q= link
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="wrap narrow">
      <div className="page-head">
        <Link href="/" className="btn small back">← All comics</Link>
        <h2>Find a character</h2>
        <p className="meta">See every comic a character has appeared in, and which ones you have.</p>
      </div>
      <form className="searchbar" role="search" onSubmit={(e) => { e.preventDefault(); search(); }}>
        <input id="character-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder='Try "Miles Morales" or "Storm"' aria-label="Search for a character" autoComplete="off" autoFocus />
      </form>
      <div className="actions" style={{ marginTop: 10 }}>
        <button className="btn small primary" onClick={() => search()} disabled={busy}>{busy ? "Searching…" : "Search"}</button>
      </div>
      {error ? <p className="notice" role="alert">{error}</p> : null}
      {results ? (
        results.length ? (
          <div className="results">
            {results.map((c) => (
              <Link key={c.id} className="vol" href={`/character?id=${c.id}`}>
                <CoverImage src={c.image} title={c.name} />
                <span>
                  <span className="name">{c.name}</span><br />
                  <span className="sub">{[c.real_name && c.real_name !== c.name ? c.real_name : null, c.publisher].filter(Boolean).join(" · ") || "Unknown publisher"}</span>
                </span>
                <span className="count">{c.appearances?.toLocaleString() ?? "?"} comics</span>
              </Link>
            ))}
          </div>
        ) : <div className="empty"><p>No characters called &ldquo;{q.trim()}&rdquo;. Check the spelling or try fewer words.</p></div>
      ) : null}
    </main>
  );
}
