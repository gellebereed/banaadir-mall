"use client";

import Link from "next/link";
import { useState } from "react";
import ProductCard from "@/components/ProductCard";
import SectionHeader from "@/components/SectionHeader";
import { money } from "@/lib/format";
import { RAIL_CARD, RAIL_ROW } from "@/lib/card-sizes";
import { useT } from "@/components/prefs/PrefsProvider";
import type { Product } from "@/lib/types";

export interface BudgetBand {
  max: number;
  products: Product[];
}

/**
 * "Shop by budget": the best sellers under $10 / $25 / $50, one tab at a
 * time. Price is the first filter most shoppers here apply, so it gets a
 * row of its own rather than a sidebar setting; "See all" opens the full
 * catalogue with the same limit (/products?max=…).
 */
export default function BudgetPicks({ bands }: { bands: BudgetBand[] }) {
  const [active, setActive] = useState(0);
  const t = useT();
  if (bands.length === 0) return null;
  const band = bands[Math.min(active, bands.length - 1)];

  return (
    <section className="mx-auto max-w-7xl px-4 pt-14">
      <SectionHeader
        title={t("section.budget")}
        subtitle={t("section.budget.sub")}
        href={`/products?under=${band.max}&sort=sold`}
        linkLabel={t("section.viewAll")}
      />
      <div role="tablist" aria-label="Budget" className="rail-scroll -mx-4 mb-4 flex gap-2 overflow-x-auto px-4">
        {bands.map((b, i) => (
          <button
            key={b.max}
            type="button"
            role="tab"
            aria-selected={i === active}
            onClick={() => setActive(i)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold transition ${
              i === active
                ? "bg-ocean-800 text-white shadow-sm"
                : "bg-white text-slate-600 ring-1 ring-sand-200 hover:ring-ocean-300"
            }`}
          >
            {t("section.budget.under", { amount: money(b.max) })}
          </button>
        ))}
      </div>
      <div role="tabpanel" className={RAIL_ROW}>
        {band.products.map((p) => (
          <div key={p.id} className={RAIL_CARD}>
            <ProductCard product={p} />
          </div>
        ))}
        <Link
          href={`/products?under=${band.max}&sort=sold`}
          className={`${RAIL_CARD} flex-col items-center justify-center gap-2 rounded-2xl bg-sand-100 p-4 text-center font-display font-bold text-ocean-800 ring-1 ring-sand-200 transition hover:bg-sand-200`}
        >
          <span className="text-3xl" aria-hidden>
            →
          </span>
          {t("section.budget.all", { amount: money(band.max) })}
        </Link>
      </div>
    </section>
  );
}
