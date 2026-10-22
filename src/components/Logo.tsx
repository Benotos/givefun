export default function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
        <defs>
          <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffc766" />
            <stop offset="1" stopColor="#ff6a45" />
          </linearGradient>
        </defs>
        <circle cx="16" cy="16" r="15" fill="url(#lg)" />
        <circle cx="16" cy="16" r="11.2" fill="none" stroke="#0b0a09" strokeOpacity=".28" strokeWidth="1.4" />
        <path
          d="M16 23.2c-.3 0-.6-.1-.8-.3C11.1 19.6 8.5 17.2 8.5 14.1c0-2.1 1.6-3.7 3.6-3.7 1.5 0 2.9.9 3.9 2.2 1-1.3 2.4-2.2 3.9-2.2 2 0 3.6 1.6 3.6 3.7 0 3.1-2.6 5.5-6.7 8.8-.2.2-.5.3-.8.3Z"
          fill="#0b0a09"
        />
      </svg>
      <span className="font-display text-[22px] font-extrabold tracking-tight">
        give<span className="text-ember">.fun</span>
      </span>
    </span>
  );
}
