"use client";

/**
 * Global cart + wishlist state, persisted to localStorage.
 *
 * This is intentionally simple and client-side only. When real accounts
 * exist, sync these to the backend (e.g. Odoo sale.order in "draft" state)
 * on login — the component API here can stay exactly the same.
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { products } from "./data/products";
import {
  adoptGuestData,
  clearGuestData,
  GUEST_SCOPE,
  scopeFor,
  scopedKey,
  SHOPPER_KEYS,
} from "./storage-scope";
import type { CartItem, Product } from "./types";

interface CartLine extends CartItem {
  product: Product;
}

/** A transient confirmation shown after a cart or wishlist action. */
export interface Toast {
  id: number;
  kind: "cart" | "wishlist" | "removed";
  title: string;
  subtitle?: string;
  image?: string;
  icon?: string;
  /**
   * The shop offer this item just started — "Buy 1, get the next for $1"
   * with a link to the items that complete it. Without it, the deal only
   * surfaced if the shopper happened to open the basket.
   */
  offer?: { text: string; href: string };
}

interface CartContextValue {
  /** Cart lines joined with their product records. */
  lines: CartLine[];
  /**
   * False until the basket has been read from this device. Before that,
   * `lines` is empty whether or not the cart is — pages that would show an
   * "empty cart" state should wait for this instead of flashing it.
   */
  ready: boolean;
  /** Total number of units in the cart (drives the header badge). */
  count: number;
  subtotal: number;
  addToCart: (item: CartItem, options?: { offer?: Toast["offer"] }) => void;
  /** `key` is the line's cartLineKey(), not its product id. */
  updateQty: (key: string, qty: number) => void;
  removeFromCart: (key: string) => void;
  clearCart: () => void;
  wishlist: string[];
  toggleWishlist: (productId: string, product?: Pick<Product, "name" | "icon" | "images">) => void;
  isWishlisted: (productId: string) => boolean;
  /**
   * The storage namespace for the signed-in account ("guest" when signed
   * out). Exposed here because every client component already has the
   * cart context, and several of them keep their own per-shopper keys —
   * checkout addresses, the local order history. One source of truth beats
   * each of them deriving it and one of them getting it wrong.
   */
  scope: string;
  /** Live confirmations rendered by <Toaster />. */
  toasts: Toast[];
  dismissToast: (id: number) => void;
}

const CartContext = createContext<CartContextValue | null>(null);

/**
 * Exported because the recommendation tracker reads these keys directly on
 * mount to establish its baseline — see components/reco/RecoProvider.tsx.
 * Without knowing what was ALREADY in the cart when the page loaded, it
 * would read the restore-from-localStorage as a burst of fresh add-to-cart
 * activity and re-learn the same basket on every page view.
 */
export const CART_KEY = "bm-cart";

/**
 * What makes two cart items the same line: the product AND the exact
 * colour/size (or variant) chosen.
 *
 * Lines used to be matched on the product id alone, so a blazer added in
 * size S and then again in size M became one line, "M × 2" — the S was
 * silently overwritten and the customer received two of the wrong size.
 */
export function cartLineKey(item: Pick<CartItem, "productId" | "variantId" | "color" | "size">): string {
  return item.variantId
    ? `${item.productId}#${item.variantId}`
    : `${item.productId}|${item.color ?? ""}|${item.size ?? ""}`;
}
export const WISHLIST_KEY = "bm-wishlist";

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** How long a confirmation stays on screen. */
const TOAST_MS = 3200;
const TOAST_OFFER_MS = 6000;

export function CartProvider({
  children,
  email,
}: {
  children: ReactNode;
  /**
   * The signed-in account, or undefined for a guest.
   *
   * The basket and the wishlist are stored per account on this device.
   * Without it, signing in as somebody else on a shared phone showed you
   * their basket and their saved items — see lib/storage-scope.ts.
   */
  email?: string;
}) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  // Hydration guard: localStorage is only read after mount so the first
  // client render matches the server-rendered HTML.
  const [hydrated, setHydrated] = useState(false);
  /** The account the stored data was last read for; null before the first read. */
  const previousScope = useRef<string | null>(null);

  const scope = scopeFor(email);
  const cartKey = scopedKey(CART_KEY, scope);
  const wishlistKey = scopedKey(WISHLIST_KEY, scope);

  /*
   * Re-read whenever the account changes, not just on mount.
   *
   * `hydrated` is dropped first so the write-back effects below cannot fire
   * with the OUTGOING account's state and stamp it onto the incoming
   * account's keys — which would copy one person's basket to another at the
   * exact moment the two are being separated.
   */
  useEffect(() => {
    setHydrated(false);
    const previous = previousScope.current;
    previousScope.current = scope;

    if (scope === GUEST_SCOPE) {
      /*
       * A guest page load is NOT a sign-out. This used to clear the guest
       * bucket on every mount with no account — i.e. every guest's basket,
       * saved address and order copies vanished on each full page load
       * (a reload, a new tab, coming back tomorrow). Only an account →
       * guest switch within this page is a sign-out; a sign-out that
       * reloads the page needs no clearing, because signing in already
       * handed the guest bucket over and emptied it (adoptGuestData).
       */
      if (previous !== null && previous !== GUEST_SCOPE) {
        clearGuestData([...SHOPPER_KEYS]);
        setItems([]);
        setWishlist([]);
      } else {
        setItems(readStorage<CartItem[]>(cartKey, []));
        setWishlist(readStorage<string[]>(wishlistKey, []));
      }
    } else {
      // First sign-in on this device takes over whatever was browsed as a
      // guest — losing a basket at the point of signing in to pay for it
      // would be indefensible.
      adoptGuestData([...SHOPPER_KEYS], scope);
      setItems(readStorage<CartItem[]>(cartKey, []));
      setWishlist(readStorage<string[]>(wishlistKey, []));
    }

    setHydrated(true);
  }, [scope, cartKey, wishlistKey]);

  useEffect(() => {
    if (hydrated) localStorage.setItem(cartKey, JSON.stringify(items));
  }, [items, hydrated, cartKey]);

  useEffect(() => {
    if (hydrated) localStorage.setItem(wishlistKey, JSON.stringify(wishlist));
  }, [wishlist, hydrated, wishlistKey]);

  const value = useMemo<CartContextValue>(() => {
    /**
     * Resolve a cart item to a renderable product. The snapshot (captured
     * at add-to-cart time) wins for name/price so products created from
     * the seller dashboard work, and the customer keeps the price they
     * saw when adding (e.g. during a promotion).
     */
    const lineProduct = (item: CartItem): Product | null => {
      const catalog = products.find((p) => p.id === item.productId);
      if (!item.snapshot) return catalog ?? null;
      const base: Product = catalog ?? {
        id: item.productId,
        slug: item.snapshot.slug,
        name: item.snapshot.name,
        // Captured when the item was added. It used to be hardcoded empty,
        // which meant every order for a product outside the bundled seed
        // catalogue — i.e. every real one — was filed under no store.
        store: item.snapshot.store ?? "",
        category: "",
        price: item.snapshot.price,
        icon: item.snapshot.icon,
        art: { from: "#e0f2fe", to: "#bae6fd" },
        rating: 5,
        reviewCount: 0,
        sold: 0,
        stock: 99,
        description: "",
        features: [],
      };
      return {
        ...base,
        name: item.snapshot.name,
        price: item.snapshot.price,
        icon: item.snapshot.icon,
        slug: item.snapshot.slug,
        // Prefer the catalogue's store when we have the real product;
        // fall back to the snapshot for items that only exist in Supabase.
        store: base.store || item.snapshot.store || "",
        // The bundled seed catalog no longer holds Supabase products, so the
        // snapshot is the only source of a photo for the cart and checkout.
        images: item.snapshot.image ? [item.snapshot.image] : base.images,
        compareAt: item.snapshot.compareAt ?? base.compareAt,
        // A synthesized product must not carry variants, or the cart would
        // try to resolve a variant photo that isn't there.
        variants: undefined,
      };
    };

    const lines = items
      .map((item) => {
        const product = lineProduct(item);
        return product ? { ...item, product } : null;
      })
      .filter((l): l is CartLine => l !== null);

    /** Queue a confirmation and schedule its removal. */
    const pushToast = (toast: Omit<Toast, "id">) => {
      const id = Date.now() + Math.random();
      // Keep at most three on screen so a burst of clicks can't cover the page.
      setToasts((prev) => [...prev.slice(-2), { ...toast, id }]);
      // Long enough to read — and tap — the offer line when there is one.
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), toast.offer ? TOAST_OFFER_MS : TOAST_MS);
    };

    return {
      scope,
      ready: hydrated,
      lines,
      count: lines.reduce((sum, l) => sum + l.qty, 0),
      subtotal: lines.reduce((sum, l) => sum + l.qty * l.product.price, 0),
      toasts,
      dismissToast: (id) => setToasts((prev) => prev.filter((t) => t.id !== id)),
      addToCart: (item, options) => {
        pushToast({
          kind: "cart",
          title: item.snapshot?.name ?? "Added to your cart",
          subtitle: [item.color, item.size].filter(Boolean).join(" · ") || undefined,
          image: item.snapshot?.image,
          icon: item.snapshot?.icon,
          offer: options?.offer,
        });
        setItems((prev) => {
          const key = cartLineKey(item);
          const existing = prev.find((i) => cartLineKey(i) === key);
          if (existing) {
            return prev.map((i) =>
              cartLineKey(i) === key
                ? { ...i, qty: i.qty + item.qty, snapshot: item.snapshot ?? i.snapshot }
                : i,
            );
          }
          return [...prev, item];
        });
      },
      updateQty: (key, qty) =>
        setItems((prev) =>
          qty <= 0
            ? prev.filter((i) => cartLineKey(i) !== key)
            : prev.map((i) => (cartLineKey(i) === key ? { ...i, qty } : i)),
        ),
      removeFromCart: (key) =>
        setItems((prev) => prev.filter((i) => cartLineKey(i) !== key)),
      clearCart: () => setItems([]),
      wishlist,
      toggleWishlist: (productId, product) => {
        const removing = wishlist.includes(productId);
        pushToast({
          kind: removing ? "removed" : "wishlist",
          title: product?.name ?? (removing ? "Removed from wishlist" : "Saved to wishlist"),
          subtitle: removing ? "Removed from your wishlist" : "Saved to your wishlist",
          image: product?.images?.[0],
          icon: product?.icon,
        });
        setWishlist((prev) =>
          removing ? prev.filter((id) => id !== productId) : [...prev, productId],
        );
      },
      isWishlisted: (productId) => wishlist.includes(productId),
    };
  }, [items, wishlist, toasts, scope, hydrated]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}
