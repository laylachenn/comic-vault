"use client";

import Link from "next/link";
import { useState } from "react";
import { useVault } from "./VaultProvider";
import { toCsv } from "@/lib/comics";

export function Masthead() {
  const { comics, signOut, session } = useVault();
  const [menu, setMenu] = useState(false);

  function exportCsv() {
    const blob = new Blob([toCsv(comics)], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `comic-vault-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    setMenu(false);
  }

  return (
    <header className="mast">
      <div className="wrap mast-row">
        <Link href="/" className="brand"><h1>LAYLA&rsquo;S COMIC VAULT</h1></Link>
        <nav className="mast-actions">
          <Link href="/add" className="btn primary">+ Add comic</Link>
          <div className="menu-wrap">
            <button className="btn" aria-expanded={menu} aria-haspopup="menu" onClick={() => setMenu((m) => !m)}>Menu</button>
            {menu ? (
              <div className="menu" role="menu">
                <span className="menu-who">{session?.user.email}</span>
                <button role="menuitem" onClick={exportCsv} disabled={!comics.length}>Download backup (.csv)</button>
                <button role="menuitem" onClick={signOut}>Sign out</button>
              </div>
            ) : null}
          </div>
        </nav>
      </div>
    </header>
  );
}
