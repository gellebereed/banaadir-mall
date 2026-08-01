import Image from "next/image";
import Link from "next/link";

import type { Session } from "@/lib/auth";

/**
 * Footer link columns. The "Sell" column only offers links the visitor can
 * actually open — no dead ends into guarded dashboards.
 */
function columns(session: Session | null) {
  const sellLinks =
    session?.role === "admin"
      ? [
          { label: "Control Panel", href: "/admin" },
          { label: "Marketing", href: "/admin/marketing" },
          { label: "Stores", href: "/admin/stores" },
        ]
      : session?.role === "seller"
        ? [
            { label: "My Dashboard", href: "/vendor" },
            { label: "My Products", href: "/vendor/products" },
            { label: "Store Settings", href: "/vendor/settings" },
          ]
        : [
            { label: "Open a Store", href: "/sell" },
            { label: "Seller Sign In", href: "/login" },
          ];

  return [
    {
      title: "Shop",
      links: [
        { label: "All Products", href: "/products" },
        { label: "Flash Deals", href: "/flash" },
        { label: "Bestsellers", href: "/products?sort=sold" },
        { label: "All Stores", href: "/stores" },
      ],
    },
    { title: "Sell", links: sellLinks },
    {
      title: "Help",
      links: [
        { label: "Track My Order", href: "/track" },
        { label: "FAQ & Contact", href: "/help" },
        { label: session ? "My Account" : "Sign In", href: session ? "/account" : "/login" },
      ],
    },
  ];
}

export default function Footer({ session }: { session: Session | null }) {
  const COLUMNS = columns(session);

  return (
    <footer className="mt-16 bg-ocean-950 text-ocean-100">
      <div className="mx-auto max-w-7xl px-4 py-12">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          {/* Brand + newsletter */}
          <div>
            <div className="flex items-center gap-2.5">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white p-1.5">
                <Image
                  src="/banaadir-bag.png"
                  alt=""
                  width={36}
                  height={36}
                  className="h-full w-auto"
                />
              </span>
              <span className="font-display text-xl font-extrabold text-white">
                Banaadir<span className="text-mango-400">Mall</span>
              </span>
            </div>
            <p className="mt-3 max-w-xs text-sm text-ocean-200">
              Somalia&apos;s online marketplace. Trusted local stores, honest
              prices, delivered to your door.
            </p>
            <form className="mt-5 flex max-w-sm gap-2" action="/help">
              <input
                type="email"
                placeholder="Email for deals & updates"
                className="min-w-0 flex-1 rounded-full bg-white/10 px-4 py-2.5 text-sm text-white placeholder-ocean-300 outline-none focus:bg-white/20"
              />
              <button className="rounded-full bg-mango-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-mango-600">
                Join
              </button>
            </form>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h3 className="font-display text-sm font-bold uppercase tracking-wider text-white">
                {col.title}
              </h3>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.href + l.label}>
                    <Link
                      href={l.href}
                      className="text-sm text-ocean-200 transition hover:text-mango-300"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Payment methods + copyright */}
        <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-6 sm:flex-row">
          <p className="text-xs text-ocean-300">
            © 2026 Banaadir Mall. All rights reserved.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {["EVC Plus", "Zaad", "eDahab", "Visa", "Mastercard", "Cash on Delivery"].map(
              (m) => (
                <span
                  key={m}
                  className="rounded-md bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-ocean-100"
                >
                  {m}
                </span>
              ),
            )}
          </div>
        </div>
      </div>
    </footer>
  );
}
