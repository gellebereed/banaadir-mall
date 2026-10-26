"use client";

import { useState } from "react";

export interface LinkOption {
  label: string;
  href: string;
  /** Heading the option is listed under: "Campaigns", "Departments", … */
  group: string;
}

/**
 * Where a banner or tile goes when tapped.
 *
 * A free-text box on its own meant the admin had to know the site's URLs
 * by heart ("/products?sort=discount") and a typo produced a banner that
 * opened a 404. The picker lists the places worth sending people — the
 * campaigns running now first — and fills the box in; the box stays
 * editable for anything else.
 */
export default function LinkField({
  id,
  defaultValue,
  options,
  label = "Opens",
}: {
  id: string;
  defaultValue: string;
  options: LinkOption[];
  label?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const groups = [...new Set(options.map((o) => o.group))];
  const known = options.find((o) => o.href === value);

  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <div className="grid gap-2 sm:grid-cols-2">
        <select
          aria-label="Pick a page"
          value={known ? known.href : ""}
          onChange={(e) => e.target.value && setValue(e.target.value)}
          className="input"
        >
          <option value="">Pick a page…</option>
          {groups.map((group) => (
            <optgroup key={group} label={group}>
              {options
                .filter((o) => o.group === group)
                .map((o) => (
                  <option key={`${group}-${o.href}`} value={o.href}>
                    {o.label}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
        <input
          id={id}
          name="link"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="/products?sort=discount"
          className="input font-mono !text-xs"
        />
      </div>
      <p className="mt-1 text-[11px] text-slate-400">
        {known ? `→ ${known.label}` : "Pick a page, or type any address on this site (starting with /) or a full https:// link."}
      </p>
    </div>
  );
}
