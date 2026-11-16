"use server";

/**
 * Phone number + password, with a one-time code (SMS or WhatsApp, Supabase
 * Auth phone provider → Twilio Verify) only where proof of the number is
 * needed:
 *
 *   · sign up        — name, number, password → code → account created
 *   · sign in        — number + password, no code (`intent=password`)
 *   · forgot it      — number + NEW password → code → password replaced
 *
 * ── Why a password and not a code every time ─────────────────────────────
 * A code on every sign-in costs the shop a few cents each time, fails when
 * the customer has no signal or no SMS credit, and an international SMS can
 * arrive minutes late — all at the moment they are trying to pay. The code
 * proves the number ONCE; after that a password is faster and free.
 *
 * Email + password (app/auth-actions.ts) stays exactly as it was: every
 * account made before this, every seller, the admin and staff sign in
 * that way. This is the shopper's way in.
 */

import { redirect } from "next/navigation";
import { safeNext } from "@/lib/safe-next";
import { homeForRole, type Session } from "@/lib/auth";
import { setSessionCookie } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/storage";
import { isPhoneLoginEmail, phoneLoginEmail, toE164 } from "@/lib/phone-auth";
import type { User } from "@supabase/supabase-js";

const MIN_PASSWORD = 8;

type Mode = "signup" | "reset" | "login";

/** The password typed on step one, checked before any code is sent. */
function passwordProblem(formData: FormData): string | null {
  const password = String(formData.get("password") ?? "");
  if (password.length < MIN_PASSWORD) return `Your password needs at least ${MIN_PASSWORD} characters.`;
  if (password.length > 72) return "That password is too long (72 characters at most).";
  if (password !== String(formData.get("confirmPassword") ?? password)) {
    return "The two passwords don't match.";
  }
  return null;
}

/**
 * The marketplace session for a Supabase user who just proved their number.
 * A number attached to an email account (added in Supabase, or later from
 * the account page) opens THAT account — same orders, same role — so it
 * goes through the same resolver as an email sign-in.
 */
async function sessionFor(user: User, phone: string, name: string): Promise<Session | { error: string }> {
  if (user.email && !isPhoneLoginEmail(user.email)) {
    const { resolveSession } = await import("@/lib/accounts");
    const result = await resolveSession(user.email, user);
    if ("error" in result) return { error: result.error };
    return { ...result.session, phone: result.session.phone ?? phone };
  }
  const meta = (user.user_metadata ?? {}) as { name?: unknown };
  return {
    name: (typeof meta.name === "string" && meta.name.trim()) || name || "Shopper",
    email: phoneLoginEmail(phone),
    role: "customer",
    phone,
  };
}

async function throttle() {
  const { headers } = await import("next/headers");
  const rl = await import("@/lib/rate-limit");
  return { ip: rl.clientIp(await headers()), ...rl };
}

function finish(session: Session, next: FormDataEntryValue | null): never {
  redirect(safeNext(next) ?? (session.role === "customer" ? "/account" : homeForRole(session.role)));
}

export type Channel = "sms" | "whatsapp";

export interface PhoneAuthState {
  error?: string | null;
  /** Set once a code has been sent: the number it went to, in +E.164. */
  phone?: string;
  /** How the last code went out — the resend links offer the other one. */
  channel?: Channel;
  message?: string;
}

/** On a site without Supabase (local demo) this code always works. */
const DEMO_CODE = "123456";

/**
 * Supabase's error → words a shopper can act on. The raw text still goes
 * to the server log, because "Error sending confirmation OTP to provider"
 * is the only clue the owner gets when Twilio refuses a message.
 */
function friendly(err: { message: string; code?: string; status?: number }, mode: string): string {
  const text = `${err.code ?? ""} ${err.message}`.toLowerCase();
  if (text.includes("signups not allowed") || text.includes("otp_disabled") || text.includes("user not found")) {
    return mode === "signup"
      ? "Sign-up by phone is switched off right now. Please use email instead."
      : "No account uses this number yet. Create one — it takes a minute.";
  }
  if (text.includes("weak_password") || text.includes("pwned") || text.includes("leaked")) {
    return "That password is too easy to guess or has appeared in a data leak. Please choose another.";
  }
  if (text.includes("phone_provider_disabled") || text.includes("unsupported phone provider")) {
    return "Phone sign-in isn't switched on yet. Please use email for now.";
  }
  if (text.includes("rate") || err.status === 429) {
    return "Too many codes requested. Please wait a minute and try again.";
  }
  if (text.includes("sms_send_failed") || text.includes("sending") || text.includes("provider")) {
    return "We couldn't send the SMS to this number. Check it and try again, or use email instead.";
  }
  if (text.includes("expired") || text.includes("invalid") || text.includes("token")) {
    return "That code is wrong or has expired. Check the message, or send a new code.";
  }
  return "Something went wrong. Please try again.";
}

export async function phoneAuth(_prev: PhoneAuthState, formData: FormData): Promise<PhoneAuthState> {
  const intent = String(formData.get("intent") ?? "send");
  const rawMode = formData.get("mode");
  const mode: Mode = rawMode === "signup" ? "signup" : rawMode === "reset" ? "reset" : "login";
  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  const next = formData.get("next");

  // ── Sign in with number + password (no code) ────────────────────────
  if (intent === "password") {
    const phone = toE164(String(formData.get("countryCode") ?? "+252"), String(formData.get("phone") ?? ""));
    const password = String(formData.get("password") ?? "");
    if (!phone || !password) return { error: "Please enter your mobile number and password." };

    const t = await throttle();
    const wait = t.signInBlockedFor(phone, t.ip);
    if (wait > 0) {
      return { error: `Too many failed attempts. Please wait ${wait} minute${wait === 1 ? "" : "s"} and try again.` };
    }

    let session: Session;
    if (!isSupabaseConfigured()) {
      if (password.length < MIN_PASSWORD) {
        t.recordSignInFailure(phone, t.ip);
        return { error: "Wrong number or password." };
      }
      session = { name: "Shopper", email: phoneLoginEmail(phone), role: "customer", phone };
    } else {
      const supabase = await createClient();
      const { data, error } = await supabase.auth.signInWithPassword({ phone, password });
      if (error || !data.user) {
        t.recordSignInFailure(phone, t.ip);
        // One message for "no such number" and "wrong password", so the
        // form can't be used to find out who has an account.
        return {
          error:
            "Wrong number or password. If you signed up with a code and never set a password, use “Forgot password?” to set one.",
        };
      }
      const result = await sessionFor(data.user, phone, "");
      if ("error" in result) return { error: result.error };
      session = result;
    }
    t.recordSignInSuccess(phone, t.ip);
    await setSessionCookie(session);
    finish(session, next);
  }

  // ── Step 1: send the code ───────────────────────────────────────────
  if (intent === "send") {
    const phone = toE164(String(formData.get("countryCode") ?? "+252"), String(formData.get("phone") ?? ""));
    /*
     * SMS or WhatsApp, the shopper's choice. Plenty of people here keep
     * WhatsApp on wifi while their SIM is out of credit or roaming, and an
     * international SMS can arrive minutes late; WhatsApp needs no signal.
     * Both go through the same Twilio Verify service and are checked the
     * same way (verifyOtp type "sms").
     */
    const channel: Channel = formData.get("channel") === "whatsapp" ? "whatsapp" : "sms";
    const via = channel === "whatsapp" ? "on WhatsApp" : "by SMS";
    if (!phone) return { error: "Please enter a valid mobile number." };
    if (mode === "signup" && !name) return { error: "Please enter your name." };
    // Checked before a code is sent: a refusal after the code would waste
    // the SMS and leave a verified number with no password.
    if (mode !== "login") {
      const problem = passwordProblem(formData);
      if (problem) return { error: problem };
    }

    if (!isSupabaseConfigured()) {
      return { phone, channel, message: `Demo mode: nothing is sent ${via}. Enter ${DEMO_CODE}.` };
    }

    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithOtp({
      phone,
      options: {
        channel,
        // A password reset must not quietly create an account for a
        // mistyped number; signing up with a number that already has one
        // proves it is theirs just the same, and sets the password.
        shouldCreateUser: mode === "signup",
        data: mode === "signup" ? { name, role: "customer" } : undefined,
      },
    });
    if (error) {
      console.error(`[PhoneAuth] ${channel} send failed:`, error.code, error.status, error.message);
      const message = friendly(error, mode);
      return {
        error:
          channel === "whatsapp" && message.startsWith("We couldn't send")
            ? "We couldn't send the code on WhatsApp. Is WhatsApp set up on this number? Try SMS instead."
            : message,
      };
    }
    return { phone, channel, message: `We've sent a 6-digit code to ${phone} ${via}.` };
  }

  // ── Step 2: check the code ──────────────────────────────────────────
  const phone = toE164("", String(formData.get("phone") ?? ""));
  const token = String(formData.get("code") ?? "").replace(/\D/g, "");
  if (!phone) return { error: "Please enter your number again." };
  if (token.length < 4) return { phone, error: "Enter the code from the SMS." };

  const { headers } = await import("next/headers");
  const { clientIp, recordSignInFailure, recordSignInSuccess, signInBlockedFor } = await import(
    "@/lib/rate-limit"
  );
  const ip = clientIp(await headers());
  const wait = signInBlockedFor(phone, ip);
  if (wait > 0) {
    return { phone, error: `Too many wrong codes. Please wait ${wait} minute${wait === 1 ? "" : "s"}.` };
  }

  // The password travels with the code (kept in the browser between the
  // two steps, never stored here) and is set only once the code is right.
  const password = String(formData.get("password") ?? "");
  if (mode !== "login") {
    const problem = passwordProblem(formData);
    if (problem) return { phone, error: problem };
  }

  let session: Session;
  if (!isSupabaseConfigured()) {
    if (token !== DEMO_CODE) {
      recordSignInFailure(phone, ip);
      return { phone, error: "That code is wrong or has expired. Check the message, or send a new code." };
    }
    session = { name: name || "Shopper", email: phoneLoginEmail(phone), role: "customer", phone };
  } else {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({ phone, token, type: "sms" });
    if (error || !data.user) {
      recordSignInFailure(phone, ip);
      if (error) console.warn("[PhoneAuth] verify failed:", error.code, error.message);
      return { phone, error: error ? friendly(error, mode) : "Please try again." };
    }

    if (mode !== "login") {
      const { error: pwError } = await supabase.auth.updateUser({ password });
      if (pwError) {
        console.warn("[PhoneAuth] set password failed:", pwError.code, pwError.message);
        // The number IS verified now; only the password was refused. Send
        // them back to choose another — a new code is needed for that.
        return {
          error: `Your number is verified, but that password was refused: ${friendly(pwError, mode)} Use “Forgot password?” to set a different one.`,
        };
      }
    }

    const result = await sessionFor(data.user, phone, name);
    if ("error" in result) return { phone, error: result.error };
    session = result;
  }

  recordSignInSuccess(phone, ip);
  await setSessionCookie(session);
  finish(session, next);
}
