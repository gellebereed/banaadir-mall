/**
 * Subcategory input with suggestions.
 *
 * A subcategory exists as soon as a seller types it on a product — the
 * datalist offers whatever already exists so spelling stays consistent,
 * while still allowing a brand-new one. That is the whole "create a
 * subcategory" flow; there is no separate screen to manage them.
 */
export default function SubcategoryField({
  existing,
  defaultValue,
}: {
  /** Subcategories already used across the catalog. */
  existing: string[];
  defaultValue?: string;
}) {
  return (
    <div>
      <label htmlFor="subcategory" className="label">
        Subcategory{" "}
        <span className="font-normal text-slate-400">(optional — type a new one to create it)</span>
      </label>
      <input
        id="subcategory"
        name="subcategory"
        list="subcategory-options"
        defaultValue={defaultValue}
        placeholder="e.g. Cookware, Coffee Machines, Bedding"
        className="input"
      />
      <datalist id="subcategory-options">
        {existing.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      {existing.length > 0 && (
        <p className="mt-1 text-xs text-slate-400">
          Already in use: {existing.slice(0, 6).join(" · ")}
          {existing.length > 6 ? " …" : ""}
        </p>
      )}
    </div>
  );
}
