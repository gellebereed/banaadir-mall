import type { Metadata } from "next";
import Link from "next/link";
import ForgotForm from "./ForgotForm";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-[calc(100vh-13rem)] items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-ocean-950">
          Forgot your password?
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Enter the email you sign in with and we&apos;ll send you a link to choose a new one.
        </p>
        <ForgotForm />
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
