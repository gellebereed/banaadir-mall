"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { searchSuggestions, type SearchSuggestions } from "@/app/search-actions";
import { money } from "@/lib/format";

/**
 * The header search box, with suggestions as you type: products (photo,
 * name, price), departments and stores. Enter still opens the full results
 * page; arrow keys move through the suggestions.
 */
export default function SearchBox({ variant, onNavigate }: { variant: "desktop" | "mobile"; onNavigate?: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<SearchSuggestions | null>(null);
  const [active, setActive] = useState(-1);
  const wrapper = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      seq.current++;
      setData(null);
      return;
    }
    // Debounced; only the newest answer is kept, so a slow early request
    // can't replace suggestions for what has been typed since.
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      try {
        const result = await searchSuggestions(q);
        if (mine === seq.current) {
          setData(result);
          setActive(-1);
        }
      } catch {
        // Suggestions are a convenience; the search itself still works.
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!wrapper.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const links = [
    ...(data?.products ?? []).map((p) => `/product/${p.slug}`),
    ...(data?.categories ?? []).map((c) => `/category/${c.slug}`),
    ...(data?.stores ?? []).map((s) => `/store/${s.slug}`),
  ];
  /** A suggestion's own link navigates; this just tidies up behind it. */
  const closePanel = () => {
    setOpen(false);
    onNavigate?.();
  };
  const go = (href: string) => {
    setOpen(false);
    onNavigate?.();
    router.push(href);
  };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (active >= 0 && links[active]) return go(links[active]);
    if (!query.trim()) return;
    go(`/search?q=${encodeURIComponent(query.trim())}`);
  }

  const showPanel = open && data && query.trim().length >= 2;
  const empty = data && links.length === 0;
  let index = -1;
  const itemClass = (i: number) =>
    `flex w-full items-center gap-3 px-3 py-2 text-left text-sm ${i === active ? "bg-ocean-50" : "hover:bg-sand-50"}`;

  return (
    <div ref={wrapper} className="relative">
      <form onSubmit={submit} role="search">
        <div className="relative">
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((i) => Math.min(links.length - 1, i + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => Math.max(-1, i - 1));
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
            type="search"
            name="q"
            enterKeyHint="search"
            autoComplete="off"
            aria-label="Search products, brands and stores"
            aria-expanded={Boolean(showPanel)}
            placeholder="Search products, brands and stores…"
            className={
              variant === "desktop"
                ? "w-full rounded-full border-2 border-ocean-700/20 bg-sand-50 py-2.5 pl-5 pr-28 text-sm outline-none transition focus:border-ocean-600 focus:bg-white"
                : "w-full rounded-full border border-sand-200 bg-sand-50 py-2 pl-4 pr-10 text-sm outline-none transition focus:border-ocean-600 focus:bg-white"
            }
          />
          {variant === "desktop" ? (
            <button
              type="submit"
              className="absolute bottom-1 right-1 top-1 rounded-full bg-ocean-700 px-5 text-sm font-semibold text-white transition hover:bg-mango-500"
            >
              Search
            </button>
          ) : (
            <button type="submit" aria-label="Search" className="absolute bottom-1 right-1 top-1 px-3 text-slate-500 hover:text-ocean-700">
              🔍
            </button>
          )}
        </div>
      </form>

      {showPanel && (
        <div className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-sand-200 bg-white shadow-xl">
          {data.correctedQuery && (
            <p className="border-b border-sand-100 px-3 py-2 text-xs text-slate-500">
              Showing results for <strong className="text-ocean-900">{data.correctedQuery}</strong>
            </p>
          )}
          {data.products.length > 0 && (
            <ul>
              {data.products.map((p) => {
                index++;
                const i = index;
                return (
                  <li key={p.slug}>
                    <Link href={`/product/${p.slug}`} onClick={closePanel} className={itemClass(i)}>
                      <span className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-sand-100 text-xl">
                        {p.image ? <Image src={p.image} alt="" fill sizes="40px" className="object-cover" /> : p.icon}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-slate-800">{p.name}</span>
                      <span className="shrink-0 font-semibold text-ocean-900">{money(p.price)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          {(data.categories.length > 0 || data.stores.length > 0) && (
            <ul className="border-t border-sand-100 py-1">
              {data.categories.map((c) => {
                index++;
                const i = index;
                return (
                  <li key={c.slug}>
                    <Link href={`/category/${c.slug}`} onClick={closePanel} className={itemClass(i)}>
                      <span className="w-10 text-center text-lg">{c.icon}</span>
                      <span className="text-slate-700">
                        <span className="text-slate-400">Department · </span>
                        {c.name}
                      </span>
                    </Link>
                  </li>
                );
              })}
              {data.stores.map((s) => {
                index++;
                const i = index;
                return (
                  <li key={s.slug}>
                    <Link href={`/store/${s.slug}`} onClick={closePanel} className={itemClass(i)}>
                      <span className="w-10 text-center text-lg">🏪</span>
                      <span className="text-slate-700">
                        <span className="text-slate-400">Store · </span>
                        {s.name}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          {empty && <p className="px-3 py-3 text-sm text-slate-500">No quick matches — press Enter to search everything.</p>}
          {!empty && (
            <button
              type="button"
              onClick={() => go(`/search?q=${encodeURIComponent(query.trim())}`)}
              className="w-full border-t border-sand-100 px-3 py-2.5 text-left text-sm font-semibold text-ocean-700 hover:bg-sand-50"
            >
              See all results for &ldquo;{query.trim()}&rdquo; →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
