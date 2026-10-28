"use server";

/**
 * Payouts and store ownership — the two places money and control change
 * hands. Every action here is logged (lib/activity.ts).
 */

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { logActivity } from "@/lib/activity";
import { may } from "@/lib/auth";
import { addPayoutRecord, deletePayoutRecord, PAYOUT_METHODS, savePayoutAccount } from "@/lib/payouts";
import { clientIp, recordSignInFailure, recordSignInSuccess, signInBlockedFor } from "@/lib/rate-limit";
import { clearSessionCookie, getSession } from "@/lib/session";
import { money } from "@/lib/format";
import { cleanMethods, kindInfo } from "@/lib/shop-payments";

export interface MoneyState {
  ok?: string;
  error?: string;
}

// ── Where the seller wants to be paid ──────────────────────────────────

/**
 * Owner only. Staff — even managers — can't change where the store's money
 * goes: that is exactly the change someone on the inside would make.
 */
export async function savePayoutDetails(_prev: MoneyState, formData: FormData): Promise<MoneyState> {
  const session = await getSession();
  if (!session || session.role !== "seller" || session.access || !session.store) {
    return { error: "Only the store owner can change where payouts are sent." };
  }
  const method = String(formData.get("method") ?? "");
  const accountNumber = String(formData.get("accountNumber") ?? "").trim();
  const accountName = String(formData.get("accountName") ?? "").trim();
  if (!PAYOUT_METHODS.includes(method as (typeof PAYOUT_METHODS)[number])) {
    return { error: "Choose how you want to be paid." };
  }
  if (method !== "Cash" && accountNumber.length < 4) {
    return { error: "Enter the number or account the money should go to." };
  }
  try {
    await savePayoutAccount({
      store: session.store,
      method,
      accountName: accountName || undefined,
      accountNumber: accountNumber || "—",
      updatedAt: new Date().toISOString(),
      updatedBy: session.email,
    });
  } catch (err) {
    return { error: (err as Error).message };
  }
  // The number itself stays out of the log — the log is readable by managers.
  await logActivity(session.store, "payout.details", `Changed payout details to ${method}`);
  revalidatePath("/vendor/payouts");
  return { ok: "Saved. Future payouts go here." };
}

// ── Where customers pay the shop ───────────────────────────────────────

/**
 * The numbers customers send money to (lib/shop-payments.ts).
 *
 * Owner only, for the same reason as payout details: swapping the shop's
 * EVC number for your own is the one edit that quietly redirects every
 * customer's money. Each change is logged with the methods (not the
 * numbers), so an owner can see when it happened and by whom.
 */
export async function savePaymentMethods(_prev: MoneyState, formData: FormData): Promise<MoneyState> {
  const session = await getSession();
  if (!session || session.role !== "seller" || session.access || !session.store) {
    return { error: "Only the store owner can change where customers pay." };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("methodsJson") ?? "[]"));
  } catch {
    return { error: "Couldn't read the payment methods — nothing was saved." };
  }
  const cleaned = cleanMethods(raw);
  if ("error" in cleaned) return { error: cleaned.error };
  if (cleaned.methods.length === 0) {
    return { error: "Keep at least one way to pay — customers can't order from a shop that takes nothing." };
  }

  const { updateStorePaymentMethodsInSupabase, useSupabaseMutations } = await import("@/lib/supabase/mutations");
  if (useSupabaseMutations()) {
    const result = await updateStorePaymentMethodsInSupabase(session.store, cleaned.methods);
    if (result === "missing-column") {
      return { error: "Payment methods need a database update — ask the marketplace admin to run supabase/migration-shop-payments.sql." };
    }
    if (result === "error") return { error: "Couldn't save — please try again." };
  } else {
    const { mutateDB } = await import("@/lib/db");
    const store = session.store;
    await mutateDB((db) => {
      db.storeOverrides[store] = { ...db.storeOverrides[store], paymentMethods: cleaned.methods };
    });
  }
  await logActivity(
    session.store,
    "store.payments",
    `Changed how customers pay: ${cleaned.methods.map((m) => kindInfo(m.kind)?.label ?? m.kind).join(", ")}`,
  );
  revalidatePath("/vendor/settings");
  revalidatePath("/checkout");
  return { ok: "Saved. Customers will see these at checkout." };
}

// ── The admin records a payment ────────────────────────────────────────

async function requirePayoutAdmin() {
  const session = await getSession();
  if (session?.role !== "admin") return null;
  // The main admin, or platform staff trusted with settings.
  if (session.access && !may(session, "settings.manage")) return null;
  return session;
}

export async function recordPayout(_prev: MoneyState, formData: FormData): Promise<MoneyState> {
  const session = await requirePayoutAdmin();
  if (!session) return { error: "Only the marketplace admin can record payouts." };

  const store = String(formData.get("store") ?? "");
  const period = String(formData.get("period") ?? "");
  const amount = Math.round(Number(formData.get("amount")) * 100) / 100;
  const method = String(formData.get("method") ?? "").trim();
  const reference = String(formData.get("reference") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  // Commission a shop sends us, for orders its customers paid it directly
  // (lib/payouts.ts) — kept in the same ledger as a negative amount.
  const fromStore = formData.get("direction") === "from_store";

  if (!store || !/^\d{4}-\d{2}$/.test(period)) return { error: "Missing store or month." };
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: fromStore ? "Enter the amount the store sent." : "Enter the amount you sent." };
  }

  try {
    await addPayoutRecord({
      id: `pay-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      store,
      period,
      amount: fromStore ? -amount : amount,
      method: method || undefined,
      reference: reference || undefined,
      note: note || undefined,
      paidAt: new Date().toISOString(),
      paidBy: session.email,
    });
  } catch (err) {
    return { error: (err as Error).message };
  }
  await logActivity(
    store,
    "payout.record",
    `${fromStore ? "Recorded commission received" : "Recorded a payout"} of ${money(amount)} for ${period}${method ? ` via ${method}` : ""}${reference ? ` (ref ${reference})` : ""}`,
    period,
  );
  revalidatePath("/admin/payouts");
  revalidatePath("/vendor/payouts");
  return { ok: fromStore ? `Recorded ${money(amount)} received.` : `Recorded ${money(amount)}.` };
}

export async function removePayout(id: string): Promise<MoneyState> {
  const session = await requirePayoutAdmin();
  if (!session) return { error: "Only the marketplace admin can change payouts." };
  try {
    const removed = await deletePayoutRecord(id);
    if (removed) {
      await logActivity(
        removed.store,
        "payout.delete",
        `Deleted a recorded ${removed.amount < 0 ? "commission receipt" : "payout"} of ${money(Math.abs(removed.amount))} for ${removed.period}`,
        removed.period,
      );
    }
  } catch (err) {
    return { error: (err as Error).message };
  }
  revalidatePath("/admin/payouts");
  revalidatePath("/vendor/payouts");
  return { ok: "Payout removed." };
}

// ── Handing the store over ─────────────────────────────────────────────

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  TRANSFER OWNERSHIP — the owner hands their store to another account.
 * ─────────────────────────────────────────────────────────────────────────
 * Before this, a store changing hands (sold, or passed to a family member)
 * meant asking the admin, who had no tool for it either.
 *
 * Guard rails, because this can't be undone by the person doing it:
 *   · current password, counted by the sign-in throttle
 *   · the store's name typed out, so it's never a mis-tap
 *   · the new owner must already have an account (they register first)
 *     and must not own, or work at, another store — a team row decides
 *     how an email signs in, so they would never land as owner
 * The old owner can stay on as a manager, or leave entirely. Either way
 * they are signed out now: their owner session ends with the transfer.
 * ─────────────────────────────────────────────────────────────────────────
 */
export async function transferOwnership(_prev: MoneyState, formData: FormData): Promise<MoneyState> {
  const session = await getSession();
  if (!session || session.role !== "seller" || session.access || !session.store) {
    return { error: "Only the store owner can transfer the store." };
  }
  const { accountsEnabled, findAuthUser, isAdminEmail, removeStoreOwner, setStoreOwner } = {
    ...(await import("@/lib/accounts")),
    ...(await import("@/lib/auth")),
  };
  if (!accountsEnabled()) return { error: "Transferring a store needs the live database." };

  const { getStore, getEmployeeMemberships } = await import("@/lib/api");
  const store = await getStore(session.store);
  if (!store) return { error: "Store not found." };

  const newEmail = String(formData.get("newOwner") ?? "").trim().toLowerCase();
  const typedName = String(formData.get("confirmName") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const stay = formData.get("stayAsManager") === "on";

  if (!newEmail.includes("@")) return { error: "Enter the new owner's email." };
  if (newEmail === session.email) return { error: "That's you — enter the new owner's email." };
  if (typedName.toLowerCase() !== store.name.trim().toLowerCase()) {
    return { error: `Type the store's name exactly — "${store.name}" — to confirm.` };
  }
  if (isAdminEmail(newEmail)) return { error: "The marketplace admin can't own a store." };

  // Prove it's really the owner.
  const ip = clientIp(await headers());
  const wait = signInBlockedFor(session.email, ip);
  if (wait > 0) return { error: `Too many wrong passwords. Try again in ${wait} minutes.` };
  const { createClient } = await import("@/lib/supabase/server");
  const { error: pwError } = await (await createClient()).auth.signInWithPassword({
    email: session.email,
    password,
  });
  if (pwError) {
    recordSignInFailure(session.email, ip);
    return { error: "Your password isn't right." };
  }
  recordSignInSuccess(session.email, ip);

  if (!(await findAuthUser(newEmail))) {
    return {
      error: `${newEmail} doesn't have a Banaadir Mall account yet. Ask them to register (as a shopper is fine), then try again.`,
    };
  }
  const memberships = await getEmployeeMemberships(newEmail);
  if (memberships.some((m) => m.store !== store.slug)) {
    return { error: `${newEmail} works at another store's team, so they can't own one too yet.` };
  }

  const { deleteEmployeeFromSupabase, insertEmployee, useSupabaseMutations } = await import(
    "@/lib/supabase/mutations"
  );
  const { mutateDB } = await import("@/lib/db");

  try {
    await setStoreOwner(store.slug, newEmail);
  } catch (err) {
    return { error: (err as Error).message };
  }

  // If the new owner was on this store's team, that row would make them
  // sign in as staff — it goes.
  for (const row of memberships) {
    if (useSupabaseMutations()) await deleteEmployeeFromSupabase(row.id);
    await mutateDB((db) => {
      db.employees = db.employees.filter((e) => e.id !== row.id);
    });
  }

  try {
    await removeStoreOwner(store.slug, session.email);
  } catch (err) {
    // Two owners is recoverable from Store owners; failing silently isn't.
    return {
      error: `${newEmail} now owns the store, but removing you failed: ${(err as Error).message}. Ask the admin to remove you in Store owners.`,
    };
  }

  if (stay) {
    const row = {
      id: `emp-${Date.now().toString(36)}`,
      store: store.slug,
      name: session.name,
      email: session.email,
      role: "manager" as const,
      status: "active" as const,
    };
    const result = await insertEmployee(row);
    if (!result.ok) {
      await mutateDB((db) => {
        db.employees.push(row);
      });
    }
  }

  await logActivity(
    store.slug,
    "store.transfer",
    `Transferred ownership of ${store.name} from ${session.email} to ${newEmail}${stay ? " (stays on as manager)" : ""}`,
    newEmail,
  );

  await clearSessionCookie();
  redirect("/login?transferred=1");
}
