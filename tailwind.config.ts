import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0b0a09",
        panel: "#13110f",
        raise: "#1a1714",
        line: "#2a2520",
        cream: "#f5efe4",
        mute: "#a69d90",
        faint: "#6f675c",
        ember: "#ff6a45",
        amber: "#ffc766",
        mint: "#86efb2",
        rose: "#ff8aa1",
      },
      fontFamily: {
        display: ['"Bricolage Grotesque Variable"', "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ['"Instrument Sans Variable"', "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono Variable"', "ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(255,106,69,0.25), 0 10px 40px -10px rgba(255,106,69,0.35)",
        lift: "0 1px 0 rgba(255,255,255,0.04) inset, 0 20px 50px -25px rgba(0,0,0,0.8)",
      },
      keyframes: {
        fadeUp: { "0%": { opacity: "0", transform: "translateY(14px)" }, "100%": { opacity: "1", transform: "none" } },
        slideIn: { "0%": { opacity: "0", transform: "translateY(-10px) scale(0.98)" }, "100%": { opacity: "1", transform: "none" } },
        marquee: { "0%": { transform: "translateX(0)" }, "100%": { transform: "translateX(-50%)" } },
        pulseDot: { "0%,100%": { opacity: "1", transform: "scale(1)" }, "50%": { opacity: "0.45", transform: "scale(0.8)" } },
        shimmer: { "0%": { backgroundPosition: "-200% 0" }, "100%": { backgroundPosition: "200% 0" } },
      },
      animation: {
        fadeUp: "fadeUp 0.6s cubic-bezier(0.22,1,0.36,1) both",
        slideIn: "slideIn 0.5s cubic-bezier(0.22,1,0.36,1) both",
        marquee: "marquee 50s linear infinite",
        pulseDot: "pulseDot 1.8s ease-in-out infinite",
        shimmer: "shimmer 2.2s linear infinite",
      },
    },
  },
  plugins: [],
};
export default config;
