"use client";

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  THE TRACKER — the only place shopper behaviour is recorded.
 * ─────────────────────────────────────────────────────────────────────────
 * Holds the taste profile in localStorage, watches the cart and wishlist for
 * changes, and fetches shelves from the server action.
 *
 * ── What it deliberately does not do ─────────────────────────────────────
 * No analytics beacons, no third-party script, no server-side profile, no
 * identifier that survives clearing site data. The profile is a list of the
 * shopper's own actions on their own device, posted to our own server for
 * the length of one request. Everything the recommender knows, the shopper
 * can inspect and delete — which is what makes the "Why am I seeing this?"
 * control on every card an honest answer rather than a gesture.
 *
 * ── The baseline problem ─────────────────────────────────────────────────
 * The cart hydrates from localStorage a tick after mount, so a naive diff
 * sees five items appear and records five add-to-cart events on every page
 * load — the shopper's basket would be re-learned, and massively
 * over-weighted, once per navigation. The baseline is therefore read
 * straight from storage on mount, before React state catches up.
 * ─────────────────────────────────────────────────────────────────────────
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getRecommendationsAction } from "@/app/reco-actions";
import { CART_KEY, WISHLIST_KEY, useCart } from "@/lib/cart-context";
import {
  emptyProfile,
  forRequest,
  makeEvent,
  mute as muteProduct,
  profileSignature,
  readProfile,
  record,
  writeProfile,
} from "@/lib/reco/profile";
import type {
  CartLineRef,
  EventKind,
  RecoRequest,
  RecoResponse,
  Surface,
  TasteProfile,
} from "@/lib/reco/types";

interface RecoContextValue {
  profile: TasteProfile;
  /** True once localStorage has been read — nothing is tracked before it. */
  ready: boolean;
  track: (kind: EventKind, payload?: { id?: string; seconds?: number; query?: string }) => void;
  trackPurchase: (productIds: string[]) => void;
  mute: (productId: string) => void;
  reset: () => void;
  isMuted: (productId: string) => boolean;
}

const RecoCtx = createContext<RecoContextValue | null>(null);

export function RecoProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<TasteProfile>(emptyProfile);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setProfile(readProfile());
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) writeProfile(profile);
  }, [profile, ready]);

  const track = useCallback<RecoContextValue["track"]>((kind, payload = {}) => {
    setProfile((current) => record(current, makeEvent(kind, payload)));
  }, []);

  const trackPurchase = useCallback((productIds: string[]) => {
    setProfile((current) =>
      productIds.reduce((acc, id) => record(acc, makeEvent("buy", { id })), current),
    );
  }, []);

  const mute = useCallback((productId: string) => {
    setProfile((current) => muteProduct(current, productId));
  }, []);

  const reset = useCallback(() => setProfile(emptyProfile()), []);

  const value = useMemo<RecoContextValue>(
    () => ({
      profile,
      ready,
      track,
      trackPurchase,
      mute,
      reset,
      isMuted: (id) => profile.muted.includes(id),
    }),
    [profile, ready, track, trackPurchase, mute, reset],
  );

  return (
    <RecoCtx.Provider value={value}>
      <CartWishlistBridge />
      {children}
    </RecoCtx.Provider>
  );
}

export function useReco(): RecoContextValue {
  const ctx = useContext(RecoCtx);
  if (!ctx) throw new Error("useReco must be used inside <RecoProvider>");
  return ctx;
}

/**
 * Turns cart and wishlist changes into taste events, without touching the
 * cart's own API. Rendered once by the provider.
 */
function CartWishlistBridge() {
  const { lines, wishlist } = useCart();
  const { track, ready } = useReco();

  const cartBaseline = useRef<Set<string> | null>(null);
  const wishBaseline = useRef<Set<string> | null>(null);

  // Read what was already stored BEFORE React state hydrates — see the
  // baseline note at the top of this file.
  useEffect(() => {
    cartBaseline.current = new Set(
      readIds(CART_KEY, (item: { productId?: string }) => item?.productId),
    );
    wishBaseline.current = new Set(readIds(WISHLIST_KEY, (id: string) => id));
  }, []);

  useEffect(() => {
    if (!ready || !cartBaseline.current) return;
    const current = new Set(lines.map((line) => line.productId));
    diff(cartBaseline.current, current, (id, added) =>
      track(added ? "cart" : "uncart", { id }),
    );
    cartBaseline.current = current;
  }, [lines, ready, track]);

  useEffect(() => {
    if (!ready || !wishBaseline.current) return;
    const current = new Set(wishlist);
    diff(wishBaseline.current, current, (id, added) =>
      track(added ? "wish" : "unwish", { id }),
    );
    wishBaseline.current = current;
  }, [wishlist, ready, track]);

  return null;
}

function readIds<T>(key: string, pick: (value: T) => string | undefined): string[] {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as T[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map(pick).filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

function diff(
  before: Set<string>,
  after: Set<string>,
  emit: (id: string, added: boolean) => void,
): void {
  for (const id of after) if (!before.has(id)) emit(id, true);
  for (const id of before) if (!after.has(id)) emit(id, false);
}

// ── Fetching shelves ───────────────────────────────────────────────────

/**
 * Answers are cached for the life of the tab, keyed by everything that
 * could change them. Navigating back to a page the shopper has already seen
 * re-renders instantly instead of re-running the engine, which matters most
 * on exactly the connections this marketplace serves.
 */
const answerCache = new Map<string, RecoResponse>();

/**
 * In-flight requests, so two components on one page asking the same
 * question ask the server once. The product page does exactly this: the
 * bundle box sits above the reviews and the shelves sit below them, but
 * they are one answer.
 */
const inFlight = new Map<string, Promise<RecoResponse>>();

function fetchShelves(key: string, request: RecoRequest): Promise<RecoResponse> {
  const existing = inFlight.get(key);
  if (existing) return existing;

  const promise = getRecommendationsAction(request)
    .then((response) => {
      answerCache.set(key, response);
      return response;
    })
    .finally(() => inFlight.delete(key));

  inFlight.set(key, promise);
  return promise;
}

const EMPTY: RecoResponse = { shelves: [], confidence: 0 };

export interface UseRecoInput {
  surface: Surface;
  seedId?: string;
  /** Include the live basket — drives "completes your basket" and the meter. */
  useCartLines?: boolean;
  /**
   * An explicit set of products to treat as the basket, overriding the live
   * cart. The order-confirmation screen needs this: the cart has just been
   * emptied, but the order that was placed is exactly what "goes with what
   * you just bought" has to be built from.
   */
  items?: CartLineRef[];
  /**
   * Products the page already shows outside the recommender, so the
   * shelves don't repeat them. See RecoRequest.excludeIds.
   */
  excludeIds?: string[];
  /** Skip the request entirely (e.g. an empty wishlist page). */
  enabled?: boolean;
}

export function useRecommendations(input: UseRecoInput): {
  data: RecoResponse;
  loading: boolean;
} {
  const { profile, ready } = useReco();
  const { lines, subtotal, wishlist } = useCart();
  const enabled = input.enabled ?? true;

  const explicit = input.items;
  const cart = useMemo(() => {
    if (explicit) return explicit;
    if (!input.useCartLines) return undefined;
    return lines.map((line) => ({ productId: line.productId, qty: line.qty }));
  }, [explicit, input.useCartLines, lines]);

  // Joined once here so an inline array literal from a caller cannot make
  // the key — and therefore the request — new on every render.
  const excludeKey = (input.excludeIds ?? []).join(",");

  const key = useMemo(() => {
    const basket = cart ? cart.map((line) => `${line.productId}x${line.qty}`).join(",") : "";
    return [
      input.surface,
      input.seedId ?? "",
      basket,
      wishlist.join(","),
      excludeKey,
      profileSignature(profile),
    ].join("|");
  }, [input.surface, input.seedId, cart, wishlist, excludeKey, profile]);

  const [data, setData] = useState<RecoResponse>(() => answerCache.get(key) ?? EMPTY);
  const [loading, setLoading] = useState(false);
  const latestKey = useRef(key);

  useEffect(() => {
    latestKey.current = key;

    if (!ready || !enabled) return;

    const cached = answerCache.get(key);
    if (cached) {
      setData(cached);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const request: RecoRequest = {
      surface: input.surface,
      seedId: input.seedId,
      profile: forRequest(profile),
      cart,
      wishlist,
      excludeIds: excludeKey ? excludeKey.split(",") : undefined,
      subtotal: input.useCartLines ? subtotal : undefined,
    };

    fetchShelves(key, request)
      .then((response) => {
        // A slower earlier request must not overwrite a newer answer.
        if (!cancelled && latestKey.current === key) setData(response);
      })
      .catch(() => {
        if (!cancelled && latestKey.current === key) setData(EMPTY);
      })
      .finally(() => {
        if (!cancelled && latestKey.current === key) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // `subtotal` is intentionally excluded: it is derived from `cart`, which
    // is already in the key, and including it would refetch on every
    // quantity tick mid-edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ready, enabled, cart, wishlist, excludeKey, input.surface, input.seedId, profile]);

  return { data, loading };
}
