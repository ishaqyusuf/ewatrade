import { afterAll, beforeAll, expect, test } from "bun:test"
import type { GeneralAction } from "@ewatrade/assistant/general/contracts"
import type { GeneralTransactionContext } from "./general-actions"
import { catalogArchive } from "./general-catalog-archive"

const savedKey = process.env.ASSISTANT_APPROVAL_SIGNING_KEY
beforeAll(() => {
  process.env.ASSISTANT_APPROVAL_SIGNING_KEY = "c".repeat(32)
})
afterAll(() => {
  if (savedKey === undefined)
    Reflect.deleteProperty(process.env, "ASSISTANT_APPROVAL_SIGNING_KEY")
  else process.env.ASSISTANT_APPROVAL_SIGNING_KEY = savedKey
})

type Action = Extract<GeneralAction, { action: "catalog_archive" }>
const updated = new Date("2026-10-12T10:00:00.000Z")
const offering = (id: string, name: string, reserved = 0) => ({
  id,
  name,
  status: "ACTIVE",
  revision: 1,
  updatedAt: updated,
  _count: { stockReservations: reserved },
})
function context(
  options: {
    reserved?: number
    archived?: boolean
    fiftyKgStatus?: string
    brownUnitStatus?: string
  } = {},
) {
  const item = {
    id: "item-rice",
    name: "Rice",
    status: "ACTIVE",
    updatedAt: updated,
    variants: [
      {
        id: "var-white",
        name: "White",
        status: "ACTIVE",
        updatedAt: updated,
        offerings: [
          {
            ...offering("off-1kg", "1kg bag", options.reserved),
            status: options.archived ? "ARCHIVED" : "ACTIVE",
          },
          {
            ...offering("off-50kg", "50kg bag"),
            status: options.fiftyKgStatus ?? "ACTIVE",
          },
        ],
      },
      {
        id: "var-brown",
        name: "Brown",
        status: "ACTIVE",
        updatedAt: updated,
        offerings: [
          {
            ...offering("off-brown-5kg", "5kg bag"),
            status: options.brownUnitStatus ?? "ACTIVE",
          },
        ],
      },
    ],
  }
  const writes: string[] = []
  const db = {
    catalogItem: {
      findFirst: async (args: { where: { id: string; tenantId: string } }) =>
        args.where.id === "item-rice" && args.where.tenantId === "tenant-a"
          ? item
          : null,
    },
    sellableOffering: {
      findFirst: async (args: { where: { id: string } }) => ({
        id: args.where.id,
      }),
      update: async (args: { where: { id: string } }) => {
        writes.push(`offering:${args.where.id}`)
        return { id: args.where.id, name: args.where.id }
      },
      updateMany: async (args: { where: { variantId: string } }) => {
        writes.push(`variant-offerings:${args.where.variantId}`)
        return { count: 1 }
      },
    },
    sellableVariant: {
      findFirst: async (args: { where: { id: string } }) => ({
        id: args.where.id,
      }),
      update: async (args: { where: { id: string } }) => {
        writes.push(`variant:${args.where.id}`)
        return { id: args.where.id, name: "Brown" }
      },
    },
  }
  const ctx = {
    session: { user: { id: "manager-u" }, session: { id: "session" } },
    tenantContext: {
      tenant: { id: "tenant-a", dataClassification: "QA" },
      membership: { role: "MANAGER" },
      activeStore: { id: "store-a", name: "Wuse" },
      stores: [{ id: "store-a" }],
      staffAccess: { status: "ACTIVE", mode: "LEGACY" },
    },
    db,
  } as unknown as GeneralTransactionContext
  return { ctx, writes }
}
const draft: Action = {
  action: "catalog_archive",
  catalogItemId: "item-rice",
  targets: [{ kind: "offering", offeringId: "off-1kg" }],
  reason: "Supplier stopped this pack",
}

test("review names each target and what stays for sale", async () => {
  const { ctx } = context()
  const review = await catalogArchive.review?.(ctx, draft)
  expect(review?.lines).toEqual([
    "Rice",
    "Archive selling unit: White · 1kg bag",
    "Active selling units left afterwards: 2.",
    "Applies in every Store. Saved orders, prices, stock quantities and history stay unchanged.",
    "Reason: Supplier stopped this pack",
  ])
})

test("archiving every variant leaves no active selling units", async () => {
  const { ctx } = context()
  const review = await catalogArchive.review?.(ctx, {
    ...draft,
    targets: [
      { kind: "variant", variantId: "var-white" },
      { kind: "variant", variantId: "var-brown" },
    ],
  })
  expect(review?.lines).toContain(
    "Rice will have no active selling units left.",
  )
})

test("reserved, already archived and foreign targets refuse the draft", async () => {
  await expect(
    catalogArchive.validate(context({ reserved: 2 }).ctx, draft, false),
  ).rejects.toThrow(
    "White · 1kg bag is reserved by 2 open order line(s). Fulfil or release them first.",
  )
  await expect(
    catalogArchive.validate(context({ archived: true }).ctx, draft, false),
  ).rejects.toThrow("White · 1kg bag is already archived.")
  await expect(
    catalogArchive.validate(
      context().ctx,
      { ...draft, targets: [{ kind: "offering", offeringId: "off-other" }] },
      false,
    ),
  ).rejects.toThrow("A selling unit is not part of this Product.")
  await expect(
    catalogArchive.validate(
      context().ctx,
      { ...draft, catalogItemId: "item-other" },
      false,
    ),
  ).rejects.toThrow("Product not found.")
})

test("confirmation archives through the canonical commands and opens the Product", async () => {
  const { ctx, writes } = context()
  const receipt = await catalogArchive.execute(
    ctx,
    {
      ...draft,
      targets: [
        { kind: "offering", offeringId: "off-1kg" },
        { kind: "variant", variantId: "var-brown" },
      ],
    },
    "key",
  )
  expect(receipt).toMatchObject({
    kind: "product",
    recordId: "item-rice",
    title: "Archived from sale",
  })
  expect(writes).toEqual([
    "offering:off-1kg",
    "variant-offerings:var-brown",
    "variant:var-brown",
  ])
})

test("draft units are reported separately and never counted as active", async () => {
  const onlyDrafts = await catalogArchive.review?.(
    context({ fiftyKgStatus: "DRAFT", brownUnitStatus: "DRAFT" }).ctx,
    draft,
  )
  expect(onlyDrafts?.lines).toContain(
    "Rice will have no active selling units left.",
  )
  expect(onlyDrafts?.lines).toContain(
    "2 draft selling unit(s) also remain and are not archived by this change.",
  )
  const mixed = await catalogArchive.review?.(
    context({ fiftyKgStatus: "DRAFT" }).ctx,
    draft,
  )
  expect(mixed?.lines).toContain("Active selling units left afterwards: 1.")
  expect(mixed?.lines).toContain(
    "1 draft selling unit(s) also remain and are not archived by this change.",
  )
  // No Store availability is claimed without reading it.
  expect(mixed?.lines.join("\n")).not.toContain("availability")
})

test("a variant and one of its own units cannot be archived together", async () => {
  await expect(
    catalogArchive.validate(
      context().ctx,
      {
        ...draft,
        targets: [
          { kind: "variant", variantId: "var-white" },
          { kind: "offering", offeringId: "off-1kg" },
        ],
      },
      false,
    ),
  ).rejects.toThrow(
    "White · 1kg bag is already included in variant White; choose the variant or the unit, not both.",
  )
  // Keeping the unit means dropping it and its variant both from the draft;
  // the variant alone (without the kept unit) is then a separate decision.
})
