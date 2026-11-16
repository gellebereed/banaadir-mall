"use server";

/**
 * Sign in or sign up with a one-time code sent by SMS (Supabase Auth phone
 * provider → Twilio Verify). One action, two steps: `intent=send` texts the
 * code, `intent=verify` checks it and starts the session.
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
    return mode === "login"
      ? "No account uses this number yet. Create one below — it takes a minute."
      : "Sign-up by phone is switched off right now. Please use email instead.";
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
  const mode = formData.get("mode") === "signup" ? "signup" : "login";
  const name = String(formData.get("name") ?? "").trim().slice(0, 80);
  const next = formData.get("next");

  // ── Step 1: text the code ───────────────────────────────────────────
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

    if (!isSupabaseConfigured()) {
      return { phone, channel, message: `Demo mode: nothing is sent ${via}. Enter ${DEMO_CODE}.` };
    }

    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithOtp({
      phone,
      options: {
        channel,
        // Signing in must not quietly create an account for a mistyped
        // number; signing up with a number that already has one just
        // signs them in, which is what they wanted anyway.
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
    const user = data.user;

    /*
     * A number attached to an email account (added in Supabase, or later
     * from the account page) opens THAT account — same orders, same role —
     * so it goes through the same resolver as an email sign-in.
     */
    if (user.email && !isPhoneLoginEmail(user.email)) {
      const { resolveSession } = await import("@/lib/accounts");
      const result = await resolveSession(user.email, user);
      if ("error" in result) return { phone, error: result.error };
      session = { ...result.session, phone: result.session.phone ?? phone };
    } else {
      const meta = (user.user_metadata ?? {}) as { name?: unknown };
      session = {
        name: (typeof meta.name === "string" && meta.name.trim()) || name || "Shopper",
        email: phoneLoginEmail(phone),
        role: "customer",
        phone,
      };
    }
  }

  recordSignInSuccess(phone, ip);
  await setSessionCookie(session);
  redirect(safeNext(next) ?? (session.role === "customer" ? "/account" : homeForRole(session.role)));
}
