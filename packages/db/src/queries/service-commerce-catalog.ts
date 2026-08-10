import { createHash } from "node:crypto"

import {
  getCatalogPricePromotionConfirmationImpact,
  serviceCommerceCatalogMatchProjectionSchema,
} from "@ewatrade/service-commerce"
import {
  compareExactDecimals,
  parseExactDecimal,
} from "@ewatrade/utils/exact-decimal"

import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import {
  CatalogAvailabilityAttestationType,
  CatalogItemKind,
  CatalogRecordStatus,
  CatalogReusablePriceScope,
  CatalogSourceLineType,
  CommerceQuoteSourceType,
  CommerceQuoteVersionStatus,
  MembershipRole,
  MembershipStatus,
  OfferingPricingPolicy,
  SellableOfferingKind,
  ServiceCommerceCatalogAdoptionMode,
  ServiceCommerceProfileStatus,
  ServiceWorkPolicy,
  WorkAuthorizationPolicy,
} from "../../generated/prisma/enums"
import { getConfiguredCatalogOfferingAvailability } from "./catalog-inventory"
import { assertPrescriptionStoreRole } from "./prescription-settings"
import {
  ServiceCommerceCatalogError,
  resolveServiceCommerceCatalogSourceLine,
} from "./service-commerce-catalog-source"
import { assertServiceCommercePolicyAllowedInTransaction } from "./service-commerce-policy"
import type { DbClient } from "./types"

const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const

export type CatalogSourceInput = {
  actorUserId: string
  source: { id: string; kind: "commerce_inquiry" | "prescription" | "service" }
  sourceLineId: string
  storeId: string
  tenantId: string
}

const sourceTypeToDb = {
  commerce_inquiry: CatalogSourceLineType.COMMERCE_INQUIRY,
  prescription: CatalogSourceLineType.PRESCRIPTION_REQUEST,
  service: CatalogSourceLineType.SERVICE_REQUEST,
} as const

const quoteSourceTypeByCatalogSource = {
  COMMERCE_INQUIRY: CommerceQuoteSourceType.COMMERCE_INQUIRY,
  PRESCRIPTION_REQUEST: CommerceQuoteSourceType.PRESCRIPTION_REQUEST,
  SERVICE_REQUEST: CommerceQuoteSourceType.SERVICE_REQUEST,
} as const

function stableJson(value: unknown): string {
  if (value === undefined || value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null"
  }
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`
}

function payloadHash(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex")
}

function normalizeAlias(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
}

function slugBase(value: string) {
  return (
    value
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "draft-item"
  )
}

function sourceType(input: CatalogSourceInput) {
  return sourceTypeToDb[input.source.kind]
}

function assertFingerprint(expected: string, current: string) {
  if (expected !== current) {
    throw new ServiceCommerceCatalogError(
      "CONFLICT",
      "The source line changed. Refresh before continuing.",
    )
  }
}

function translateWriteConflict(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2002" || error.code === "P2025")
  ) {
    throw new ServiceCommerceCatalogError(
      "CONFLICT",
      "Catalog adoption changed before this operation completed.",
    )
  }
  throw error
}

export async function assertProgressiveCatalogGate(
  tx: DbClient,
  input: CatalogSourceInput & {
    policySubject:
      | "price_promotion"
      | "procure_to_order"
      | "progressive_catalog"
      | "progressive_draft_capture"
    vertical: "pharmacy" | "service"
  },
) {
  const profile = await tx.serviceCommerceStoreProfile.findFirst({
    select: {
      catalogAdoptionMode: true,
      procureToOrderEnabled: true,
      progressiveCatalogEnabled: true,
      status: true,
    },
    where: { storeId: input.storeId, tenantId: input.tenantId },
  })
  if (
    !profile ||
    profile.status !== ServiceCommerceProfileStatus.ACTIVE ||
    profile.catalogAdoptionMode !==
      ServiceCommerceCatalogAdoptionMode.PROGRESSIVE ||
    !profile.progressiveCatalogEnabled ||
    (input.policySubject === "procure_to_order" &&
      !profile.procureToOrderEnabled)
  ) {
    throw new ServiceCommerceCatalogError(
      "NOT_READY",
      "Progressive Catalog is not ready for this Store.",
    )
  }
  await assertServiceCommercePolicyAllowedInTransaction(tx, {
    actorUserId: input.actorUserId,
    channel: "staff",
    purpose: `service_commerce_catalog_${input.policySubject}`,
    storeId: input.storeId,
    subject: input.policySubject,
    tenantId: input.tenantId,
    vertical: input.vertical,
  })
  return profile
}

async function createUniqueDraftSlug(
  tx: DbClient,
  tenantId: string,
  name: string,
) {
  const base = slugBase(name)
  for (let suffix = 1; suffix <= 100; suffix += 1) {
    const slug = suffix === 1 ? base : `${base}-${suffix}`
    if (
      !(await tx.catalogItem.findUnique({
        select: { id: true },
        where: { tenantId_slug: { slug, tenantId } },
      }))
    ) {
      return slug
    }
  }
  throw new ServiceCommerceCatalogError(
    "CONFLICT",
    "A unique private Catalog draft name could not be created.",
  )
}

async function loadCurrentLink(
  tx: DbClient,
  input: CatalogSourceInput & { expectedSourceFingerprint: string },
) {
  const current = await resolveServiceCommerceCatalogSourceLine(tx, {
    ...input,
    operation: "read",
  })
  assertFingerprint(input.expectedSourceFingerprint, current.ref.fingerprint)
  const link = await tx.catalogSourceLineLink.findUnique({
    include: { offering: true },
    where: {
      tenantId_storeId_sourceType_sourceId_sourceLineId: {
        sourceId: input.source.id,
        sourceLineId: input.sourceLineId,
        sourceType: sourceType(input),
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    },
  })
  if (!link) {
    throw new ServiceCommerceCatalogError(
      "NOT_FOUND",
      "Resolve this source line to a Catalog Offering first.",
    )
  }
  assertFingerprint(current.ref.fingerprint, link.sourceVersionFingerprint)
  return { current, link }
}

function matchScore(label: string, values: string[]) {
  const wanted = normalizeAlias(label)
  if (!wanted) return 0
  let score = 0
  for (const value of values) {
    const candidate = normalizeAlias(value)
    if (!candidate) continue
    if (candidate === wanted) score = Math.max(score, 1)
    else if (candidate.includes(wanted) || wanted.includes(candidate)) {
      score = Math.max(score, 0.82)
    } else {
      const wantedTokens = new Set(wanted.split(" "))
      const tokens = candidate.split(" ")
      const overlap = tokens.filter((token) => wantedTokens.has(token)).length
      score = Math.max(
        score,
        overlap / Math.max(wantedTokens.size, tokens.length, 1),
      )
    }
  }
  return Number(score.toFixed(4))
}

export async function listServiceCommerceCatalogMatches(
  db: DbClient,
  input: CatalogSourceInput,
) {
  const sourceLine = await resolveServiceCommerceCatalogSourceLine(db, {
    ...input,
    operation: "read",
  })
  await assertProgressiveCatalogGate(db, {
    ...input,
    policySubject: "progressive_catalog",
    vertical: sourceLine.vertical,
  })
  const requiredKind =
    sourceLine.kind === "product"
      ? SellableOfferingKind.PRODUCT_UNIT
      : SellableOfferingKind.SERVICE
  const offerings = await db.sellableOffering.findMany({
    include: {
      catalogVerifiedAliases: { where: { storeId: input.storeId } },
      catalogItem: true,
      storeAvailability: { where: { storeId: input.storeId } },
      variant: true,
    },
    take: 100,
    where: {
      kind: requiredKind,
      status: { in: [CatalogRecordStatus.ACTIVE, CatalogRecordStatus.DRAFT] },
      tenantId: input.tenantId,
    },
  })
  const matches = offerings
    .filter(
      (offering) =>
        offering.status === CatalogRecordStatus.DRAFT ||
        offering.storeAvailability.some(
          (availability) => availability.isAvailable,
        ),
    )
    .map((offering) => ({
      catalogItemId: offering.catalogItemId,
      catalogItemName: offering.catalogItem.name,
      currencyCode: offering.currencyCode,
      draftKind: sourceLine.kind,
      fixedPriceMinor: offering.fixedPriceMinor,
      isPrivateDraft: offering.status === CatalogRecordStatus.DRAFT,
      kind:
        offering.status === CatalogRecordStatus.DRAFT
          ? ("draft" as const)
          : ("existing" as const),
      offeringId: offering.id,
      offeringName: offering.name,
      score: matchScore(sourceLine.displayLabel, [
        offering.catalogItem.name,
        offering.variant.name,
        offering.name,
        ...offering.catalogVerifiedAliases.map((alias) => alias.displayAlias),
      ]),
      variantId: offering.variantId,
      variantName: offering.variant.name,
    }))
    .filter((match) => match.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.offeringId.localeCompare(right.offeringId),
    )
    .slice(0, 20)
    .map((match) => serviceCommerceCatalogMatchProjectionSchema.parse(match))
  return {
    draftKind: sourceLine.kind,
    matches,
    sourceLine: { ...sourceLine.ref, displayLabel: sourceLine.displayLabel },
  }
}

type LinkCommandInput = CatalogSourceInput & {
  clientOperationId: string
  expectedSourceFingerprint: string
  offeringId: string
  verifiedAlias?: string
  verifiedObservationId?: string
}

async function resolveLinkVerification(
  tx: Prisma.TransactionClient,
  input: LinkCommandInput,
  sourceLine: Awaited<
    ReturnType<typeof resolveServiceCommerceCatalogSourceLine>
  >,
) {
  if (!input.verifiedObservationId) {
    const displayAlias = input.verifiedAlias?.trim() ?? ""
    if (!normalizeAlias(displayAlias)) {
      throw new ServiceCommerceCatalogError(
        "INVALID_INPUT",
        "A verified Catalog alias or current human observation is required.",
      )
    }
    return {
      displayAlias,
      verifiedByUserId: input.actorUserId,
      verifiedObservationId: null,
    }
  }
  const observation = await tx.serviceCommerceVerifiedObservation.findFirst({
    where: {
      id: input.verifiedObservationId,
      lifecycle: "CURRENT",
      sourceLineId: input.sourceLineId,
      sourceVersion: sourceLine.ref.sourceVersion,
      storeId: input.storeId,
      tenantId: input.tenantId,
      attachment: {
        lifecycle: "ACTIVE",
        sourceId: input.source.id,
        sourceKind: quoteSourceTypeByCatalogSource[sourceType(input)],
        sourceLineId: input.sourceLineId,
        sourceVersion: sourceLine.ref.sourceVersion,
        storeId: input.storeId,
        tenantId: input.tenantId,
        mediaAsset: { lifecycle: "SAFE" },
      },
    },
  })
  if (!observation || !normalizeAlias(observation.displayLabel)) {
    throw new ServiceCommerceCatalogError(
      "NOT_READY",
      "A current human-verified observation for this safe attachment is required.",
    )
  }
  return {
    displayAlias: observation.displayLabel.trim(),
    verifiedByUserId: observation.verifiedByUserId,
    verifiedObservationId: observation.id,
  }
}

async function createSourceLink(
  tx: Prisma.TransactionClient,
  input: LinkCommandInput,
  sourceLine: Awaited<
    ReturnType<typeof resolveServiceCommerceCatalogSourceLine>
  >,
  commandPayloadHash?: string,
) {
  const hash =
    commandPayloadHash ??
    payloadHash({
      expectedSourceFingerprint: input.expectedSourceFingerprint,
      offeringId: input.offeringId,
      source: input.source,
      sourceLineId: input.sourceLineId,
      storeId: input.storeId,
      verifiedAlias: normalizeAlias(input.verifiedAlias ?? ""),
      verifiedObservationId: input.verifiedObservationId ?? null,
    })
  const previous = await tx.catalogSourceLineLink.findUnique({
    where: {
      tenantId_clientOperationId: {
        clientOperationId: input.clientOperationId,
        tenantId: input.tenantId,
      },
    },
  })
  if (previous) {
    if (previous.payloadHash !== hash) {
      throw new ServiceCommerceCatalogError(
        "IDEMPOTENCY_MISMATCH",
        "This Catalog command identity was used with different input.",
      )
    }
    return previous
  }
  const verification = await resolveLinkVerification(tx, input, sourceLine)
  const existing = await tx.catalogSourceLineLink.findUnique({
    where: {
      tenantId_storeId_sourceType_sourceId_sourceLineId: {
        sourceId: input.source.id,
        sourceLineId: input.sourceLineId,
        sourceType: sourceType(input),
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    },
  })
  if (existing) {
    throw new ServiceCommerceCatalogError(
      "CONFLICT",
      "This source line is already linked to a Catalog Offering.",
    )
  }
  const link = await tx.catalogSourceLineLink.create({
    data: {
      clientOperationId: input.clientOperationId,
      linkedByUserId: input.actorUserId,
      offeringId: input.offeringId,
      payloadHash: hash,
      sourceId: input.source.id,
      sourceLineId: input.sourceLineId,
      sourceType: sourceType(input),
      sourceVersionFingerprint: sourceLine.ref.fingerprint,
      storeId: input.storeId,
      tenantId: input.tenantId,
      verifiedLabel: verification.displayAlias,
      verifiedObservationId: verification.verifiedObservationId,
    },
  })
  const normalizedAlias = normalizeAlias(verification.displayAlias)
  if (!normalizedAlias) {
    throw new ServiceCommerceCatalogError(
      "INVALID_INPUT",
      "A verified Catalog alias is required.",
    )
  }
  await tx.catalogVerifiedAlias.upsert({
    create: {
      displayAlias: verification.displayAlias,
      normalizedAlias,
      offeringId: input.offeringId,
      sourceLinkId: link.id,
      storeId: input.storeId,
      tenantId: input.tenantId,
      verifiedByUserId: verification.verifiedByUserId,
    },
    update: { sourceLinkId: link.id },
    where: {
      tenantId_storeId_offeringId_normalizedAlias: {
        normalizedAlias,
        offeringId: input.offeringId,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    },
  })
  return link
}

export async function linkServiceCommerceCatalogOffering(
  db: PrismaClient,
  input: LinkCommandInput,
) {
  try {
    return await db.$transaction(async (tx) => {
      const sourceLine = await resolveServiceCommerceCatalogSourceLine(tx, {
        ...input,
        operation: "adopt",
      })
      assertFingerprint(
        input.expectedSourceFingerprint,
        sourceLine.ref.fingerprint,
      )
      await assertProgressiveCatalogGate(tx, {
        ...input,
        policySubject: "progressive_catalog",
        vertical: sourceLine.vertical,
      })
      const offering = await tx.sellableOffering.findFirst({
        include: {
          storeAvailability: { where: { storeId: input.storeId } },
        },
        where: {
          id: input.offeringId,
          kind:
            sourceLine.kind === "product"
              ? SellableOfferingKind.PRODUCT_UNIT
              : SellableOfferingKind.SERVICE,
          status: {
            in: [CatalogRecordStatus.ACTIVE, CatalogRecordStatus.DRAFT],
          },
          tenantId: input.tenantId,
        },
      })
      if (
        !offering ||
        (offering.status === CatalogRecordStatus.ACTIVE &&
          !offering.storeAvailability.some((item) => item.isAvailable))
      ) {
        throw new ServiceCommerceCatalogError(
          "NOT_FOUND",
          "Catalog Offering is unavailable for this Store.",
        )
      }
      return createSourceLink(tx, input, sourceLine)
    }, TRANSACTION_OPTIONS)
  } catch (error) {
    if (error instanceof ServiceCommerceCatalogError) throw error
    translateWriteConflict(error)
  }
}

export async function createServiceCommerceCatalogDraft(
  db: PrismaClient,
  input: CatalogSourceInput & {
    clientOperationId: string
    draftKind: "product" | "service"
    expectedSourceFingerprint: string
    name: string
    verifiedAlias?: string
    verifiedObservationId?: string
  },
) {
  try {
    return await db.$transaction(async (tx) => {
      const sourceLine = await resolveServiceCommerceCatalogSourceLine(tx, {
        ...input,
        operation: "adopt",
      })
      assertFingerprint(
        input.expectedSourceFingerprint,
        sourceLine.ref.fingerprint,
      )
      if (input.draftKind !== sourceLine.kind) {
        throw new ServiceCommerceCatalogError(
          "INVALID_INPUT",
          "Catalog draft kind does not match the verified source line.",
        )
      }
      await assertProgressiveCatalogGate(tx, {
        ...input,
        policySubject: "progressive_draft_capture",
        vertical: sourceLine.vertical,
      })
      const draftPayloadHash = payloadHash({
        draftKind: input.draftKind,
        expectedSourceFingerprint: input.expectedSourceFingerprint,
        name: input.name.trim(),
        source: input.source,
        sourceLineId: input.sourceLineId,
        storeId: input.storeId,
        verifiedAlias: normalizeAlias(input.verifiedAlias ?? ""),
        verifiedObservationId: input.verifiedObservationId ?? null,
      })
      const prior = await tx.catalogSourceLineLink.findUnique({
        include: { offering: true },
        where: {
          tenantId_clientOperationId: {
            clientOperationId: input.clientOperationId,
            tenantId: input.tenantId,
          },
        },
      })
      if (prior) {
        if (prior.payloadHash !== draftPayloadHash) {
          throw new ServiceCommerceCatalogError(
            "IDEMPOTENCY_MISMATCH",
            "This Catalog draft identity was used with different input.",
          )
        }
        return { link: prior, offering: prior.offering }
      }
      const name = input.name.trim()
      if (!name || name.length > 191) {
        throw new ServiceCommerceCatalogError(
          "INVALID_INPUT",
          "Catalog draft name is invalid.",
        )
      }
      const store = await tx.store.findFirst({
        select: { currencyCode: true },
        where: { id: input.storeId, tenantId: input.tenantId },
      })
      if (!store) {
        throw new ServiceCommerceCatalogError("NOT_FOUND", "Store not found.")
      }
      const item = await tx.catalogItem.create({
        data: {
          kind:
            input.draftKind === "product"
              ? CatalogItemKind.PRODUCT
              : CatalogItemKind.SERVICE,
          name,
          slug: await createUniqueDraftSlug(tx, input.tenantId, name),
          status: CatalogRecordStatus.DRAFT,
          tenantId: input.tenantId,
        },
      })
      if (input.draftKind === "product") {
        await tx.catalogProduct.create({ data: { catalogItemId: item.id } })
      } else {
        await tx.catalogService.create({ data: { catalogItemId: item.id } })
      }
      const variant = await tx.sellableVariant.create({
        data: {
          catalogItemId: item.id,
          isDefault: true,
          key: "default",
          name,
          status: CatalogRecordStatus.DRAFT,
        },
      })
      const offering = await tx.sellableOffering.create({
        data: {
          catalogItemId: item.id,
          currencyCode: store.currencyCode,
          key: "default",
          kind:
            input.draftKind === "product"
              ? SellableOfferingKind.PRODUCT_UNIT
              : SellableOfferingKind.SERVICE,
          name,
          pricingPolicy: OfferingPricingPolicy.QUOTE_REQUIRED,
          status: CatalogRecordStatus.DRAFT,
          tenantId: input.tenantId,
          variantId: variant.id,
        },
      })
      if (input.draftKind === "service") {
        await tx.serviceOffering.create({
          data: {
            authorizationPolicy: WorkAuthorizationPolicy.MANUAL_RELEASE,
            offeringId: offering.id,
            workPolicy: ServiceWorkPolicy.CHARGE_ONLY,
          },
        })
      }
      const link = await createSourceLink(
        tx,
        { ...input, offeringId: offering.id },
        sourceLine,
        draftPayloadHash,
      )
      return { link, offering }
    }, TRANSACTION_OPTIONS)
  } catch (error) {
    if (error instanceof ServiceCommerceCatalogError) throw error
    translateWriteConflict(error)
  }
}

export async function attestServiceCommerceCatalogAvailability(
  db: PrismaClient,
  input: CatalogSourceInput & {
    availability: "manual_procure_to_order" | "tracked_in_stock" | "unavailable"
    clientOperationId: string
    expectedSourceFingerprint: string
    expiresAt?: Date
    quantity?: string
    reason: string
  },
) {
  try {
    return await db.$transaction(async (tx) => {
      const { current, link } = await loadCurrentLink(tx, input)
      const policySubject =
        input.availability === "manual_procure_to_order"
          ? ("procure_to_order" as const)
          : ("progressive_catalog" as const)
      await assertProgressiveCatalogGate(tx, {
        ...input,
        policySubject,
        vertical: current.vertical,
      })
      if (
        current.vertical === "pharmacy" &&
        input.availability !== "unavailable"
      ) {
        await assertPrescriptionStoreRole(tx, {
          role: "pharmacist",
          storeId: input.storeId,
          tenantId: input.tenantId,
          userId: input.actorUserId,
        })
      }
      const quantity = input.quantity
        ? parseExactDecimal(input.quantity, { allowZero: false })
        : null
      const now = new Date()
      if (
        input.availability === "manual_procure_to_order" &&
        (!input.expiresAt || input.expiresAt <= now)
      ) {
        throw new ServiceCommerceCatalogError(
          "INVALID_INPUT",
          "Manual procure-to-order availability requires a future expiry.",
        )
      }
      if (input.availability !== "unavailable" && !quantity) {
        throw new ServiceCommerceCatalogError(
          "INVALID_INPUT",
          "Available Catalog attestations require a committed quantity.",
        )
      }
      if (
        input.availability === "tracked_in_stock" &&
        link.offering.status !== CatalogRecordStatus.ACTIVE
      ) {
        throw new ServiceCommerceCatalogError(
          "NOT_READY",
          "Tracked inventory requires an active inventory-configured Offering. Use a manual commitment or graduate the private draft first.",
        )
      }
      const hash = payloadHash({
        availability: input.availability,
        expiresAt: input.expiresAt ?? null,
        linkId: link.id,
        quantity,
        reason: input.reason.trim(),
        sourceFingerprint: current.ref.fingerprint,
      })
      const previous = await tx.catalogAvailabilityAttestation.findUnique({
        where: {
          tenantId_clientOperationId: {
            clientOperationId: input.clientOperationId,
            tenantId: input.tenantId,
          },
        },
      })
      if (previous) {
        if (previous.payloadHash !== hash) {
          throw new ServiceCommerceCatalogError(
            "IDEMPOTENCY_MISMATCH",
            "This availability command was used with different input.",
          )
        }
        return previous
      }
      let tracked:
        | Awaited<ReturnType<typeof getConfiguredCatalogOfferingAvailability>>
        | undefined
      if (input.availability === "tracked_in_stock") {
        tracked = await getConfiguredCatalogOfferingAvailability(tx, {
          offeringId: link.offeringId,
          storeId: input.storeId,
          tenantId: input.tenantId,
        })
        if (
          !quantity ||
          compareExactDecimals(tracked.availableOfferingQuantity, quantity) < 0
        ) {
          throw new ServiceCommerceCatalogError(
            "NOT_READY",
            "Tracked inventory is insufficient for the requested quantity.",
          )
        }
      }
      await tx.catalogAvailabilityAttestation.updateMany({
        data: { supersededAt: now },
        where: { sourceLinkId: link.id, supersededAt: null },
      })
      return tx.catalogAvailabilityAttestation.create({
        data: {
          attestedByUserId: input.actorUserId,
          balanceRevision: tracked?.revision,
          balanceSourceId: tracked?.balanceSourceId,
          clientOperationId: input.clientOperationId,
          configurationVersionId: tracked?.configurationVersionId,
          expiresAt:
            input.availability === "manual_procure_to_order"
              ? input.expiresAt
              : null,
          offeringId: link.offeringId,
          payloadHash: hash,
          quantity,
          reason: input.reason.trim(),
          sourceLinkId: link.id,
          sourceVersionFingerprint: current.ref.fingerprint,
          storeId: input.storeId,
          tenantId: input.tenantId,
          type:
            input.availability === "tracked_in_stock"
              ? CatalogAvailabilityAttestationType.TRACKED_IN_STOCK
              : input.availability === "manual_procure_to_order"
                ? CatalogAvailabilityAttestationType.MANUAL_PROCURE_TO_ORDER
                : CatalogAvailabilityAttestationType.UNAVAILABLE,
        },
      })
    }, TRANSACTION_OPTIONS)
  } catch (error) {
    if (error instanceof ServiceCommerceCatalogError) throw error
    translateWriteConflict(error)
  }
}

export async function getServiceCommerceCatalogPricePromotionImpact(
  db: DbClient,
  input: CatalogSourceInput & {
    expectedSourceFingerprint: string
  } & (
      | { quoteId: string; quoteVersionId?: never }
      | {
          quoteId?: never
          quoteVersionId: string
        }
    ),
) {
  const { current, link } = await loadCurrentLink(db, input)
  await assertProgressiveCatalogGate(db, {
    ...input,
    policySubject: "price_promotion",
    vertical: current.vertical,
  })
  const [quoteVersion, availabilityStores, linkedStores] = await Promise.all([
    db.commerceQuoteVersion.findFirst({
      include: {
        lines: {
          where: {
            offeringId: link.offeringId,
            sourceLineId: input.sourceLineId,
          },
        },
        quote: true,
      },
      where: {
        ...(input.quoteVersionId
          ? { id: input.quoteVersionId }
          : { quoteId: input.quoteId }),
        quote: {
          ...(input.quoteId ? { id: input.quoteId } : {}),
          sourceId: input.source.id,
          sourceType: quoteSourceTypeByCatalogSource[link.sourceType],
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
        status: {
          in: [
            CommerceQuoteVersionStatus.ISSUED,
            CommerceQuoteVersionStatus.ACCEPTED,
          ],
        },
      },
    }),
    db.storeOfferingAvailability.findMany({
      include: { store: { select: { id: true, name: true } } },
      where: {
        offeringId: link.offeringId,
        store: { tenantId: input.tenantId },
      },
    }),
    db.catalogSourceLineLink.findMany({
      include: { store: { select: { id: true, name: true } } },
      where: { offeringId: link.offeringId, tenantId: input.tenantId },
    }),
  ])
  const line = quoteVersion?.lines[0]
  if (!quoteVersion || !line || line.unitPriceMinor === null) {
    throw new ServiceCommerceCatalogError(
      "NOT_READY",
      "An issued immutable Quote price is required for promotion.",
    )
  }
  const stores = new Map<string, string>()
  for (const item of availabilityStores)
    stores.set(item.store.id, item.store.name)
  for (const item of linkedStores) stores.set(item.store.id, item.store.name)
  if (!stores.has(input.storeId)) {
    const currentStore = await db.store.findFirst({
      select: { id: true, name: true },
      where: { id: input.storeId, tenantId: input.tenantId },
    })
    if (currentStore) stores.set(currentStore.id, currentStore.name)
  }
  const impact = getCatalogPricePromotionConfirmationImpact({
    boundStoreIds: [...stores.keys()],
    offeringPriceScope: "tenant",
  })
  return {
    affectedStores: impact.affectedStoreIds.map((id) => ({
      id,
      name: stores.get(id) ?? "Store",
    })),
    currencyCode: quoteVersion.currencyCode,
    currentPriceMinor: link.offering.fixedPriceMinor,
    offeringId: link.offeringId,
    quotePriceMinor: line.unitPriceMinor,
    quoteVersionId: quoteVersion.id,
    requiresConfirmation: impact.requiresConfirmation,
    sourceLine: { ...current.ref, displayLabel: current.displayLabel },
  }
}

export async function promoteServiceCommerceCatalogPrice(
  db: PrismaClient,
  input: CatalogSourceInput & {
    affectedStoreIds: string[]
    clientOperationId: string
    expectedPreviousPriceMinor: number | null
    expectedSourceFingerprint: string
    priceMinor: number
    quoteVersionId: string
    reason: string
  },
) {
  try {
    return await db.$transaction(async (tx) => {
      const manager = await tx.membership.findFirst({
        select: { id: true },
        where: {
          role: {
            in: [
              MembershipRole.OWNER,
              MembershipRole.ADMIN,
              MembershipRole.MANAGER,
            ],
          },
          status: MembershipStatus.ACTIVE,
          tenantId: input.tenantId,
          userId: input.actorUserId,
        },
      })
      if (!manager) {
        throw new ServiceCommerceCatalogError(
          "FORBIDDEN",
          "Active sales-management authority is required to promote a reusable price.",
        )
      }
      const impact = await getServiceCommerceCatalogPricePromotionImpact(
        tx,
        input,
      )
      const expectedStores = impact.affectedStores
        .map((store) => store.id)
        .sort()
      const receivedStores = [...new Set(input.affectedStoreIds)].sort()
      if (
        expectedStores.length !== receivedStores.length ||
        expectedStores.some((id, index) => id !== receivedStores[index])
      ) {
        throw new ServiceCommerceCatalogError(
          "CONFLICT",
          "The affected Store scope changed. Review the confirmation again.",
        )
      }
      if (
        impact.currentPriceMinor !== input.expectedPreviousPriceMinor ||
        impact.quotePriceMinor !== input.priceMinor
      ) {
        throw new ServiceCommerceCatalogError(
          "CONFLICT",
          "The reusable or Quote price changed before confirmation.",
        )
      }
      const { link } = await loadCurrentLink(tx, input)
      const hash = payloadHash({
        affectedStoreIds: receivedStores,
        expectedPreviousPriceMinor: input.expectedPreviousPriceMinor,
        linkId: link.id,
        priceMinor: input.priceMinor,
        quoteVersionId: input.quoteVersionId,
        reason: input.reason.trim(),
      })
      const previous = await tx.catalogPricePromotion.findUnique({
        include: { priceChange: true },
        where: {
          tenantId_clientOperationId: {
            clientOperationId: input.clientOperationId,
            tenantId: input.tenantId,
          },
        },
      })
      if (previous) {
        if (previous.payloadHash !== hash) {
          throw new ServiceCommerceCatalogError(
            "IDEMPOTENCY_MISMATCH",
            "This price promotion identity was used with different input.",
          )
        }
        return previous
      }
      if (!Number.isSafeInteger(input.priceMinor) || input.priceMinor < 0) {
        throw new ServiceCommerceCatalogError(
          "INVALID_INPUT",
          "Reusable Catalog price is invalid.",
        )
      }
      if (input.reason.trim().length < 3 || input.reason.trim().length > 240) {
        throw new ServiceCommerceCatalogError(
          "INVALID_INPUT",
          "A price-change reason is required.",
        )
      }
      const changed = await tx.sellableOffering.updateMany({
        data: {
          fixedPriceMinor: input.priceMinor,
          pricingPolicy: OfferingPricingPolicy.FIXED,
        },
        where: {
          fixedPriceMinor: input.expectedPreviousPriceMinor,
          id: link.offeringId,
          tenantId: input.tenantId,
        },
      })
      if (changed.count !== 1) {
        throw new ServiceCommerceCatalogError(
          "CONFLICT",
          "The Offering price changed before confirmation.",
        )
      }
      const priceChange = await tx.catalogPriceChange.create({
        data: {
          changedByUserId: input.actorUserId,
          currencyCode: impact.currencyCode,
          offeringId: link.offeringId,
          previousPriceMinor: input.expectedPreviousPriceMinor,
          priceMinor: input.priceMinor,
          reason: input.reason.trim(),
          tenantId: input.tenantId,
        },
      })
      return tx.catalogPricePromotion.create({
        data: {
          affectedStoreIds: receivedStores,
          clientOperationId: input.clientOperationId,
          currencyCode: impact.currencyCode,
          offeringId: link.offeringId,
          payloadHash: hash,
          previousPriceMinor: input.expectedPreviousPriceMinor,
          priceChangeId: priceChange.id,
          priceMinor: input.priceMinor,
          promotedByUserId: input.actorUserId,
          quoteVersionId: input.quoteVersionId,
          reason: input.reason.trim(),
          scope: CatalogReusablePriceScope.TENANT,
          sourceLinkId: link.id,
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
      })
    }, TRANSACTION_OPTIONS)
  } catch (error) {
    if (error instanceof ServiceCommerceCatalogError) throw error
    translateWriteConflict(error)
  }
}

export async function resolveCatalogAvailabilityAttestationForQuote(
  db: DbClient,
  input: CatalogSourceInput & {
    attestationId: string
    offeringId: string
    quantity: string
  },
) {
  const current = await resolveServiceCommerceCatalogSourceLine(db, {
    ...input,
    operation: "quote",
  })
  const attestation = await db.catalogAvailabilityAttestation.findFirst({
    include: { sourceLink: true },
    where: {
      id: input.attestationId,
      offeringId: input.offeringId,
      sourceLink: {
        sourceId: input.source.id,
        sourceLineId: input.sourceLineId,
        sourceType: sourceType(input),
      },
      storeId: input.storeId,
      supersededAt: null,
      tenantId: input.tenantId,
    },
  })
  if (
    !attestation ||
    attestation.sourceVersionFingerprint !== current.ref.fingerprint ||
    (attestation.expiresAt && attestation.expiresAt <= new Date()) ||
    attestation.type === CatalogAvailabilityAttestationType.UNAVAILABLE
  ) {
    throw new ServiceCommerceCatalogError(
      "NOT_READY",
      "Catalog availability is stale, expired, or unavailable.",
    )
  }
  let quoteQuantity: string
  try {
    quoteQuantity = parseExactDecimal(input.quantity, { allowZero: false })
  } catch {
    throw new ServiceCommerceCatalogError(
      "INVALID_INPUT",
      "Quoted availability quantity is invalid.",
    )
  }
  if (
    !attestation.quantity ||
    compareExactDecimals(attestation.quantity.toString(), quoteQuantity) < 0
  ) {
    throw new ServiceCommerceCatalogError(
      "NOT_READY",
      "Quoted quantity exceeds the current availability commitment.",
    )
  }
  if (
    attestation.type === CatalogAvailabilityAttestationType.TRACKED_IN_STOCK
  ) {
    const tracked = await getConfiguredCatalogOfferingAvailability(db, {
      offeringId: input.offeringId,
      storeId: input.storeId,
      tenantId: input.tenantId,
    })
    if (
      tracked.balanceSourceId !== attestation.balanceSourceId ||
      tracked.configurationVersionId !== attestation.configurationVersionId ||
      tracked.revision !== attestation.balanceRevision
    ) {
      throw new ServiceCommerceCatalogError(
        "CONFLICT",
        "Tracked inventory changed after availability was attested.",
      )
    }
  }
  return attestation
}

export async function resolveCatalogSourceLinkForQuote(
  db: DbClient,
  input: CatalogSourceInput & {
    offeringId: string
  },
) {
  const current = await resolveServiceCommerceCatalogSourceLine(db, {
    ...input,
    operation: "quote",
  })
  const link = await db.catalogSourceLineLink.findFirst({
    where: {
      offeringId: input.offeringId,
      sourceId: input.source.id,
      sourceLineId: input.sourceLineId,
      sourceType: sourceType(input),
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
  if (!link || link.sourceVersionFingerprint !== current.ref.fingerprint) {
    throw new ServiceCommerceCatalogError(
      "CONFLICT",
      "The Catalog source link is missing or stale.",
    )
  }
  return link
}
