import Icon from "./Icon";

const MAP = {
  verified: { text: "Verified on chain", cls: "border-mint/30 bg-mint/10 text-mint", icon: "shield" as const },
  pending: { text: "Verifying", cls: "border-amber/30 bg-amber/10 text-amber", icon: "eye" as const },
  revoked: { text: "Verification removed", cls: "border-rose/30 bg-rose/10 text-rose", icon: "alert" as const },
  failed: { text: "Not verified", cls: "border-rose/30 bg-rose/10 text-rose", icon: "alert" as const },
  hidden: { text: "Hidden", cls: "border-line bg-white/5 text-mute", icon: "eye" as const },
};

export default function VerifiedBadge({ status, className = "" }: { status: keyof typeof MAP; className?: string }) {
  const m = MAP[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${m.cls} ${className}`}>
      <Icon name={m.icon} size={14} />
      {m.text}
    </span>
  );
}
