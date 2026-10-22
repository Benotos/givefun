"use client";

import { useEffect } from "react";

// Last line of defense. Any render error shows this friendly page instead of a crash screen.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="mx-auto max-w-xl px-4 py-32 text-center">
      <h1 className="font-display text-3xl font-bold">Something hiccuped</h1>
      <p className="mt-3 text-mute">Your coins and donations are safe on chain. Try again in a moment.</p>
      <button onClick={reset} className="btn mt-8">Try again</button>
    </div>
  );
}
