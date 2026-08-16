"use client";

import { useState } from "react";
import SearchableSelect from "./SearchableSelect";

/**
 * Subcategory selector with dropdown & custom input option.
 * Shows a dropdown of existing subcategories first, plus a toggle to type a custom one.
 */
export default function SubcategoryField({
  existing = [],
  defaultValue = "",
}: {
  /** Subcategories already used across the catalog. */
  existing: string[];
  defaultValue?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const [isCustom, setIsCustom] = useState(
    () => Boolean(defaultValue && !existing.includes(defaultValue))
  );

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label htmlFor="subcategory-input" className="label mb-0">
          Subcategory <span className="font-normal text-slate-400">(optional)</span>
        </label>
        {existing.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setIsCustom(!isCustom);
              if (!isCustom) setValue("");
            }}
            className="text-xs font-semibold text-ocean-700 hover:underline"
          >
            {isCustom ? "← Choose from existing" : "+ Create new subcategory"}
          </button>
        )}
      </div>

      {!isCustom && existing.length > 0 ? (
        /* Same reason as the category field: an imported catalogue produces
           hundreds of these, and a native dropdown of hundreds cannot be
           searched. See SearchableSelect. */
        <SearchableSelect
          id="subcategory-select"
          name="subcategoryPicker"
          defaultValue={value}
          onChange={setValue}
          placeholder="-- Select a subcategory --"
          searchPlaceholder="Type to find a subcategory…"
          options={existing.map((s) => ({ value: s, label: s }))}
        />
      ) : (
        <input
          id="subcategory-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. Cookware, Coffee Machines, Bedding"
          className="input"
        />
      )}

      {/* Hidden input ensuring the current value is always submitted in the form */}
      <input type="hidden" name="subcategory" value={value === "__NEW__" ? "" : value} />
    </div>
  );
}
