"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Masthead } from "@/components/Masthead";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { CoverImage } from "@/components/Cover";
import { CvIssueCard, useAddFromCv } from "@/components/CvIssues";
import { useVault } from "@/components/VaultProvider";
import { api } from "@/lib/api";
import { parseAddOn, variantLabel, type ComicBarcode } from "@/lib/barcode";
import { CoverChooser } from "@/components/CoverChooser";
import { supabase } from "@/lib/supabase";
import type { Comic, CvIssue, CvVolume } from "@/lib/types";

type Mapping = { code: string; cv_volume_id: number; series_name: string; volume_year: string | null };
type Step =
  | { kind: "scanning" }
  | { kind: "pick"; barcode: ComicBarcode; issue: string; fixing: boolean }
  | { kind: "result"; barcode: ComicBarcode; issue: string; series: Mapping };

export default function ScanPage() {
  const [step, setStep] = useState<Step>({ kind: "scanning" });
  const [scanKey, setScanKey] = useState(0);
  const [error, setError] = useState("");

  function scanAgain() {
    setError("");
    setStep({ kind: "scanning" });
    setScanKey((k) => k + 1);
  }

  async function onBarcode(barcode: ComicBarcode) {
    const issue = parseAddOn(barcode.addon)?.issue ?? "";
    const { data, error } = await supabase().from("barcode_series").select("code, cv_volume_id, series_name, volume_year").eq("code", barcode.main).maybeSingle();
    if (error) { setError("Couldn't look up that barcode. Check your connection and scan again."); return; }
    setStep(data ? { kind: "result", barcode, issue, series: data as Mapping } : { kind: "pick", barcode, issue, fixing: false });
  }

  async function chooseSeries(barcode: ComicBarcode, issue: string, v: { id: number; name: string; start_year: string | null }) {
    const { data: session } = await supabase().auth.getSession();
    const row = { code: barcode.main, cv_volume_id: v.id, series_name: v.name, volume_year: v.start_year, updated_by: session.session?.user.id, updated_at: new Date().toISOString() };
    const { error } = await supabase().from("barcode_series").upsert(row, { onConflict: "code" });
    if (error) { setError("Couldn't save that match. Try again."); return; }
    setError("");
    setStep({ kind: "result", barcode, issue, series: row as Mapping });
  }

  return (
    <>
      <Masthead />
      <main className="wrap narrow">
        <div className="page-head">
          <Link href="/" className="btn small back">← All comics</Link>
          <h2>Scan a barcode</h2>
          {step.kind === "scanning" ? <p className="meta">Works on comics with a barcode, roughly from the 1980s on. For older ones, use <Link href="/add">Add comic</Link>.</p> : null}
        </div>
        {error ? <p className="notice" role="alert">{error}</p> : null}

        {step.kind === "scanning" ? <BarcodeScanner key={scanKey} onResult={onBarcode} /> : null}

        {step.kind === "pick" ? (
          <SeriesPicker
            barcode={step.barcode}
            issue={step.issue}
            fixing={step.fixing}
            onPick={(v, issue) => chooseSeries(step.barcode, issue, v)}
            onCancel={scanAgain}
          />
        ) : null}

        {step.kind === "result" ? (
          <ScanResult
            barcode={step.barcode}
            issue={step.issue}
            series={step.series}
            onIssue={(issue) => setStep({ ...step, issue })}
            onWrongSeries={() => setStep({ kind: "pick", barcode: step.barcode, issue: step.issue, fixing: true })}
            onNext={scanAgain}
          />
        ) : null}
      </main>
    </>
  );
}

function BarcodeLine({ barcode, issue }: { barcode: ComicBarcode; issue: string }) {
  const a = parseAddOn(barcode.addon);
  return (
    <p className="runline">
      Barcode <b>{barcode.main}</b>{barcode.addon ? <> · add-on <b>{barcode.addon}</b></> : null}
      {issue ? <> · issue <b>#{issue}</b></> : null}
      {a && (a.cover !== "1" || a.printing !== "1") ? <> · cover {a.cover}, printing {a.printing}</> : null}
    </p>
  );
}

/** First time a barcode is seen: which series is it? Your own series are offered first. */
function SeriesPicker({ barcode, issue: initialIssue, fixing, onPick, onCancel }: {
  barcode: ComicBarcode;
  issue: string;
  fixing: boolean;
  onPick: (v: { id: number; name: string; start_year: string | null }, issue: string) => void;
  onCancel: () => void;
}) {
  const { comics } = useVault();
  const [q, setQ] = useState("");
  const [issue, setIssue] = useState(initialIssue);
  const [results, setResults] = useState<CvVolume[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const mine = useMemo(() => {
    const seen = new Map<number, { id: number; name: string; start_year: string | null; at: string }>();
    for (const c of comics) {
      if (!c.cv_volume_id) continue;
      const prev = seen.get(c.cv_volume_id);
      if (!prev || c.created_at > prev.at) seen.set(c.cv_volume_id, { id: c.cv_volume_id, name: c.series, start_year: c.volume_year, at: c.created_at });
    }
    return [...seen.values()].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 12);
  }, [comics]);

  async function search(e?: { preventDefault(): void }) {
    e?.preventDefault();
    if (q.trim().length < 2) { setError("Type at least two letters of the series name."); return; }
    setBusy(true);
    setError("");
    try {
      const { volumes } = await api<{ volumes: CvVolume[] }>(`/api/cv/volumes?q=${encodeURIComponent(q.trim())}`);
      setResults(volumes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const pick = (v: { id: number; name: string; start_year: string | null }) => {
    if (!issue.trim()) { setError("Type the issue number first."); return; }
    onPick(v, issue.trim().replace(/^#/, ""));
  };

  return (
    <section className="scan-step">
      <h3>{fixing ? "Which series is it really?" : "New barcode. Which series is this?"}</h3>
      <p className="hint">{fixing ? "Pick the right one and the barcode will be corrected for everyone." : "You only do this once per series. Next time this barcode is scanned, it matches straight away."}</p>
      <BarcodeLine barcode={barcode} issue={issue} />
      {!initialIssue ? (
        <div className="field" style={{ maxWidth: 160 }}>
          <label htmlFor="scan-issue">Issue #</label>
          <input id="scan-issue" inputMode="numeric" value={issue} onChange={(e) => setIssue(e.target.value)} placeholder="16" autoComplete="off" />
        </div>
      ) : null}

      {mine.length ? (
        <>
          <div className="section-label">Your series</div>
          <div className="chips">{mine.map((v) => <button key={v.id} className="chip" onClick={() => pick(v)}>{v.name}{v.start_year ? ` (${v.start_year})` : ""}</button>)}</div>
        </>
      ) : null}

      <form className="searchbar" onSubmit={search} role="search">
        <input id="scan-series-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Or search for the series" aria-label="Search for the series" autoComplete="off" />
      </form>
      <div className="actions">
        <button className="btn small primary" onClick={() => search()} disabled={busy}>{busy ? "Searching…" : "Search"}</button>
        <button className="btn small" onClick={onCancel}>Scan again</button>
      </div>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {results ? (
        <div className="results">
          {results.length ? results.map((v) => (
            <button key={v.id} className="vol" onClick={() => pick(v)}>
              <CoverImage src={v.image} title={v.name} />
              <span><span className="name">{v.name}{v.start_year ? ` (${v.start_year})` : ""}</span><br /><span className="sub">{v.publisher || "Unknown publisher"}</span></span>
              <span className="count">{v.count_of_issues ?? "?"} issues</span>
            </button>
          )) : <p className="hint">No series found. Try fewer words.</p>}
        </div>
      ) : null}
    </section>
  );
}

/** The matched issue, ready to add. */
function ScanResult({ barcode, issue, series, onIssue, onWrongSeries, onNext }: {
  barcode: ComicBarcode;
  issue: string;
  series: Mapping;
  onIssue: (issue: string) => void;
  onWrongSeries: () => void;
  onNext: () => void;
}) {
  const { comics } = useVault();
  const { add, busy } = useAddFromCv();
  const [issues, setIssues] = useState<CvIssue[] | null>(null);
  const [error, setError] = useState("");
  const [typed, setTyped] = useState("");
  const [chooseFor, setChooseFor] = useState<Comic | null>(null);
  const variant = variantLabel(barcode.addon);
  const name = `${series.series_name}${series.volume_year ? ` (${series.volume_year})` : ""}`;

  useEffect(() => {
    if (!issue) return;
    let cancelled = false;
    setIssues(null);
    setError("");
    api<{ issues: CvIssue[] }>(`/api/cv/issues?volume=${series.cv_volume_id}&issue=${encodeURIComponent(issue)}`)
      .then((r) => { if (!cancelled) setIssues(r.issues); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load that issue."); });
    return () => { cancelled = true; };
  }, [issue, series.cv_volume_id]);

  const mineFor = (id: number): Comic[] => comics.filter((c) => c.cv_issue_id === id);

  return (
    <section className="scan-step">
      <h3>{name}{issue ? ` #${issue}` : ""}</h3>
      <BarcodeLine barcode={barcode} issue={issue} />

      {!issue ? (
        <form className="actions" onSubmit={(e) => { e.preventDefault(); if (typed.trim()) onIssue(typed.trim().replace(/^#/, "")); }}>
          <span className="hint">Couldn&rsquo;t read the issue number. Type it:</span>
          <label className="sr-only" htmlFor="scan-typed-issue">Issue number</label>
          <input id="scan-typed-issue" className="inline-input" inputMode="numeric" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="16" autoComplete="off" autoFocus />
          <button className="btn small primary" type="submit">Find it</button>
        </form>
      ) : null}

      {error ? <p className="notice" role="alert">{error}</p> : null}
      {issue && !issues && !error ? <div className="empty"><span className="spinner" /> Finding issue #{issue}…</div> : null}
      {issues && !issues.length ? (
        <p className="notice">{name} has no issue #{issue} on Comic Vine. If the series is wrong, fix it below.</p>
      ) : null}
      {issues?.length ? (
        <div className="grid scan-grid">
          {issues.map((i) => (
            <CvIssueCard key={i.id} issue={i} mine={mineFor(i.id)} busy={!!busy[i.id]} seriesTitle={series.series_name}
              startOpen noDefaultCover={!!variant}
              onAdd={async (status, existing, coverUrl) => {
                const saved = await add({ ...i, volume_name: i.volume_name ?? series.series_name }, status, existing, { variant, coverUrl });
                // No cover picked for a variant: offer the picker (and a photo) right after adding.
                if (saved && variant && status === "owned" && !coverUrl) setChooseFor(saved);
              }} />
          ))}
        </div>
      ) : null}

      {variant && issues?.length && !chooseFor ? (
        <p className="hint">This barcode says <b>{variant}</b>. Tap the cover that matches your copy, then add it. The variant is saved for you.</p>
      ) : null}
      {chooseFor ? (
        <CoverChooser
          comic={comics.find((c) => c.id === chooseFor.id) ?? chooseFor}
          intro={`Your copy is ${variant}. Which cover is it?`}
          onClose={() => setChooseFor(null)}
        />
      ) : null}

      <div className="actions">
        <button className="btn primary" onClick={onNext}>Scan next comic</button>
        <button className="btn small" onClick={onWrongSeries}>Wrong series?</button>
        <Link className="btn small" href={`/series?key=cv-${series.cv_volume_id}`}>See the series</Link>
      </div>
    </section>
  );
}
