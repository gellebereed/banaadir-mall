"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import StoreCard from "@/components/StoreCard";
import type { Store } from "@/lib/types";

export default function PublicStoresClient({ stores }: { stores: Store[] }) {
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "official" | "verified">("all");
  const [selectedCity, setSelectedCity] = useState("all");

  const cities = useMemo(() => {
    const set = new Set<string>();
    stores.forEach((s) => {
      if (s.city) set.add(s.city);
    });
    return Array.from(set).sort();
  }, [stores]);

  const filteredStores = useMemo(() => {
    return stores.filter((s) => {
      if (activeTab === "official" && !s.official) return false;
      if (activeTab === "verified" && !s.verified && !s.official) return false;
      if (selectedCity !== "all" && s.city !== selectedCity) return false;

      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return (
        s.name.toLowerCase().includes(q) ||
        s.tagline.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q) ||
        s.city.toLowerCase().includes(q)
      );
    });
  }, [stores, activeTab, selectedCity, query]);

  return (
    <div>
      {/* ── Search and Filter Controls ─────────────────────────────── */}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4 card p-4 sm:p-5">
        <div className="flex flex-1 flex-wrap items-center gap-3 min-w-[280px]">
          <div className="relative flex-1 min-w-[200px]">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search stores by brand, category, or city…"
              className="input py-2.5 pl-10 text-sm"
            />
            <span className="absolute left-3.5 top-3 text-slate-400">🔍</span>
          </div>

          <select
            value={selectedCity}
            onChange={(e) => setSelectedCity(e.target.value)}
            className="select text-sm py-2.5 px-3 min-w-[140px]"
          >
            <option value="all">📍 All Cities</option>
            {cities.map((city) => (
              <option key={city} value={city}>
                📍 {city}
              </option>
            ))}
          </select>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("all")}
            className={`rounded-full px-4 py-2 text-xs font-bold transition ${
              activeTab === "all" ? "bg-ocean-800 text-white shadow-sm" : "bg-sand-100 text-slate-600 hover:bg-sand-200"
            }`}
          >
            All Stores ({stores.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("official")}
            className={`rounded-full px-4 py-2 text-xs font-bold transition ${
              activeTab === "official"
                ? "bg-mango-500 text-white shadow-sm"
                : "bg-mango-100 text-mango-900 hover:bg-mango-200"
            }`}
          >
            ⭐ Official Brands ({stores.filter((s) => s.official).length})
          </button>
        </div>
      </div>

      {/* ── Store Grid ────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filteredStores.map((s) => (
          <StoreCard key={s.slug} store={s} />
        ))}
      </div>

      {filteredStores.length === 0 && (
        <div className="card py-16 text-center">
          <span className="text-4xl">🏪</span>
          <h3 className="mt-3 font-display text-lg font-bold text-ocean-950">No stores found</h3>
          <p className="mt-1 text-sm text-slate-500">
            Try adjusting your search query or city filter.
          </p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setActiveTab("all");
              setSelectedCity("all");
            }}
            className="btn-secondary mt-4 !py-2 text-xs"
          >
            Reset Filters
          </button>
        </div>
      )}
    </div>
  );
}
