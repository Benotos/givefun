import Link from "next/link";
import Logo from "./Logo";

export default function Footer() {
  return (
    <footer className="border-t border-line/70">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-[1.4fr_1fr_1fr] sm:px-6">
        <div>
          <Logo size={24} />
          <p className="mt-4 max-w-xs text-sm text-mute">
            Charity coins on pump.fun. The split is locked on chain and every payout is a public transaction.
          </p>
        </div>
        <div className="text-sm">
          <div className="label">Explore</div>
          <ul className="space-y-2 text-mute">
            <li><Link className="hover:text-cream" href="/charities">Charities</Link></li>
            <li><Link className="hover:text-cream" href="/how-it-works">How it works</Link></li>
            <li><Link className="hover:text-cream" href="/launch">Launch a coin</Link></li>
          </ul>
        </div>
        <div className="text-sm">
          <div className="label">Trust</div>
          <ul className="space-y-2 text-mute">
            <li>No custom contract</li>
            <li>We never hold donations</li>
            <li>Every charity wallet is sourced</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-line/70 px-4 py-5 text-center text-xs text-faint">
        Memecoins are volatile and risky. Nothing here is financial advice.
      </div>
    </footer>
  );
}
