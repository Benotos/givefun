import Logo from "@/components/Logo";

export const metadata = { title: "Back soon" };

export default function Maintenance() {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center px-4 text-center">
      <Logo size={36} />
      <h1 className="mt-10 font-display text-4xl font-extrabold">Back in a few minutes</h1>
      <p className="mt-4 text-mute">We are doing a quick upgrade. Your coins and every donation are safe on chain.</p>
    </div>
  );
}
