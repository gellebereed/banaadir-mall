import Image from "next/image";
import Link from "next/link";
import StoreAvatar from "@/components/StoreAvatar";
import type { Store } from "@/lib/types";

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  A SHOP'S OWN HEADER
 * ─────────────────────────────────────────────────────────────────────────
 * What replaces the marketplace header when somebody arrives on a store's
 * own address. Their logo, their name, their colours, and a search box that
 * only searches their shelves.
 *
 * ── What is deliberately NOT here ────────────────────────────────────────
 * The department mega-menu, the "All Stores" link, the Banaadir Mall
 * wordmark, the marketplace announcement bar. A shopper who typed a
 * bakery's address is not browsing a mall, and every one of those is an
 * invitation to leave — which is precisely what the seller was promised
 * would not happen when they were told they could have their own site.
 *
 * ── And what is ──────────────────────────────────────────────────────────
 * One quiet line at the very bottom of the page saying who powers it. Not
 * hidden, because a shopper about to type a card number deserves to know
 * whose checkout it is, and not loud, because it is not our shopfront.
 * ─────────────────────────────────────────────────────────────────────────
 */
export default function StoreSiteHeader({ store }: { store: Store }) {
  const accent = store.art?.from ?? "#0c2b34";

  return (
    <header className="sticky top-0 z-40 border-b border-sand-200 bg-white/95 backdrop-blur">
      {/* The shop's own colour, as a hairline. Enough to feel like theirs
          without betting the legibility of the whole header on a value a
          seller picked from a colour wheel. */}
      <div className="h-1 w-full" style={{ background: accent }} />

      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <Link href="/" className="flex min-w-0 items-center gap-3">
          {store.logo ? (
            <Image
              src={store.logo}
              alt={store.name}
              width={44}
              height={44}
              className="h-11 w-11 shrink-0 rounded-xl object-cover ring-1 ring-sand-200"
            />
          ) : (
            <StoreAvatar
              store={store}
              size={44}
              className="h-11 w-11 shrink-0 rounded-xl text-2xl ring-1 ring-sand-200"
            />
          )}
          <span className="min-w-0">
            <span className="block truncate font-display text-lg font-extrabold leading-tight text-ocean-950">
              {store.name}
            </span>
            {store.tagline && (
              <span className="hidden truncate text-xs text-slate-500 sm:block">
                {store.tagline}
              </span>
            )}
          </span>
        </Link>

        {/* Searches this shop only — the `store` param scopes it. */}
        <form action="/search" method="get" className="ml-auto hidden min-w-0 flex-1 sm:block sm:max-w-sm">
          <input type="hidden" name="store" value={store.slug} />
          <input
            type="search"
            name="q"
            placeholder={`Search ${store.name}…`}
            aria-label={`Search ${store.name}`}
            className="w-full rounded-full border border-sand-200 bg-sand-50 px-4 py-2 text-sm outline-none transition focus:border-ocean-400 focus:bg-white"
          />
        </form>

        <nav className="ml-auto flex shrink-0 items-center gap-1 sm:ml-0">
          <Link
            href="/wishlist"
            aria-label="Saved items"
            className="flex h-10 w-10 items-center justify-center rounded-full text-lg text-slate-500 transition hover:bg-sand-100 hover:text-coral-500"
          >
            ♡
          </Link>
          <Link
            href="/cart"
            aria-label="Basket"
            className="flex h-10 w-10 items-center justify-center rounded-full text-lg text-slate-500 transition hover:bg-sand-100 hover:text-ocean-700"
          >
            🛒
          </Link>
          {store.whatsapp && (
            <a
              href={`https://wa.me/${store.whatsapp}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-1 hidden rounded-full bg-emerald-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-600 sm:inline-flex"
            >
              Message us
            </a>
          )}
        </nav>
      </div>

      {/* Phone: the search moves to its own row rather than being dropped. */}
      <form action="/search" method="get" className="px-4 pb-3 sm:hidden">
        <input type="hidden" name="store" value={store.slug} />
        <input
          type="search"
          name="q"
          placeholder={`Search ${store.name}…`}
          aria-label={`Search ${store.name}`}
          className="w-full rounded-full border border-sand-200 bg-sand-50 px-4 py-2 text-sm outline-none focus:border-ocean-400 focus:bg-white"
        />
      </form>
    </header>
  );
}

/** The quiet line at the bottom. See the note above on why it is there. */
export function StoreSiteFooter({ store }: { store: Store }) {
  return (
    <footer className="mt-12 border-t border-sand-200 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="flex flex-wrap items-start justify-between gap-8">
          <div className="min-w-0">
            <p className="font-display text-lg font-extrabold text-ocean-950">{store.name}</p>
            {store.tagline && (
              <p className="mt-1 max-w-sm text-sm text-slate-500">{store.tagline}</p>
            )}
            <p className="mt-2 text-sm text-slate-500">📍 {store.city}</p>
            {store.whatsapp && (
              <a
                href={`https://wa.me/${store.whatsapp}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-2 rounded-full bg-emerald-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-600"
              >
                💬 Message us on WhatsApp
              </a>
            )}
          </div>

          <nav className="flex flex-col gap-2 text-sm">
            <Link href="/" className="text-slate-600 hover:text-ocean-700">
              Shop
            </Link>
            <Link href="/track" className="text-slate-600 hover:text-ocean-700">
              Track an order
            </Link>
            <Link href="/help" className="text-slate-600 hover:text-ocean-700">
              Help
            </Link>
          </nav>
        </div>

        <div className="mt-8 border-t border-sand-100 pt-5 text-xs text-slate-400">
          <p>
            © {new Date().getFullYear()} {store.name}. Shop, basket and secure
            checkout powered by{" "}
            <a
              href={`https://${process.env.NEXT_PUBLIC_ROOT_DOMAIN || "banaadirmall.com"}`}
              className="font-semibold text-slate-500 hover:text-ocean-700"
            >
              Banaadir Mall
            </a>
            .
          </p>
        </div>
      </div>
    </footer>
  );
}
