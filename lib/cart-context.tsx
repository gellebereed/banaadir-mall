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
  useState,
  type ReactNode,
} from "react";
import { products } from "./data/products";
import type { CartItem, Product } from "./types";

interface CartLine extends CartItem {
  product: Product;
}

interface CartContextValue {
  /** Cart lines joined with their product records. */
  lines: CartLine[];
  /** Total number of units in the cart (drives the header badge). */
  count: number;
  subtotal: number;
  addToCart: (item: CartItem) => void;
  updateQty: (productId: string, qty: number) => void;
  removeFromCart: (productId: string) => void;
  clearCart: () => void;
  wishlist: string[];
  toggleWishlist: (productId: string) => void;
  isWishlisted: (productId: string) => boolean;
}

const CartContext = createContext<CartContextValue | null>(null);

const CART_KEY = "bm-cart";
const WISHLIST_KEY = "bm-wishlist";

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [wishlist, setWishlist] = useState<string[]>([]);
  // Hydration guard: localStorage is only read after mount so the first
  // client render matches the server-rendered HTML.
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setItems(readStorage<CartItem[]>(CART_KEY, []));
    setWishlist(readStorage<string[]>(WISHLIST_KEY, []));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem(CART_KEY, JSON.stringify(items));
  }, [items, hydrated]);

  useEffect(() => {
    if (hydrated) localStorage.setItem(WISHLIST_KEY, JSON.stringify(wishlist));
  }, [wishlist, hydrated]);

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
        store: "",
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
      };
    };

    const lines = items
      .map((item) => {
        const product = lineProduct(item);
        return product ? { ...item, product } : null;
      })
      .filter((l): l is CartLine => l !== null);

    return {
      lines,
      count: lines.reduce((sum, l) => sum + l.qty, 0),
      subtotal: lines.reduce((sum, l) => sum + l.qty * l.product.price, 0),
      addToCart: (item) =>
        setItems((prev) => {
          const existing = prev.find((i) => i.productId === item.productId);
          if (existing) {
            return prev.map((i) =>
              i.productId === item.productId
                ? {
                    ...i,
                    qty: i.qty + item.qty,
                    color: item.color,
                    size: item.size,
                    snapshot: item.snapshot ?? i.snapshot,
                  }
                : i,
            );
          }
          return [...prev, item];
        }),
      updateQty: (productId, qty) =>
        setItems((prev) =>
          qty <= 0
            ? prev.filter((i) => i.productId !== productId)
            : prev.map((i) => (i.productId === productId ? { ...i, qty } : i)),
        ),
      removeFromCart: (productId) =>
        setItems((prev) => prev.filter((i) => i.productId !== productId)),
      clearCart: () => setItems([]),
      wishlist,
      toggleWishlist: (productId) =>
        setWishlist((prev) =>
          prev.includes(productId)
            ? prev.filter((id) => id !== productId)
            : [...prev, productId],
        ),
      isWishlisted: (productId) => wishlist.includes(productId),
    };
  }, [items, wishlist]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}
