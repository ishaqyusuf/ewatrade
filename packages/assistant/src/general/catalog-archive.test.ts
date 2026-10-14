import { expect, test } from "bun:test"
import { capabilityForAction } from "../capabilities/manifest"
import { catalogArchiveAction } from "./catalog-archive"
import { generalActionSchema, generalActionSummary } from "./contracts"

const draft = {
  action: "catalog_archive" as const,
  catalogItemId: "item-rice",
  targets: [
    { kind: "offering" as const, offeringId: "off-1kg" },
    { kind: "variant" as const, variantId: "var-brown" },
  ],
  reason: "Supplier stopped this pack",
}

test("an archive is bounded to one Product, unique targets and a reason", () => {
  expect(generalActionSchema.safeParse(draft).success).toBe(true)
  for (const invalid of [
    { ...draft, targets: [] },
    {
      ...draft,
      targets: Array.from({ length: 21 }, (_, index) => ({
        kind: "offering",
        offeringId: `off-${index}`,
      })),
    },
    { ...draft, targets: [draft.targets[0], draft.targets[0]] },
    { ...draft, reason: " " },
    { ...draft, tenantId: "foreign" },
    { ...draft, targets: [{ kind: "product", catalogItemId: "item-rice" }] },
  ])
    expect(catalogArchiveAction.safeParse(invalid).success).toBe(false)
})

test("the summary states the scope and what stays unchanged", () => {
  expect(generalActionSummary(draft, "NGN")).toBe(
    [
      "Product item-rice · archive 1 selling unit and 1 variant",
      "Reason: Supplier stopped this pack",
      "Stops future selling in every Store. Saved orders, prices and stock records stay.",
    ].join("\n"),
  )
})

test("archiving is a planned catalog-manager capability on both clients", () => {
  expect(capabilityForAction("catalog_archive")).toMatchObject({
    id: "catalog.archive",
    rollout: "planned",
    receipt: "product",
    policy: { roles: ["OWNER", "ADMIN", "MANAGER"] },
    clients: ["dashboard", "mobile"],
    procedures: ["catalog.archiveOffering", "catalog.archiveVariant"],
  })
})
