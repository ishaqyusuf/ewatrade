import type { Prisma } from "../../generated/prisma/client"
import { lockCatalogCommandInTransaction } from "./catalog-command-locks"
import { CatalogError } from "./catalog-errors"
import {
  type UpdateCatalogItemInput,
  updateCatalogItemInTransaction,
} from "./catalog-item-update"
import { catalogItemGraph, serializeCatalogItem } from "./catalog-read"

type SavedItem = ReturnType<typeof serializeCatalogItem>
type ChoiceItem = Pick<
  SavedItem,
  | "id"
  | "kind"
  | "status"
  | "name"
  | "description"
  | "category"
  | "categoryId"
  | "subcategoryId"
  | "updatedAt"
  | "optionGroups"
  | "variants"
>
export type AddServiceChoiceInput = Pick<
  UpdateCatalogItemInput,
  "tenantId" | "storeId" | "actorUserId" | "clientOperationId"
> & {
  itemId: string
  name: string
  priceMinor: number
}
const key = (text: string) =>
  text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ")

/** Append exactly one choice. Never fill the rest of an option matrix or replace a saved price. */
export function planServiceChoice(
  item: ChoiceItem,
  input: Pick<AddServiceChoiceInput, "name" | "priceMinor" | "storeId">,
) {
  if (item.kind !== "service" || item.status !== "active")
    throw new CatalogError("INVALID_CATALOG_ITEM", "Choose an active Service.")
  if (!Number.isSafeInteger(input.priceMinor) || input.priceMinor < 0)
    throw new CatalogError(
      "INVALID_OFFERING",
      "Enter a valid price for this choice.",
    )
  const parts = input.name
    .split(/\s*[·/]\s*/)
    .map((part) => part.trim())
    .filter(Boolean)
  const groups = item.optionGroups.map((group) => ({
    id: group.id,
    name: group.name,
    values: group.values.map((value) => value.label),
  }))
  // A simple Service becomes two explicit choices; the original remains the default.
  if (!groups.length)
    groups.push({ id: "", name: "Option", values: [item.name] })
  const remaining = groups.length === 1 ? [input.name.trim()] : [...parts]
  const selections: Array<string | undefined> = groups.map((group) => {
    const index = remaining.findIndex((part) =>
      group.values.some((value) => key(value) === key(part)),
    )
    if (index < 0) return undefined
    const part = remaining.splice(index, 1)[0]
    return group.values.find((value) => key(value) === key(part ?? ""))
  })
  const unknown = selections.flatMap((selection, index) =>
    selection === undefined ? [index] : [],
  )
  if (
    !(unknown.length === 0 && remaining.length === 0) &&
    (unknown.length !== 1 ||
      !remaining.length ||
      (groups.length > 1 && remaining.length !== 1))
  )
    throw new CatalogError(
      "INVALID_CATALOG_ITEM",
      "This choice needs more option details. Add it from the Service's options.",
    )
  if (unknown.length) {
    const index = unknown[0] ?? 0
    const label = remaining.join(" · ")
    if (label.length > 80 || !label)
      throw new CatalogError(
        "INVALID_CATALOG_ITEM",
        "Keep each option value within 80 characters.",
      )
    const target = groups[index]
    if (!target)
      throw new CatalogError("INVALID_CATALOG_ITEM", "Choose an option group.")
    const existingLabel = target.values.find(
      (value) => key(value) === key(label),
    )
    selections[index] = existingLabel ?? label
    if (!existingLabel) target.values.push(label)
  }
  const labels = selections.map((value) => value ?? "")
  const labelById = new Map(
    item.optionGroups.flatMap((group) =>
      group.values.map((value) => [value.id, value.label]),
    ),
  )
  const savedLabels = (variant: ChoiceItem["variants"][number]) =>
    item.optionGroups.length
      ? item.optionGroups.map(
          (group) =>
            labelById.get(
              variant.selections.find(
                (selection) => selection.groupId === group.id,
              )?.valueId ?? "",
            ) ?? "",
        )
      : [item.name]
  const matching = item.variants.filter((variant) =>
    savedLabels(variant).every(
      (value, i) => key(value) === key(labels[i] ?? ""),
    ),
  )
  const same =
    matching.find((variant) => variant.status === "active") ?? matching[0]
  if (same) {
    const offering = same.offerings.find(
      (offering) => offering.status === "active" && offering.kind === "service",
    )
    if (
      same.status !== "active" ||
      !offering ||
      offering.pricingPolicy !== "fixed" ||
      offering.fixedPriceMinor !== input.priceMinor ||
      !offering.stores.some(
        (store) => store.storeId === input.storeId && store.isAvailable,
      )
    )
      throw new CatalogError(
        "INVALID_OFFERING",
        "This choice already exists with different pricing or availability. Review it in the Catalog.",
      )
    return { existingOfferingId: offering.id, selections: labels }
  }
  const live = item.variants.filter((variant) => variant.status !== "archived")
  const template = live
    .find((variant) => variant.isDefault)
    ?.offerings.find(
      (offering) => offering.status === "active" && offering.kind === "service",
    )
  if (!template?.serviceWorkPolicy || live.length >= 96)
    throw new CatalogError(
      "INVALID_CATALOG_ITEM",
      "Review this Service's options in the Catalog before adding another choice.",
    )
  const offeringInput = (
    offering: ChoiceItem["variants"][number]["offerings"][number],
  ) => ({
    pricingPolicy: offering.pricingPolicy,
    ...(offering.fixedPriceMinor !== null
      ? { fixedPriceMinor: offering.fixedPriceMinor }
      : {}),
    enabled: offering.status === "active",
    storeAvailability: offering.stores.length
      ? offering.stores
      : [{ storeId: input.storeId, isAvailable: false }],
    workPolicy:
      offering.serviceWorkPolicy?.workPolicy === "TRACKED"
        ? ("tracked" as const)
        : ("charge_only" as const),
    authorizationPolicy:
      offering.serviceWorkPolicy?.authorizationPolicy ===
      "AFTER_REQUIRED_PAYMENT"
        ? ("after_required_payment" as const)
        : offering.serviceWorkPolicy?.authorizationPolicy === "MANUAL_RELEASE"
          ? ("manual_release" as const)
          : ("on_order_confirmation" as const),
    quantityScale: offering.serviceWorkPolicy?.quantityScale,
    guidance: offering.serviceWorkPolicy?.guidance ?? undefined,
  })
  const update: Omit<
    UpdateCatalogItemInput,
    "tenantId" | "storeId" | "actorUserId" | "clientOperationId"
  > = {
    itemId: item.id,
    expectedUpdatedAt: new Date(item.updatedAt),
    kind: "service",
    name: item.name,
    description: item.description ?? undefined,
    category: item.category ?? undefined,
    categoryId: item.categoryId ?? undefined,
    subcategoryId: item.subcategoryId ?? undefined,
    optionGroups: groups.map((group) => ({
      ...group,
      id: group.id || undefined,
    })),
    variants: [
      ...live.map((variant) => ({
        selections: savedLabels(variant),
        enabled: variant.status === "active",
        isDefault: variant.isDefault,
        offerings: variant.offerings
          .filter((offering) => offering.status !== "archived")
          .map(offeringInput),
      })),
      {
        selections: labels,
        enabled: true,
        isDefault: false,
        offerings: [
          {
            ...offeringInput(template),
            pricingPolicy: "fixed",
            fixedPriceMinor: input.priceMinor,
            enabled: true,
            storeAvailability: [{ storeId: input.storeId, isAvailable: true }],
          },
        ],
      },
    ],
    priceChangeReason: "Added Service choice",
  }
  return { update, selections: labels }
}

/** Fresh item lock serializes retries and concurrent additions before the canonical Catalog command. */
export async function addServiceChoiceInTransaction(
  tx: Prisma.TransactionClient,
  input: AddServiceChoiceInput,
) {
  await lockCatalogCommandInTransaction(tx, input)
  await tx.$queryRaw`SELECT id FROM "CatalogItem" WHERE id = ${input.itemId} AND "tenantId" = ${input.tenantId} FOR UPDATE`
  const record = await tx.catalogItem.findFirst({
    where: { id: input.itemId, tenantId: input.tenantId, systemRole: null },
    include: catalogItemGraph,
  })
  if (!record)
    throw new CatalogError(
      "CATALOG_ITEM_NOT_FOUND",
      "Service not found for this business.",
    )
  const item = serializeCatalogItem(record)
  const plan = planServiceChoice(item, input)
  if (plan.existingOfferingId)
    return {
      offeringId: plan.existingOfferingId,
      itemId: item.id,
      itemName: item.name,
      alreadyExists: true,
    }
  if (!plan.update)
    throw new CatalogError(
      "INVALID_CATALOG_ITEM",
      "This choice could not be added.",
    )
  const saved = await updateCatalogItemInTransaction(tx, {
    ...plan.update,
    tenantId: input.tenantId,
    storeId: input.storeId,
    actorUserId: input.actorUserId,
    clientOperationId: input.clientOperationId,
  })
  const values = new Map(
    saved.optionGroups.flatMap((group) =>
      group.values.map((value) => [value.id, value.label]),
    ),
  )
  const variant = saved.variants.find(
    (variant) =>
      variant.status === "active" &&
      saved.optionGroups.every(
        (group, index) =>
          key(
            values.get(
              variant.selections.find(
                (selection) => selection.groupId === group.id,
              )?.valueId ?? "",
            ) ?? "",
          ) === key(plan.selections[index] ?? ""),
      ),
  )
  const offering = variant?.offerings.find(
    (offering) => offering.status === "active",
  )
  if (!offering)
    throw new CatalogError(
      "INVALID_OFFERING",
      "The added Service choice could not be resolved.",
    )
  return {
    offeringId: offering.id,
    itemId: saved.id,
    itemName: saved.name,
    alreadyExists: false,
  }
}
