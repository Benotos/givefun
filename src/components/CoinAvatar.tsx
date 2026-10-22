"use client";
import { useState } from "react";
import { gradientFor } from "@/lib/format";

// Public IPFS gateways are flaky for fresh pins, so try several before falling back to the gradient tile.
const GATEWAYS = ["https://ipfs.io/ipfs/", "https://dweb.link/ipfs/", "https://gateway.pinata.cloud/ipfs/", "https://w3s.link/ipfs/"];

function candidates(image: string): string[] {
  const m = image.match(/\/ipfs\/([A-Za-z0-9]+(?:\/[^?#]*)?)/);
  if (!m) return [image];
  const list = [image, ...GATEWAYS.map((g) => g + m[1])];
  return Array.from(new Set(list));
}

export default function CoinAvatar({
  mint,
  symbol,
  image,
  size = 48,
  rounded = "rounded-2xl",
}: {
  mint: string;
  symbol: string;
  image: string | null;
  size?: number;
  rounded?: string;
}) {
  const [a, b] = gradientFor(mint);
  const list = image ? candidates(image) : [];
  const [i, setI] = useState(0);
  if (image && i < list.length) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={list[i]}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setI((n) => n + 1)}
        className={`${rounded} shrink-0 object-cover`}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className={`${rounded} flex shrink-0 items-center justify-center font-display font-extrabold text-ink`}
      style={{ width: size, height: size, background: `linear-gradient(135deg, ${a}, ${b})`, fontSize: size * 0.34 }}
      aria-hidden="true"
    >
      {symbol.slice(0, 2)}
    </div>
  );
}