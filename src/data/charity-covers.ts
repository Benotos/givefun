// Wide, category-led cover photography for charity cards.
// Unsplash photos are used as illustrative category imagery, not as claims that a photo depicts the named charity.
const COVERS = {
  animals: "https://images.unsplash.com/photo-1548199973-03cce0bbc87b?auto=format&fit=crop&w=1400&q=80",
  community: "https://images.unsplash.com/photo-1469571486292-0ba58a3f068b?auto=format&fit=crop&w=1400&q=80",
  water: "https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=1400&q=80",
  education: "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=1400&q=80",
  health: "https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=1400&q=80",
  ocean: "https://images.unsplash.com/photo-1500375592092-40eb2168fd21?auto=format&fit=crop&w=1400&q=80",
} as const;

/** Select a relevant cover from the charity's existing metadata, with a safe visual fallback. */
export function charityCoverFor(input: { slug: string; name: string; cause?: string; blurb?: string }): string {
  const text = `${input.slug} ${input.name} ${input.cause ?? ""} ${input.blurb ?? ""}`.toLowerCase();

  if (/animal|pet|wildlife|dog|cat|rescue|shelter/.test(text)) return COVERS.animals;
  if (/ocean|marine|megafauna|whale|sea turtle|sea life|ocean cleanup/.test(text)) return COVERS.ocean;
  if (/watershed|freshwater|water access|river|climate|forest|environment|conservation/.test(text)) return COVERS.water;
  if (/education|school|student|code\.org|coding|computer science|learning/.test(text)) return COVERS.education;
  if (/health|doctor|medical|hospital|mental health|wellbeing|well-being|stay here|healthcare|care foundation|givewell/.test(text)) return COVERS.health;
  if (/poverty|givedirectly|give directly|relief|food security|child|children|outreach|humanitarian|donate crypto/.test(text)) return COVERS.community;

  return COVERS.community;
}
