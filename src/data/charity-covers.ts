// Wide, category-led cover photography for charity cards.
// These are illustrative stock images, not claims to show the specific charity or its beneficiaries.
const COVERS = {
  animals: "https://images.unsplash.com/photo-1548199973-03cce0bbc87b?auto=format&fit=crop&w=1400&q=80",
  community: "https://images.unsplash.com/photo-1469571486292-0ba58a3f068b?auto=format&fit=crop&w=1400&q=80",
  water: "https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1400&q=80",
  education: "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=1400&q=80",
  health: "https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=1400&q=80",
  ocean: "https://images.unsplash.com/photo-1500375592092-40eb2168fd21?auto=format&fit=crop&w=1400&q=80",
} as const;

export type CharityCoverTheme = keyof typeof COVERS;

function themeFromText(value: string): CharityCoverTheme | null {
  const text = value.toLowerCase();

  // Specific ecological themes are checked before generic words like "rescue" or "conservation".
  if (/ocean|marine|megafauna|whale|sea turtle|sea life|coral reef|ocean cleanup/.test(text)) return "ocean";
  if (/animal|pet|wildlife|dog|cat|rescue|shelter/.test(text)) return "animals";
  if (/education|school|student|code\.org|coding|computer science|learning/.test(text)) return "education";
  if (/health|doctor|medical|hospital|mental health|wellbeing|well-being|healthcare|medical aid/.test(text)) return "health";
  if (/watershed|freshwater|water access|river|climate|forest|environment|conservation|clean water|ecosystem/.test(text)) return "water";
  if (/poverty|givedirectly|give directly|relief|food security|child|children|outreach|humanitarian|community support/.test(text)) return "community";
  return null;
}

/**
 * Treat the admin's declared cause as the source of truth. Only infer from the charity's
 * name and blurb when its cause is missing or doesn't match a known category. This prevents
 * a word in a name/blurb (e.g. "rescue") overriding an "Ocean Conservation" cause badge.
 */
export function charityCoverFor(input: { slug: string; name: string; cause?: string; blurb?: string }): string {
  const causeTheme = themeFromText(input.cause ?? "");
  if (causeTheme) return COVERS[causeTheme];

  const inferred = themeFromText(`${input.slug} ${input.name} ${input.blurb ?? ""}`);
  return COVERS[inferred ?? "community"];
}
