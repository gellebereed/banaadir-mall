"use client";

/**
 * "Forgot password" by SMS code or by email link — whichever the account
 * has. An account with both can use either.
 */

import { useState } from "react";
import MethodTabs, { type AuthMethod } from "@/components/auth/MethodTabs";
import PhoneAuthForm from "@/components/auth/PhoneAuthForm";
import ForgotForm from "./ForgotForm";

export default function ForgotTabs({ initial }: { initial: AuthMethod }) {
  const [method, setMethod] = useState<AuthMethod>(initial);
  return (
    <div className="mt-6">
      <MethodTabs value={method} onChange={setMethod} label="Reset with" />
      <div className="mt-5">
        {method === "phone" ? (
          <PhoneAuthForm key="phone" mode="reset" />
        ) : (
          <>
            <p className="text-sm text-slate-500">
              Enter your email and choose a new password from the link we send you.
            </p>
            <ForgotForm />
          </>
        )}
      </div>
    </div>
  );
}
