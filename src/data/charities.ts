// SEED LIST ONLY. Charities are managed in the admin dashboard and stored in the database.
// This file fills an empty database on first worker start, so the admin has rows to edit.
//
// RULES (also enforced by the admin screen)
// - A wallet MUST be copied from the charity's own official site or verified donate page.
// - The page where it is published goes in wallet_source_url and is shown publicly.
// - Never use a wallet that we or Trencher control.
// - Nothing is selectable until an admin marks it verified.
//
// Entries below are placeholders. They carry no wallets and are not verified.

export type CharitySeed = {
  slug: string;
  name: string;
  cause: string;
  blurb: string;
};

export const CHARITY_SEED: CharitySeed[] = [
  { slug: "example-charity-1", name: "Example Charity One (placeholder)", cause: "Placeholder", blurb: "Replace in admin." },
  { slug: "example-charity-2", name: "Example Charity Two (placeholder)", cause: "Placeholder", blurb: "Replace in admin." },
];
