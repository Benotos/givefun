import Link from "next/link";
import type { Charity } from "@/lib/charities";
import { shortAddr } from "@/lib/format";
import CopyButton from "./CopyButton";
import CharityLogo from "./CharityLogo";
import Icon from "./Icon";

function safeExternalUrl(raw: string): string {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : "";
  } catch {
    return "";
  }
}

// Charity cards use the charity's actual site logo/icon, never an unrelated stock photo.
export default function CharityCard({ c, rank }: { c: Charity; rank?: number }) {
  const live = c.verified && c.active;
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
        className="relative block h-36 shrink-0 overflow-hidden border-b border-line bg-gradient-to-br from-panel via-raise to-ink"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,106,69,0.13),transparent_58%)]" />
        <div className="relative flex h-full items-center gap-4 px-4 pt-4">
          <CharityLogo
            slug={c.slug}
            name={c.name}
            siteUrl={siteUrl}
            size={76}
            className="rounded-2xl border border-white/10 shadow-lg"
          />
          <div className="min-w-0 flex-1 pr-1">
            <span className="inline-flex max-w-full truncate rounded-full border border-white/15 bg-black/30 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
              {category}
            </span>
            <div className="mt-2 text-xs text-mute">Official charity</div>
          </div>
        </div>
        <span
          className={`absolute right-3 top-3 inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold backdrop-blur-sm ${
            live ? "border-mint/30 bg-ink/80 text-mint" : "border-amber/30 bg-ink/80 text-amber"
          }`}
        >
          <Icon name={live ? "shield" : "eye"} size={11} />
          {live ? "Verified" : "Pending"}
        </span>
        {rank !== undefined && (
          <span className="absolute left-3 top-3 rounded-md border border-white/10 bg-black/40 px-1.5 py-1 font-mono text-[10px] text-white/80">
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
