import { z } from "zod"

const id = z.string().trim().min(1).max(128)

/**
 * G04: archive up to 20 selling units or variants of one Product. Archiving
 * stops future selling everywhere; saved orders, prices and stock records stay.
 * Larger or cross-Product batches and deletion stay on the forms.
 */
export const catalogArchiveAction = z
  .object({
    action: z.literal("catalog_archive"),
    catalogItemId: id,
    targets: z
      .array(
        z.discriminatedUnion("kind", [
          z.object({ kind: z.literal("offering"), offeringId: id }).strict(),
          z.object({ kind: z.literal("variant"), variantId: id }).strict(),
        ]),
      )
      .min(1, "Choose at least one selling unit or variant.")
      .max(20, "Archive at most 20 at a time; use the catalog for more.")
      .refine(
        (targets) =>
          new Set(
            targets.map((target) =>
              target.kind === "offering"
                ? `o:${target.offeringId}`
                : `v:${target.variantId}`,
            ),
          ).size === targets.length,
        "Each selling unit or variant can be listed once.",
      ),
    reason: z.string().trim().min(1).max(500),
  })
  .strict()
export type CatalogArchiveAction = z.infer<typeof catalogArchiveAction>

export function catalogArchiveSummary(action: CatalogArchiveAction) {
  const units = action.targets.filter((t) => t.kind === "offering").length
  const variants = action.targets.length - units
  return [
    `Product ${action.catalogItemId} · archive ${[
      units ? `${units} selling unit${units === 1 ? "" : "s"}` : null,
      variants ? `${variants} variant${variants === 1 ? "" : "s"}` : null,
    ]
      .filter(Boolean)
      .join(" and ")}`,
    `Reason: ${action.reason}`,
    "Stops future selling in every Store. Saved orders, prices and stock records stay.",
  ].join("\n")
}
