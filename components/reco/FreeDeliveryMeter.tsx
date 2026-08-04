"use client";

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  THE GOAL METER — free delivery, and how to actually get there.
 * ─────────────────────────────────────────────────────────────────────────
 * People push harder toward a goal the closer it looks. The cart already
 * told shoppers "add $12 more for free delivery"; the sentence is only half
 * a nudge, because it names a gap and leaves the work of closing it to
 * them — and the usual result is an abandoned basket or a random cheap item
 * bought resentfully.
 *
 * This shows the progress, and then names things worth buying that close
 * the gap: ranked by fit to the shopper's taste FIRST and by how neatly
 * they land on the remainder second (see psychology.ts, deliveryGoal). The
 * candidates never cost much more than the gap either, because suggesting a
 * $40 item to save a $4 delivery fee is a worse deal and shoppers can do
 * that arithmetic instantly.
 *
 * Numbers come from the admin's own delivery settings. Nothing here is a
 * target invented to move a basket.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import ProductImage from "@/components/ProductImage";
import { useCart } from "@/lib/cart-context";
import { money } from "@/lib/format";
import { hasVariants, primaryImage } from "@/lib/product-utils";
import type { DeliveryGoal } from "@/lib/reco/types";
import { useRecommendations } from "./RecoProvider";

/**
 * Kept here rather than imported from lib/reco/psychology so the engine's
 * server-side modules stay out of the browser bundle for one sentence.
 */
function goalCopy(goal: DeliveryGoal): string {
  return goal.reached ? "Delivery is on us 🚚" : `${money(goal.remaining)} away from free delivery`;
}

export default function FreeDeliveryMeter() {
  const { data } = useRecommendations({ surface: "cart", useCartLines: true });
  const { addToCart } = useCart();
  const goal = data.goal;

  if (!goal) return null;

  return (
    <div className="card mt-4 overflow-hidden p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p
          className={`text-sm font-bold ${goal.reached ? "text-emerald-600" : "text-ocean-950"}`}
        >
          {goalCopy(goal)}
        </p>
        <p className="text-xs text-slate-400">
          {money(goal.subtotal)} / {money(goal.threshold)}
        </p>
      </div>

      <div
        className="mt-2 h-2 w-full overflow-hidden rounded-full bg-sand-100"
        role="progressbar"
        aria-valuenow={Math.round(goal.progress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Progress toward free delivery"
      >
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            goal.reached
              ? "bg-emerald-500"
              : "bg-gradient-to-r from-ocean-600 to-mango-500"
          }`}
          style={{ width: `${Math.max(4, goal.progress * 100)}%` }}
        />
      </div>

      {!goal.reached && goal.closers.length > 0 && (
        <>
          <p className="mt-4 text-xs font-semibold text-slate-500">
            Any one of these would do it — picked from what you&apos;ve been browsing:
          </p>
          <div className="mt-2 flex gap-3 overflow-x-auto pb-1 rail-scroll">
            {goal.closers.map((product) => (
              <div key={product.id} className="w-28 shrink-0">
                <Link href={`/product/${product.slug}`}>
                  <ProductImage
                    product={product}
                    className="aspect-square w-full rounded-xl"
                    iconClass="text-2xl"
                  />
                </Link>
                <p className="mt-1 line-clamp-2 text-[11px] font-semibold leading-snug text-slate-700">
                  {product.name}
                </p>
                <p className="text-[11px] font-bold text-ocean-900">{money(product.price)}</p>
                {hasVariants(product) ? (
                  <Link
                    href={`/product/${product.slug}`}
                    className="mt-1 block rounded-full bg-ocean-700 py-1 text-center text-[10px] font-bold text-white hover:bg-mango-500"
                  >
                    Options
                  </Link>
                ) : (
                  <button
                    onClick={() =>
                      addToCart({
                        productId: product.id,
                        qty: 1,
                        snapshot: {
                          name: product.name,
                          price: product.price,
                          icon: product.icon,
                          slug: product.slug,
                          store: product.store,
                          image: primaryImage(product),
                        },
                      })
                    }
                    className="mt-1 w-full rounded-full bg-ocean-700 py-1 text-[10px] font-bold text-white transition hover:bg-mango-500"
                  >
                    Add
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
