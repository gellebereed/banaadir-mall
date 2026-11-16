import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { signInConfirmedUser } from "@/lib/email-signin";

/**
 * Landing point for Supabase email links built with {{ .TokenHash }} —
 * sign-up confirmation and email-change confirmation (see README → Account
 * emails, and supabase/email-templates/). Unlike the default links, these
 * work even when the email is opened in a different browser or app than
 * the one that asked for it.
 *
 * A sign-up confirmation also signs the new customer in, so the link takes
 * them straight to their account instead of a login form.
 *
 * Only same-site paths are accepted for `next`, so the link can't be
 * turned into a redirect to somewhere else.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const rawNext = searchParams.get("next") ?? "/";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

  if (tokenHash && type) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      if (type === "signup" || type === "email") {
        const signedIn = await signInConfirmedUser(data.user);
        if (!signedIn) return NextResponse.redirect(`${origin}/login?with=email&confirmed=1`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=link_expired`);
}
