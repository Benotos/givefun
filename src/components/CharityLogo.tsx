"use client";
import { useState } from "react";
import { CHARITY_IMAGES } from "@/data/charity-images";

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Charity logo tile. Order: your override, the site's own icon, then initials. Never breaks the layout. */
export default function CharityLogo({
  slug,
  name,
  siteUrl,
  size = 56,
  className = "",
}: {
  slug: string;
  name: string;
  siteUrl?: string;
  size?: number;
  className?: string;
}) {
  const domain = siteUrl ? domainOf(siteUrl) : "";
  const list = [
    CHARITY_IMAGES[slug],
    domain ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=256` : "",
  ].filter(Boolean) as string[];
  const [i, setI] = useState(0);
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-cream shadow-lift ${className}`}
      style={{ width: size, height: size }}
    >
      {i < list.length ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={list[i]}
          alt={`${name} logo`}
          width={size}
          height={size}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setI((n) => n + 1)}
          className="h-full w-full object-contain p-2"
        />
      ) : (
        <span className="font-display font-extrabold text-ink" style={{ fontSize: size * 0.36 }}>
          {initials}
        </span>
      )}
    </div>
  );
}