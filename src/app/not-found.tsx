import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-32 text-center">
      <div className="font-display text-7xl font-extrabold text-ember">404</div>
      <h1 className="mt-4 text-2xl font-bold">We could not find that page</h1>
      <p className="mt-2 text-mute">The coin or charity may not exist, or it is not verified yet.</p>
      <Link href="/" className="btn mt-8">Back home</Link>
    </div>
  );
}
