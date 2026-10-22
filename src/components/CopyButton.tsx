"use client";

import { useState } from "react";
import Icon from "./Icon";

export default function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1400);
        } catch {
          /* clipboard blocked, ignore */
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs text-mute transition hover:border-mute/50 hover:text-cream"
      aria-label={`${label} to clipboard`}
    >
      <Icon name={done ? "check" : "copy"} size={13} />
      {done ? "Copied" : label}
    </button>
  );
}
