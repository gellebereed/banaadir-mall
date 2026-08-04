/**
 * ─────────────────────────────────────────────────────────────────────────
 *  PROMPTS — the few questions worth interrupting somebody for.
 * ─────────────────────────────────────────────────────────────────────────
 * A shop that asks a new visitor what they are shopping for gets a useful
 * home page on the FIRST visit instead of the fifth. A shop that asks a
 * returning customer how their order went gets real reviews instead of
 * generated ones. Both are worth an interruption. Almost nothing else is.
 *
 * ── The rules that keep this from becoming a pop-up problem ──────────────
 *
 * ONE AT A TIME, AND NOT STRAIGHT AWAY. Never more than a single prompt per
 * page, never before the admin's delay has elapsed, and never on the cart
 * or checkout — interrupting somebody who is trying to pay is the most
 * expensive possible moment to ask a question.
 *
 * ASKED ONCE, THEN LEFT ALONE. A dismissed prompt is stamped on DISPLAY,
 * not on dismissal, and honours a cooldown measured in days. An answered
 * one is never asked again.
 *
 * EARN IT FIRST. The taste prompt only appears once the shopper has looked
 * at something, so it reads as "help us get this right" rather than a
 * toll-gate on the door. The review prompt only appears for an order that
 * actually reached them.
 *
 * NOTHING IS REQUIRED. Every prompt is skippable, and skipping is a normal
 * outcome rather than a nag loop.
 *
 * ── On not asking for gender ─────────────────────────────────────────────
 * The obvious version of this asks for gender. It is worse on every axis
 * that matters: a man buying his sister a birthday present wants womenswear
 * this week and menswear next, so the answer mispredicts exactly when it is
 * used; it forces a personal disclosure to a shop that has no business
 * needing it; and it produces one bit where the department question
 * produces several. Asking what somebody is shopping for is both the more
 * accurate question and the more respectful one.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { Category, Order, Product, PromptSettings } from "../types";
import type { Taste } from "./taste";
import type { PromptOffer, Surface, TasteProfile } from "./types";

const DAY_MS = 86_400_000;

/** Price bands offered by the budget prompt. Keys match taste.priceBand(). */
export const PRICE_BANDS = [
  { value: "under-10", label: "Under $10" },
  { value: "10-25", label: "$10 – $25" },
  { value: "25-50", label: "$25 – $50" },
  { value: "50-100", label: "$50 – $100" },
  { value: "100-250", label: "$100 – $250" },
  { value: "250-plus", label: "$250+" },
];

export interface PromptInput {
  surface: Surface;
  settings: PromptSettings;
  profile: TasteProfile;
  taste: Taste;
  categories: Category[];
  orders: Order[];
  byId: Map<string, Product>;
  identity: { email?: string; name?: string; firstName?: string };
  now: number;
}

/**
 * The one question worth asking right now, or nothing.
 *
 * Ordered by how much the answer is worth: a real review beats a stated
 * department, which beats a budget. The first eligible one wins and the
 * rest wait for another day.
 */
export function choosePrompt(input: PromptInput): PromptOffer | undefined {
  if (!input.settings.enabled) return undefined;

  // Never interrupt a transaction in progress.
  if (input.surface === "cart" || input.surface === "confirmation") return undefined;

  return (
    reviewPrompt(input) ??
    departmentsPrompt(input) ??
    budgetPrompt(input) ??
    undefined
  );
}

/** Has this prompt been shown recently, or already answered? */
function isEligible(input: PromptInput, id: string): boolean {
  const prefs = input.profile.prefs ?? {};
  if (prefs.promptsDone?.includes(id)) return false;

  const lastSeen = prefs.promptsSeen?.[id];
  if (!lastSeen) return true;
  return input.now - lastSeen >= input.settings.cooldownDays * DAY_MS;
}

// ── "What are you shopping for?" ───────────────────────────────────────

function departmentsPrompt(input: PromptInput): PromptOffer | undefined {
  if (!input.settings.askDepartments) return undefined;
  if (!isEligible(input, "departments")) return undefined;
  // Already told us, and it hasn't gone stale.
  if ((input.profile.prefs?.departments?.length ?? 0) > 0) return undefined;

  // Wait until they have actually looked at something. Asked on arrival
  // this is a gate; asked after two products it is a shop paying attention.
  const looked = input.profile.events.filter((e) => e.k === "view").length;
  if (looked < 2) return undefined;

  const roots = input.categories
    .filter((category) => !category.parentSlug && !category.hidden)
    .slice(0, 8);
  if (roots.length < 3) return undefined;

  return {
    id: "departments",
    kind: "departments",
    title: input.identity.firstName
      ? `${input.identity.firstName}, what are you shopping for?`
      : "What are you shopping for?",
    body: "Pick as many as you like. We'll lead with these — and you can change it any time from your account.",
    options: roots.map((category) => ({
      value: category.slug,
      label: category.name,
      icon: category.icon,
    })),
    delaySeconds: input.settings.delaySeconds,
  };
}

// ── "What's your usual range?" ─────────────────────────────────────────

function budgetPrompt(input: PromptInput): PromptOffer | undefined {
  if (!input.settings.askBudget) return undefined;
  if (!isEligible(input, "budget")) return undefined;
  if (input.profile.prefs?.budget) return undefined;

  // Only ask AFTER the department question has been answered — two
  // onboarding questions in one session is a survey, not a shop.
  if ((input.profile.prefs?.departments?.length ?? 0) === 0) return undefined;

  return {
    id: "budget",
    kind: "budget",
    title: "What's your usual range?",
    body: "So we lead with things actually worth your time. Nothing is hidden either way.",
    options: PRICE_BANDS.map((band) => ({ value: band.value, label: band.label })),
    delaySeconds: Math.max(20, input.settings.delaySeconds),
  };
}

// ── "How was it?" ──────────────────────────────────────────────────────

/**
 * Ask about something they actually received.
 *
 * Restricted to DELIVERED orders belonging to this shopper, and to a
 * product they have not already rated. A rating request for a parcel still
 * in transit is the clearest possible signal that a shop is not reading its
 * own data, and it poisons the reviews it collects.
 */
function reviewPrompt(input: PromptInput): PromptOffer | undefined {
  if (!input.settings.askReview) return undefined;
  if (!isEligible(input, "review")) return undefined;

  const email = input.identity.email?.trim().toLowerCase();
  const name = input.identity.name?.trim().toLowerCase();
  if (!email && !name) return undefined;

  const rated = new Set(input.profile.prefs?.rated ?? []);

  const theirs = input.orders
    .filter((order) => order.status === "delivered")
    .filter((order) => {
      if (email && order.email?.trim().toLowerCase() === email) return true;
      if (!email && name && order.customer?.trim().toLowerCase() === name) return true;
      return false;
    })
    // Most recent delivery first: it is the one they remember.
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  for (const order of theirs) {
    for (const item of order.items ?? []) {
      if (rated.has(item.productId)) continue;
      const product = input.byId.get(item.productId);
      if (!product) continue;

      return {
        id: "review",
        kind: "review",
        title: "How was it?",
        body: `You received this on ${formatDate(order.date)}. A line from you is worth more to the next shopper than anything we could write.`,
        product,
        orderId: order.id,
        // Shorter wait: this one is welcome, and it is about something the
        // shopper already chose to spend money on.
        delaySeconds: Math.max(15, Math.round(input.settings.delaySeconds / 2)),
      };
    }
  }

  return undefined;
}

function formatDate(iso: string): string {
  const date = new Date(`${(iso ?? "").slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "recently";
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
}
