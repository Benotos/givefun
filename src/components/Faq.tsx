export type FaqItem = { q: string; a: string };

export default function Faq({ items }: { items: FaqItem[] }) {
  return (
    <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-panel">
      {items.map((f) => (
        <details key={f.q} className="group px-5 py-4 open:bg-raise/50">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display text-base font-semibold [&::-webkit-details-marker]:hidden">
            {f.q}
            <span className="text-xl text-ember transition group-open:rotate-45">+</span>
          </summary>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-mute">{f.a}</p>
        </details>
      ))}
    </div>
  );
}
