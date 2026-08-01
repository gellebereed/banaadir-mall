import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <span className="text-7xl">🏝️</span>
      <h1 className="mt-5 font-display text-4xl font-extrabold text-ocean-950">
        Lost at sea?
      </h1>
      <p className="mt-3 text-slate-500">
        This page doesn&apos;t exist — but the market is just over there.
      </p>
      <div className="mt-7 flex gap-3">
        <Link href="/" className="btn-secondary !py-2.5 text-sm">
          Go Home
        </Link>
        <Link href="/products" className="btn-primary !py-2.5 text-sm">
          Browse Products
        </Link>
      </div>
    </div>
  );
}
