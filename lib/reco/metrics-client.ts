/**
 * The browser half of shelf metrics (see lib/reco/metrics.ts).
 *
 * Events are queued and sent in batches — every few seconds, and when the
 * page is hidden (sendBeacon survives the tab closing).
 *
 * Attribution is local: tapping a product on a shelf is remembered on this
 * device for 7 days, so that a later add-to-cart or purchase of that
 * product can be credited to the shelf that surfaced it. Only the shelf
 * and page type are ever sent — never who.
 */

type Kind = "impression" | "click" | "cart" | "order" | "coview";
interface Pending {
  kind: Kind;
  surface?: string;
  shelf?: string;
  productId?: string;
  value?: number;
  via?: string;
  items?: Record<string, number>;
  otherId?: string;
}

const ATTRIBUTION_KEY = "bm-reco-attribution";
const ATTRIBUTION_DAYS = 7;
const FLUSH_MS = 5000;

let queue: Pending[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let listening = false;

function flush() {
  if (timer) clearTimeout(timer);
  timer = null;
  if (queue.length === 0 || typeof navigator === "undefined") return;
  const batch = JSON.stringify(queue.splice(0, 50));
  try {
    if (!navigator.sendBeacon?.("/api/reco/events", batch)) {
      void fetch("/api/reco/events", { method: "POST", body: batch, keepalive: true });
    }
  } catch {
    // Metrics are best-effort.
  }
  if (queue.length) schedule();
}

function schedule() {
  if (!listening && typeof document !== "undefined") {
    listening = true;
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush();
    });
  }
  if (!timer) timer = setTimeout(flush, FLUSH_MS);
}

function push(event: Pending) {
  queue.push(event);
  schedule();
}

type Attribution = Record<string, { surface: string; shelf: string; via?: string; at: number }>;

function readAttribution(): Attribution {
  try {
    const all = JSON.parse(localStorage.getItem(ATTRIBUTION_KEY) || "{}") as Attribution;
    const cutoff = Date.now() - ATTRIBUTION_DAYS * 86_400_000;
    for (const [id, a] of Object.entries(all)) if (a.at < cutoff) delete all[id];
    return all;
  } catch {
    return {};
  }
}

function writeAttribution(value: Attribution) {
  try {
    localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(value));
  } catch {
    // Full or blocked storage: attribution is lost, nothing else breaks.
  }
}

/** A shelf came into view; `items` = cards per strategy on it (for tuning). */
export function trackImpression(surface: string, shelf: string, items?: Record<string, number>) {
  push({ kind: "impression", surface, shelf, items });
}

/** A product on a shelf was tapped — and is remembered for attribution. */
export function trackShelfClick(surface: string, shelf: string, productId: string, via?: string) {
  push({ kind: "click", surface, shelf, productId, via });
  writeAttribution({ ...readAttribution(), [productId]: { surface, shelf, via, at: Date.now() } });
}

// ── Viewed together ────────────────────────────────────────────────────

const VISIT_KEY = "bm-visit-views";
/** A gap longer than this starts a new visit. */
const VISIT_GAP_MS = 30 * 60_000;
/** Products remembered per visit — pairs only with the most recent few. */
const VISIT_DEPTH = 4;

/**
 * A product page was opened. Pairs it with the other products viewed in
 * this visit and reports ONLY the pairs — "A and B were looked at
 * together" — with no session, device or shopper attached (lib/reco/
 * coview.ts). The visit list itself stays in this tab's sessionStorage.
 */
export function recordView(productId: string) {
  try {
    const now = Date.now();
    const recent = (JSON.parse(sessionStorage.getItem(VISIT_KEY) || "[]") as { id: string; at: number }[]).filter(
      (v) => now - v.at < VISIT_GAP_MS && v.id !== productId,
    );
    for (const v of recent.slice(-VISIT_DEPTH)) push({ kind: "coview", productId: v.id, otherId: productId });
    sessionStorage.setItem(VISIT_KEY, JSON.stringify([...recent, { id: productId, at: now }].slice(-VISIT_DEPTH)));
  } catch {
    // Blocked storage: no co-view, nothing else affected.
  }
}

/** A product went into the basket: credited to its shelf, if one surfaced it. */
export function attributeCart(productId: string) {
  const a = readAttribution()[productId];
  if (a) push({ kind: "cart", surface: a.surface, shelf: a.shelf, productId, via: a.via });
}

/** An order was placed: each line a shelf surfaced is credited with its revenue, once. */
export function attributePurchase(lines: { productId: string; revenue: number }[]) {
  const all = readAttribution();
  for (const line of lines) {
    const a = all[line.productId];
    if (!a) continue;
    push({
      kind: "order",
      surface: a.surface,
      shelf: a.shelf,
      productId: line.productId,
      value: Math.round(line.revenue * 100) / 100,
      via: a.via,
    });
    delete all[line.productId];
  }
  writeAttribution(all);
  flush();
}
