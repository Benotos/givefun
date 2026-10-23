import { Keypair } from "@solana/web3.js";

type StartMessage = { type: "start"; maxAttempts?: number };
type WorkerMessage =
  | { type: "progress"; attempts: number; attemptsPerSecond: number }
  | { type: "done"; publicKey: string; secretKey: number[]; attempts: number; durationMs: number }
  | { type: "error"; message: string };

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<StartMessage>) => void) | null;
  postMessage: (message: WorkerMessage) => void;
};

workerScope.onmessage = (event) => {
  if (event.data?.type !== "start") return;

  // A four-character Base58 suffix averages roughly 11.3M attempts.
  // Keep grinding on a dedicated worker so the UI remains responsive; no key is sent to a server.
  const maxAttempts = Math.max(1, Math.min(event.data.maxAttempts ?? 60_000_000, 60_000_000));
  const startedAt = performance.now();

  for (let attempts = 1; attempts <= maxAttempts; attempts++) {
    const keypair = Keypair.generate();
    const publicKey = keypair.publicKey.toBase58();

    if (publicKey.endsWith("pump")) {
      workerScope.postMessage({
        type: "done",
        publicKey,
        secretKey: Array.from(keypair.secretKey),
        attempts,
        durationMs: performance.now() - startedAt,
      });
      return;
    }

    if (attempts % 100_000 === 0) {
      const elapsedSeconds = Math.max((performance.now() - startedAt) / 1000, 0.001);
      workerScope.postMessage({
        type: "progress",
        attempts,
        attemptsPerSecond: attempts / elapsedSeconds,
      });
    }
  }

  workerScope.postMessage({
    type: "error",
    message: "Couldn't find a pump-style address within the attempt limit. Please try again.",
  });
};
