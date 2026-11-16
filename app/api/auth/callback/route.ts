import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { signInConfirmedUser } from "@/lib/email-signin";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Same-site paths only. "@evil.com" or "//evil.com" appended to the
  // origin would send the visitor — signed in — to another site.
  const rawNext = searchParams.get("next") ?? "/";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // `signin=1` is set by the sign-up forms: confirming the email signs
      // the new account in (lib/email-signin.ts). Password-reset and
      // email-change links leave it off.
      if (searchParams.get("signin") === "1") await signInConfirmedUser(data.user);
      const forwardedHost = request.headers.get("x-forwarded-host");
      const isLocalEnv = process.env.NODE_ENV === "development";
      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${next}`);
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`);
      } else {
        return NextResponse.redirect(`${origin}${next}`);
      }
    }
  }

  // return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
