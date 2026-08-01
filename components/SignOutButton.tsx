import { signOut } from "@/app/auth-actions";

/** Clears the demo session (server action) and returns to the home page. */
export default function SignOutButton() {
  return (
    <form action={signOut}>
      <button className="rounded-full border border-sand-200 px-4 py-2 text-sm font-semibold text-slate-500 transition hover:bg-sand-100">
        Sign out
      </button>
    </form>
  );
}
