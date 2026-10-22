"use client";

import Link from "next/link";
import { useState } from "react";
import Logo from "./Logo";
import Icon from "./Icon";
import XIcon from "./XIcon";
import { X_URL } from "@/lib/config";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/explore", label: "Explore" },
  { href: "/charities", label: "Charities" },
  { href: "/how-it-works", label: "How it works" },
];

export default function Header() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-50 border-b border-line/60 bg-ink/75 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" aria-label="give.fun home" onClick={() => setOpen(false)}>
          <Logo />
        </Link>

        <nav className="hidden items-center gap-1 sm:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="rounded-lg px-3.5 py-2 text-sm text-mute transition hover:text-cream">
              {n.label}
            </Link>
          ))}
          <a href={X_URL} target="_blank" rel="noreferrer" aria-label="give.fun on X" className="rounded-lg p-2.5 text-mute transition hover:text-cream">
            <XIcon size={16} />
          </a>
          <Link href="/launch" className="btn btn-sm ml-1">
            Launch a coin <Icon name="arrow" size={14} />
          </Link>
        </nav>

        <button
          className="rounded-lg border border-line p-2 text-cream sm:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <Icon name={open ? "x" : "menu"} />
        </button>
      </div>

      {open && (
        <nav className="border-t border-line bg-ink px-4 pb-5 pt-3 sm:hidden">
          <div className="flex flex-col gap-1">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} onClick={() => setOpen(false)} className="rounded-lg px-3 py-3 text-base text-cream hover:bg-white/5">
                {n.label}
              </Link>
            ))}
            <a href={X_URL} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg px-3 py-3 text-base text-cream hover:bg-white/5">
              <XIcon size={16} /> Follow on X
            </a>
            <Link href="/launch" onClick={() => setOpen(false)} className="btn mt-2">
              Launch a coin
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}