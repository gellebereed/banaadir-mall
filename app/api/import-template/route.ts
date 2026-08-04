/**
 * The sample import template.
 *
 * A blank template teaches nothing — a seller looks at empty headers and
 * still has to guess whether "Size" means "M" or "Medium", and whether one
 * row is a product or a colour. So this carries three real rows from a real
 * supplier file: two sizes of one shirt, and a shoe. Between them they show
 * the single most important rule of the format —
 *
 *   ONE ROW PER COLOUR + SIZE, sharing one product code.
 *
 * Required columns are marked with * and come first. The header labels are
 * exactly what the wizard's auto-detection looks for, so a file built from
 * this template maps itself with nothing to confirm.
 */

import { toCsv } from "@/lib/import/csv";
import { templateRows } from "@/lib/import/schema";

export const dynamic = "force-static";

export function GET(): Response {
  return new Response(toCsv(templateRows()), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="banaadir-product-import-template.csv"',
      "Cache-Control": "public, max-age=3600",
    },
  });
}
