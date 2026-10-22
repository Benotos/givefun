import { gradientFor } from "@/lib/format";

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
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={image} alt="" width={size} height={size} loading="lazy" className={`${rounded} shrink-0 object-cover`} style={{ width: size, height: size }} />;
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
