"use client";

import { useId, useState } from "react";

/** A list of names typed one at a time, with suggestions from what you've used before. */
export function TagInput({ id, label, value, onChange, suggestions, placeholder }: {
  id: string;
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
  suggestions: string[];
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");
  const listId = useId();

  function add(raw: string) {
    const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return;
    const lower = value.map((v) => v.toLowerCase());
    onChange([...value, ...parts.filter((p) => !lower.includes(p.toLowerCase()))]);
    setDraft("");
  }

  return (
    <div className="field wide">
      <label htmlFor={id}>{label}</label>
      <div className="tags">
        {value.map((t) => (
          <span className="tag" key={t}>
            {t}
            <button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(value.filter((x) => x !== t))}>×</button>
          </span>
        ))}
        <input
          id={id}
          list={listId}
          value={draft}
          placeholder={value.length ? "" : placeholder}
          autoComplete="off"
          onChange={(e) => {
            const v = e.target.value;
            if (v.endsWith(",")) add(v);
            else setDraft(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); add(draft); }
            if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
          }}
          onBlur={() => add(draft)}
        />
      </div>
      <datalist id={listId}>
        {suggestions.slice(0, 300).map((s) => <option key={s} value={s} />)}
      </datalist>
    </div>
  );
}
