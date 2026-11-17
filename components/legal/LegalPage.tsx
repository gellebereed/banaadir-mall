import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The frame the Terms of Service and Privacy Policy share: a readable
 * column, the date they took effect, and a jump list — the sign-up form
 * links here in a new tab, so a shopper should be able to find the part
 * they care about and close it again.
 */
export const LEGAL_UPDATED = "17 November 2026";

export function LegalPage({
  title,
  intro,
  sections,
}: {
  title: string;
  intro: ReactNode;
  sections: { id: string; title: string; body: ReactNode }[];
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
      <h1 className="font-display text-3xl font-extrabold text-ocean-950">{title}</h1>
      <p className="mt-1 text-sm text-slate-400">Last updated {LEGAL_UPDATED}</p>
      <div className="mt-5 space-y-3 text-[15px] leading-relaxed text-slate-700">{intro}</div>

      <nav aria-label="Contents" className="card mt-6 p-5">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Contents</p>
        <ol className="mt-2 grid list-decimal gap-1 pl-5 text-sm sm:grid-cols-2">
          {sections.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="font-semibold text-ocean-700 hover:underline">
                {s.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {sections.map((s, i) => (
        <section key={s.id} id={s.id} className="mt-8 scroll-mt-24">
          <h2 className="font-display text-xl font-bold text-ocean-950">
            {i + 1}. {s.title}
          </h2>
          <div className="mt-2 space-y-3 text-[15px] leading-relaxed text-slate-700 [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1">
            {s.body}
          </div>
        </section>
      ))}

      <p className="mt-12 border-t border-sand-200 pt-6 text-sm text-slate-500">
        Questions? Reach us from the <Link href="/help" className="font-semibold text-ocean-700 underline">Help page</Link>.
        See also our{" "}
        {title === "Privacy Policy" ? (
          <Link href="/terms" className="font-semibold text-ocean-700 underline">Terms of Service</Link>
        ) : (
          <Link href="/privacy" className="font-semibold text-ocean-700 underline">Privacy Policy</Link>
        )}
        .
      </p>
    </div>
  );
}
