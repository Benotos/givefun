import Link from "next/link";
import type { Charity } from "@/lib/charities";
import { shortAddr } from "@/lib/format";
import { charityCoverFor } from "@/data/charity-covers";
import CopyButton from "./CopyButton";
import Icon from "./Icon";

function safeExternalUrl(raw: string): string {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : "";
  } catch {
    return "";
  }
}

// Photo-led charity cards with a wide cover, cause tag, raised total, and quick actions.
export default function CharityCard({ c, rank }: { c: Charity; rank?: number }) {
  const live = c.verified && c.active;
  const cover = charityCoverFor({ slug: c.slug, name: c.name, cause: c.cause, blurb: c.blurb });
  const siteUrl = safeExternalUrl(c.site_url);
  const raised = (Number(c.lamports ?? 0) / 1_000_000_000).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const category = c.cause?.trim() || "Community";

  return (
    <article className="card card-hover group flex h-full flex-col overflow-hidden">
      <Link
        href={`/charity/${c.slug}`}
        aria-label={`View ${c.name} charity details`}
        className="relative block h-32 shrink-0 overflow-hidden bg-raise"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={cover}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-ink/95 via-ink/25 to-ink/25" />
        <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-ink/70 to-transparent" />
        <span className="absolute bottom-3 left-3 max-w-[70%] truncate rounded-full border border-white/15 bg-black/45 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white backdrop-blur-sm">
          {category}
        </span>
        <span
          className={`absolute right-3 top-3 inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold backdrop-blur-sm ${
            live ? "border-mint/30 bg-ink/65 text-mint" : "border-amber/30 bg-ink/65 text-amber"
          }`}
        >
          <Icon name={live ? "shield" : "eye"} size={11} />
          {live ? "Verified" : "Pending"}
        </span>
        {rank !== undefined && (
          <span className="absolute left-3 top-3 rounded-md bg-black/40 px-1.5 py-1 font-mono text-[10px] text-white/80">
            #{rank}
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col p-5">
        <Link href={`/charity/${c.slug}`} className="group/title rounded-sm focus-visible:outline-offset-4">
          <h3 className="line-clamp-2 min-h-[2.8rem] font-display text-lg font-bold leading-[1.2] transition group-hover/title:text-ember">
            {c.name}
          </h3>
        </Link>
        <p className="mt-2 line-clamp-2 min-h-10 text-sm leading-5 text-mute">{c.blurb || "Support this cause through transparent, on-chain giving."}</p>

        <div className="mt-4 rounded-xl border border-mint/10 bg-mint/[0.07] p-3.5">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.13em] text-mute">
            <Icon name="heart" size={13} />
            Total raised
          </div>
          <div className="mt-1 font-display text-xl font-extrabold leading-tight text-mint">
            {raised} <span className="text-sm font-bold">SOL</span>
          </div>
        </div>

        <div className="mt-auto grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2 pt-4">
          {siteUrl ? (
            <a href={siteUrl} target="_blank" rel="noreferrer" className="btn-ghost btn-sm min-w-0">
              <Icon name="external" size={13} />
              Visit
            </a>
          ) : (
            <Link href={`/charity/${c.slug}`} className="btn-ghost btn-sm min-w-0">
              Details
            </Link>
          )}
          {c.wallet ? (
            <div className="min-w-0 [&>button]:flex [&>button]:w-full [&>button]:justify-center [&>button]:truncate [&>button]:px-2 [&>button]:text-[10px]">
              <CopyButton text={c.wallet} label={shortAddr(c.wallet, 4)} />
            </div>
          ) : (
            <span className="inline-flex min-w-0 items-center justify-center rounded-lg border border-line px-2 py-1.5 text-[10px] text-faint">
              Wallet pending
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
