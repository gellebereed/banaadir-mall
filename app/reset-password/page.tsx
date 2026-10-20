import type { Metadata } from "next";
import Link from "next/link";
import ResetPasswordForm from "./ResetPasswordForm";
import { isRecoverySession } from "@/lib/supabase/recovery";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/storage";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string }>;
}) {
  const { token_hash: tokenHash } = await searchParams;
  // Arriving from Supabase's default email link: /api/auth/callback has
  // already turned it into a short recovery session.
  const recovering =
    !tokenHash && isSupabaseConfigured()
      ? await isRecoverySession(await createClient())
      : false;

  return (
    <div className="flex min-h-[calc(100vh-13rem)] items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-ocean-950">
          Choose a new password
        </h1>
        {tokenHash || recovering ? (
          <>
            <p className="mt-2 text-sm text-slate-500">
              This link works once. After saving you&apos;ll be signed in, and
              this becomes the only password for your account.
            </p>
            <ResetPasswordForm tokenHash={tokenHash ?? ""} />
          </>
        ) : (
          <p className="mt-4 rounded-xl bg-coral-100 px-4 py-3 text-sm font-medium text-coral-700">
            This reset link is incomplete or has expired.{" "}
            <Link href="/forgot-password" className="font-bold underline">
              Request a new one
            </Link>
            .
          </p>
        )}
      </div>
    </div>
  );
}
