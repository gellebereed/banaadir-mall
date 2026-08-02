"use client";

import { useState } from "react";
import { checkBarcode, checkReference, suggestReference } from "@/lib/barcode";

/**
 * Internal reference + barcode, the two fields Odoo keys a product on.
 *
 * Both are validated as the seller types rather than on submit. A barcode
 * with a bad check digit is always a typo, and catching it here — while the
 * box is still in their hand to re-scan — is the difference between a
 * correction and a stock discrepancy nobody notices for a month.
 *
 * The server re-runs exactly the same checks (lib/barcode.ts is shared), so
 * this is a convenience, never the guarantee.
 */
export default function ProductCodesFields({
  storeSlug,
  defaultReference = "",
  defaultBarcode = "",
  defaultUom = "Units",
  /** Used to offer a starting reference on the new-product form. */
  productNameFieldId,
}: {
  storeSlug: string;
  defaultReference?: string;
  defaultBarcode?: string;
  defaultUom?: string;
  productNameFieldId?: string;
}) {
  const [reference, setReference] = useState(defaultReference);
  const [barcode, setBarcode] = useState(defaultBarcode);

  const referenceCheck = checkReference(reference);
  const barcodeCheck = checkBarcode(barcode);

  /** Fill in a sensible reference from the product name already typed. */
  function fillSuggestion() {
    const nameInput = productNameFieldId
      ? (document.getElementById(productNameFieldId) as HTMLInputElement | null)
      : null;
    const name = nameInput?.value?.trim();
    if (!name) return;
    setReference(suggestReference(storeSlug, name));
  }

  return (
    <>
      <div>
        <div className="mb-1 flex items-center justify-between gap-2">
          <label htmlFor="internalReference" className="label mb-0">
            Internal reference{" "}
            <span className="font-normal text-slate-400">(your product code)</span>
          </label>
          {productNameFieldId && !reference && (
            <button
              type="button"
              onClick={fillSuggestion}
              className="text-xs font-semibold text-ocean-700 hover:underline"
            >
              Suggest one
            </button>
          )}
        </div>
        <input
          id="internalReference"
          name="internalReference"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="e.g. KRC-TENC-24"
          maxLength={64}
          spellCheck={false}
          autoCapitalize="characters"
          className={`input font-mono uppercase ${
            reference && !referenceCheck.valid ? "!border-coral-500" : ""
          }`}
        />
        {reference && !referenceCheck.valid ? (
          <p className="mt-1 text-xs font-semibold text-coral-600">{referenceCheck.error}</p>
        ) : (
          <p className="mt-1 text-xs text-slate-400">
            The code on your price tags and purchase orders. Must be unique
            across the marketplace.
          </p>
        )}
      </div>

      <div>
        <label htmlFor="barcode" className="label">
          Barcode <span className="font-normal text-slate-400">(EAN / UPC — scannable)</span>
        </label>
        <input
          id="barcode"
          name="barcode"
          value={barcode}
          onChange={(e) => setBarcode(e.target.value)}
          placeholder="e.g. 8691106123456"
          inputMode="text"
          maxLength={64}
          spellCheck={false}
          className={`input font-mono ${
            barcode && !barcodeCheck.valid ? "!border-coral-500" : ""
          }`}
        />

        {barcode && !barcodeCheck.valid && (
          <p className="mt-1 text-xs font-semibold text-coral-600">
            {barcodeCheck.error}
            {barcodeCheck.suggestion && (
              <>
                {" "}
                <button
                  type="button"
                  onClick={() => setBarcode(barcodeCheck.suggestion!)}
                  className="underline"
                >
                  Use {barcodeCheck.suggestion}
                </button>
              </>
            )}
          </p>
        )}

        {barcode && barcodeCheck.valid && barcodeCheck.warning && (
          <p className="mt-1 text-xs text-mango-700">⚠ {barcodeCheck.warning}</p>
        )}

        {barcode && barcodeCheck.valid && !barcodeCheck.warning && (
          <p className="mt-1 text-xs font-semibold text-emerald-600">
            ✓ Valid {barcodeCheck.symbology} barcode
          </p>
        )}

        {!barcode && (
          <p className="mt-1 text-xs text-slate-400">
            Scan the code on the packaging, or leave empty. Products with
            variants can give each colour or size its own barcode below.
          </p>
        )}
      </div>

      <div>
        <label htmlFor="uom" className="label">
          Unit of measure
        </label>
        <select id="uom" name="uom" defaultValue={defaultUom} className="input">
          {["Units", "Pack", "Box", "Pair", "Set", "kg", "g", "Litre", "Metre"].map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-slate-400">
          How one sellable item is counted. Sent to Odoo as the product&apos;s
          unit of measure.
        </p>
      </div>
    </>
  );
}
