import { strict as assert } from "node:assert";
import { charityCoverFor } from "../src/data/charity-covers";

const oceanCover = "https://images.unsplash.com/photo-1500375592092-40eb2168fd21?auto=format&fit=crop&w=1400&q=80";
const animalCover = "https://images.unsplash.com/photo-1548199973-03cce0bbc87b?auto=format&fit=crop&w=1400&q=80";

// The declared cause must win when other fields contain conflicting keywords.
assert.equal(
  charityCoverFor({
    slug: "dog-rescue",
    name: "Dog Rescue Foundation",
    cause: "Ocean Conservation",
    blurb: "Rescues abandoned dogs.",
  }),
  oceanCover,
);

assert.equal(
  charityCoverFor({
    slug: "ocean-cleanup",
    name: "Ocean Cleanup",
    cause: "Animals",
    blurb: "Protects ocean wildlife.",
  }),
  animalCover,
);

// When the cause is absent or unknown, infer from the charity's name and blurb.
assert.equal(
  charityCoverFor({ slug: "marine-megafauna", name: "Marine Megafauna Foundation" }),
  oceanCover,
);

console.log("PASS charity cover selection prioritizes the declared cause and has an inference fallback");
