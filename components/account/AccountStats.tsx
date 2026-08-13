"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useCart } from "@/lib/cart-context";
import { money } from "@/lib/format";

/**
 * The four numbers across the top of the account page.
 *
 * ── Two of them live on the server, two in the browser ───────────────────
 * Orders and lifetime spend come from the database and are rendered on the
 * server. The basket and the saved list are localStorage (see
 * lib/cart-context.tsx), so they do not exist until the component mounts.
 *
 * Rendering "0" for those on the first pass and then swapping in the real
 * figure is the classic hydration flicker, and on a stat tile it is worse
 * than a flicker — for a fraction of a second the page tells a shopper
 * their basket is empty. So the browser-side pair render a dash until the
 * values are actually known, which reads as "loading" rather than as a
 * wrong answer.
 */
export default function AccountStats({
  orders,
  spent,
}: {
  orders: number;
  spent: number;
}) {
  const { count, wishlist } = useCart();
  const [ready, setReady] = useState(false);

  useEffect(() => setReady(true), []);

  const tiles = [
    { label: "Orders", value: String(orders), href: "#my-orders" },
    { label: "Saved", value: ready ? String(wishlist.length) : "—", href: "/wishlist" },
    { label: "In Cart", value: ready ? String(count) : "—", href: "/cart" },
    { label: "Spent", value: money(spent), href: "#my-orders" },
  ];

  return (
    <div className="mt-7 grid grid-cols-4 gap-2">
      {tiles.map((tile) => (
        <Link
          key={tile.label}
          href={tile.href}
          className="rounded-2xl px-1 py-2 text-center transition hover:bg-white/10 active:scale-95"
        >
          <p className="font-display text-xl font-extrabold leading-none text-white sm:text-2xl">
            {tile.value}
          </p>
          <p className="mt-1.5 text-[11px] font-medium text-ocean-100">{tile.label}</p>
        </Link>
      ))}
    </div>
  );
}
