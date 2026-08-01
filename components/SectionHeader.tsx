import Link from "next/link";

/** Section title row with an optional "View all →" link on the right. */
export default function SectionHeader({
  title,
  subtitle,
  href,
  linkLabel = "View all",
}: {
  title: string;
  subtitle?: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div>
        <h2 className="font-display text-2xl font-bold text-ocean-950 sm:text-3xl">
          {title}
        </h2>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {href && (
        <Link
          href={href}
          className="shrink-0 text-sm font-semibold text-ocean-700 hover:text-mango-600"
        >
          {linkLabel} →
        </Link>
      )}
    </div>
  );
}
