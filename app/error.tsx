"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { isStaleDeployError, reloadForNewVersion } from "@/lib/stale-deploy";

/**
 * Every page used to fall through to Next.js's bare "Application error: a
 * client-side exception has occurred" — white page, no way back. This
 * keeps the header and footer and offers a way out.
 *
 * Right after an update the usual cause is an old tab asking for files
 * the new build no longer has (lib/stale-deploy.ts); that case reloads
 * by itself and the shopper only sees "Updating…" for a moment.
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const stale = isStaleDeployError(error);
  const [reloading, setReloading] = useState(stale);

  useEffect(() => {
    console.error(error);
    if (stale && !reloadForNewVersion()) setReloading(false);
  }, [error, stale]);

  if (reloading) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
        <span className="text-5xl">✨</span>
        <h1 className="mt-5 font-display text-2xl font-extrabold text-ocean-950">
          Updating to the latest version…
        </h1>
        <p className="mt-3 text-slate-500">This takes a second.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <span className="text-7xl">🌊</span>
      <h1 className="mt-5 font-display text-3xl font-extrabold text-ocean-950">
        Something went wrong
      </h1>
      <p className="mt-3 text-slate-500">
        This page didn&apos;t load properly. Please try again — your cart is safe.
      </p>
      <div className="mt-7 flex gap-3">
        <button
          type="button"
          onClick={() => {
            reset();
            window.location.reload();
          }}
          className="btn-primary !py-2.5 text-sm"
        >
          Try again
        </button>
        <Link href="/" className="btn-secondary !py-2.5 text-sm">
          Go Home
        </Link>
      </div>
      {error.digest && <p className="mt-6 text-xs text-slate-400">Reference: {error.digest}</p>}
    </div>
  );
}
