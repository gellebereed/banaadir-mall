import type { Metadata } from "next";
import Link from "next/link";
import ForgotTabs from "./ForgotTabs";

export const metadata: Metadata = { title: "Forgot password", robots: { index: false } };

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ with?: string }>;
}) {
  const { with: via } = await searchParams;
  return (
    <div className="flex min-h-[calc(100vh-13rem)] items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-ocean-950">
          Forgot your password?
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Reset it with a code by SMS to your phone, or with a link to your email.
        </p>
        <ForgotTabs initial={via === "email" ? "email" : "phone"} />
        <p className="mt-6 text-center text-sm text-slate-500">
          Remembered it?{" "}
          <Link href="/login" className="font-bold text-ocean-700 hover:text-mango-600">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
