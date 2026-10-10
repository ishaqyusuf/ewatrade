import { stockOwnerInclude as ownerInclude } from "./inventory-stock-owner-include"
import { Prisma } from "../../../generated/prisma/client"
import type { FinanceActor } from "./access"
import { assertSavedStockCountSource } from "./inventory-count-source"
import { resolveInventoryOpeningSourceInTransaction } from "./inventory-opening-source"
import {
  assertSavedOrdinaryStockSource,
  resolveLoadedOrdinaryStockSource,
} from "./inventory-ordinary-source"
import { resolveLoadedInventoryRelocationSource } from "./inventory-relocation-source"
import { assertSavedReservationCommitSource } from "./inventory-reservation-source"
import type { ReviewedMovementSemantics } from "./reviewed-cost-assembly"
import type { ReviewedCostBookContext } from "./reviewed-cost-book-context"
import { readReviewedCostCloseoutSources } from "./reviewed-cost-closeout-sources"
import { readReviewedCostCountSources } from "./reviewed-cost-count-sources"
import type { discoverReviewedCostSourcesInTransaction } from "./reviewed-cost-discovery"
import { proveReviewedOrdinaryCorrectionSources } from "./reviewed-cost-ordinary-correction-sources"
import { resolveReviewedCostPurchaseSourcesInTransaction } from "./reviewed-cost-purchase"
import { readReviewedCostReservationSources } from "./reviewed-cost-reservation-sources"
import type { readReviewedCostReturnsInTransaction } from "./reviewed-cost-returns"
import {
  type ReviewedShortagePostingCandidate,
  captureReviewedShortageCandidates,
} from "./reviewed-cost-shortage-postings"
import { readReviewedCostStockGraphs } from "./reviewed-cost-stock-graphs"
import { proveReviewedCostTransformationSources } from "./reviewed-cost-transformation-sources"
import { FinanceError, financePayloadHash } from "./rules"
import { assertSavedInventoryCloseoutSource } from "./valuation-closeouts"
import { assertSavedInventoryOpeningSource } from "./valuation-openings"
import { assertSavedInventoryRelocationSource } from "./valuation-relocations"

type Discovery = Awaited<
  ReturnType<typeof discoverReviewedCostSourcesInTransaction>
>
type Returns = Awaited<ReturnType<typeof readReviewedCostReturnsInTransaction>>
export type ReviewedOwnerBlocker = {
  code: "SOURCE_CORRECTION" | "SOURCE_CONTRACT_PENDING" | "PRIOR_REVIEW_PENDING"
  sourceId: string
}

type Owner = Prisma.StockOperationGetPayload<{ include: typeof ownerInclude }>
export type ReviewedCostOwner = Owner
type Event =
  Prisma.FinanceInventoryValuationEventGetPayload<Prisma.FinanceInventoryValuationEventDefaultArgs>

function conflict(message: string): never {
  throw new FinanceError("CONFLICT", message)
}

/** Plain, normalized retained facts, including original value state and owner docs. */
function facts(value: unknown): Prisma.JsonValue {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === "bigint") return value.toString()
  if (Prisma.Decimal.isDecimal(value)) return value.toFixed()
  if (Array.isArray(value)) {
    const values = value.map(facts)
    if (
      values.every(
        (item) =>
          item &&
          typeof item === "object" &&
          !Array.isArray(item) &&
          typeof item.id === "string",
      )
    )
      values.sort((a, b) =>
        String((a as Prisma.JsonObject).id).localeCompare(
          String((b as Prisma.JsonObject).id),
        ),
      )
    return values
  }
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, facts(item)]),
    )
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  )
    return value
  conflict("Original owning source contains unsupported snapshot facts.")
}

/** Candidate owners are selected from actual typed relations, never signed effects. */
export async function readReviewedCostOwningSourcesInTransaction(
  tx: Prisma.TransactionClient,
  input: FinanceActor & { bookId: string; through: Date },
  discovery: Discovery,
  returns: Returns,
  context?: ReviewedCostBookContext,
) {
  const owners = await tx.stockOperation.findMany({
    where: { id: { in: discovery.operationIds } },
    include: ownerInclude,
    orderBy: { id: "asc" },
    take: 4097,
  })
  if (
    owners.length !== discovery.operationIds.length ||
    owners.length > 4096 ||
    owners.some(
      (op) =>
        op.tenantId !== discovery.tenantId ||
        op.store.tenantId !== discovery.tenantId ||
        op.store.currencyCode !== discovery.currencyCode ||
        op.store.id !== op.storeId ||
        !Number.isFinite(op.effectiveAt.getTime()) ||
        op.effectiveAt > input.through,
    )
  )
    conflict(
      "Complete original operations differ from the discovered Book scope.",
    )
  if (owners.reduce((count, op) => count + op._count.movements, 0) > 4096)
    conflict("Complete owning movements exceed the supported connected bound.")
  const movements = await tx.stockMovement.findMany({
    where: { operationId: { in: discovery.operationIds } },
    include: {
      valuationEvent: true,
      purchaseReceipt: { select: { id: true } },
    },
    orderBy: { id: "asc" },
    take: 4097,
  })
  if (
    financePayloadHash(movements.map((row) => row.id).sort()) !==
      financePayloadHash([...discovery.movementIds].sort()) ||
    owners.some(
      (op) =>
        movements.filter((row) => row.operationId === op.id).length !==
        op._count.movements,
    )
  )
    conflict(
      "Owning source movements differ from the complete discovered history.",
    )

  const semantics: ReviewedMovementSemantics[] = []
  const sourceFacts: Prisma.JsonValue[] = []
  const blockers: ReviewedOwnerBlocker[] = discovery.reviewAllocationIds.map(
    (sourceId) => ({ code: "PRIOR_REVIEW_PENDING", sourceId }),
  )
  const openingReceipts = new Set<string>()
  const proved = new Set<string>()
  // Hydrate all original relocation stages in one bounded query, then reuse pure proof.
  const relocationOwners = owners
    .filter((op) =>
      ["TRANSFER", "CUSTODY_ASSIGNMENT", "CUSTODY_RETURN"].includes(op.type),
    )
    .filter((op) => !op.correctionOfOperationId && op._count.corrections === 0)
  for (const op of relocationOwners) {
    competing(op, [
      "dispatchedTransfers",
      "receivedTransfers",
      "cancelledTransfers",
    ])
    const stages = Math.max(
      op._count.dispatchedTransfers +
        op._count.receivedTransfers +
        op._count.cancelledTransfers,
      op.transferAcknowledgment ? 1 : 0,
    )
    if (
      op._count.movements !== 2 ||
      stages !== (op.type === "TRANSFER" ? 1 : 0)
    )
      conflict(
        "Original relocation has an ambiguous or incomplete owning stage.",
      )
  }
  const transformationOwners = owners.filter(
    (op) =>
      op.type === "TRANSFORMATION" &&
      !op.correctionOfOperationId &&
      op._count.corrections === 0,
  )
  for (const op of transformationOwners) {
    competing(op, [])
    if (op._count.movements !== 2)
      conflict("Original transformation requires two complete movements.")
  }
  const eligibleOrdinary = (op: Owner) =>
    ["RECEIPT", "RETURN", "ADJUSTMENT"].includes(op.type) &&
    !op.correctionOfOperationId &&
    op.committedReservation === null &&
    Object.entries(op._count).every(
      ([kind, count]) =>
        kind === "movements" || kind === "corrections" || count === 0,
    )
  const ordinaryCorrectionOwners = owners.filter(
    (op) =>
      op.type === "CORRECTION" &&
      op.correctionOfOperationId &&
      owners.some(
        (original) =>
          original.id === op.correctionOfOperationId &&
          eligibleOrdinary(original),
      ),
  )
  const correctedOrdinaryOwners = owners.filter((op) =>
    ordinaryCorrectionOwners.some((c) => c.correctionOfOperationId === op.id),
  )
  const ordinaryOwners = owners.filter(
    (op) =>
      ["RECEIPT", "RETURN", "ADJUSTMENT"].includes(op.type) &&
      !op.correctionOfOperationId &&
      op._count.corrections === 0 &&
      op.committedReservation === null &&
      Object.entries(op._count).every(
        ([kind, count]) => kind === "movements" || count === 0,
      ),
  )
  const countOwners = owners.filter(
    (op) =>
      op._count.finalizedCounts > 0 &&
      !op.correctionOfOperationId &&
      op._count.corrections === 0,
  )
  for (const op of countOwners) {
    competing(op, ["finalizedCounts"])
    if (op._count.finalizedCounts !== 1)
      conflict("Original Stock Count owner is ambiguous.")
  }
  const closeoutOwners = owners.filter(
    (op) =>
      op._count.finalizedCloseouts > 0 &&
      !op.correctionOfOperationId &&
      op._count.corrections === 0,
  )
  for (const op of closeoutOwners) {
    competing(op, ["finalizedCloseouts"])
    if (op._count.finalizedCloseouts !== 1)
      conflict("Original Closeout owner is ambiguous.")
  }
  const reservationOwners = owners.filter(
    (op) =>
      op.type === "RESERVATION_COMMIT" &&
      op.committedReservation?.commercialOrderLineId === null &&
      !op.correctionOfOperationId &&
      op._count.corrections === 0,
  )
  for (const op of reservationOwners) competing(op, [], true)
  const stockGraphs = await readReviewedCostStockGraphs(tx, {
    owners: [
      ...relocationOwners,
      ...ordinaryOwners,
      ...countOwners,
      ...closeoutOwners,
      ...reservationOwners,
      ...transformationOwners,
      ...ordinaryCorrectionOwners,
      ...correctedOrdinaryOwners,
    ],
    balanceSourceIds: discovery.balanceSourceIds,
    transferIds: discovery.transferIds,
  })
  if (
    stockGraphs.length !==
    relocationOwners.length +
      ordinaryOwners.length +
      countOwners.length +
      closeoutOwners.length +
      reservationOwners.length +
      transformationOwners.length +
      ordinaryCorrectionOwners.length +
      correctedOrdinaryOwners.length
  )
    conflict("Original stock graphs do not cover their complete owning scope.")
  const stockById = new Map(stockGraphs.map((op) => [op.id, op]))
  const ordinaryIds = new Set(ordinaryOwners.map((op) => op.id))
  const heldBook = {
    id: input.bookId,
    tenantId: returns.snapshot.tenantId,
    currencyCode: returns.snapshot.currencyCode,
    startsAt: returns.snapshot.startsAt,
    closedThrough: returns.snapshot.closedThrough,
  }
  const countSources = await readReviewedCostCountSources(tx, {
    owners: countOwners,
    graphs: stockGraphs,
    discovery,
    book: heldBook,
  })
  const countsByOperation = new Map(
    countSources.map((source) => [source.operation.id, source]),
  )
  const closeoutSources = await readReviewedCostCloseoutSources(tx, {
    owners: closeoutOwners,
    graphs: stockGraphs,
    discovery,
    book: heldBook,
  })
  const closeoutsByOperation = new Map(
    closeoutSources.map((source) => [source.operation.id, source]),
  )
  const reservationSources = await readReviewedCostReservationSources(tx, {
    owners: reservationOwners,
    graphs: stockGraphs,
    discovery,
    book: heldBook,
  })
  const reservationsByOperation = new Map(
    reservationSources.map((source) => [source.operation.id, source]),
  )
  const ordinaryCorrections = proveReviewedOrdinaryCorrectionSources({
    graphs: stockGraphs,
    correctionIds: ordinaryCorrectionOwners.map((op) => op.id),
    discovery,
    book: heldBook,
  })
  const correctionsById = new Map(
    ordinaryCorrections.map((source) => [source.correction.id, source]),
  )
  const correctedOriginalsById = new Map(
    ordinaryCorrections.map((source) => [source.original.id, source]),
  )
  const transformationIds = new Set(transformationOwners.map((op) => op.id))
  const transformations = proveReviewedCostTransformationSources({
    graphs: stockGraphs.filter((op) => transformationIds.has(op.id)),
    discovery,
    book: heldBook,
  })
  const transformationsByOperation = new Map(
    transformations.map((source) => [source.operation.id, source]),
  )
  function add(semantic: ReviewedMovementSemantics) {
    if (
      !discovery.movementIds.includes(semantic.movementId) ||
      proved.has(semantic.movementId)
    )
      conflict("Original owning source has an outside or overlapping movement.")
    proved.add(semantic.movementId)
    semantics.push(semantic)
  }
  function competing(
    op: Owner,
    allowed: Array<keyof Owner["_count"]>,
    reservation = false,
  ) {
    if (
      (op.transferAcknowledgment != null && op.type !== "TRANSFER") ||
      Object.entries(op._count).some(
        ([key, count]) =>
          key !== "movements" &&
          key !== "corrections" &&
          !allowed.includes(key as keyof Owner["_count"]) &&
          count !== 0,
      ) ||
      (!reservation && op.committedReservation !== null)
    )
      conflict("Original movement overlaps competing typed owning sources.")
  }
  const purchaseReceiptIds = owners
    .filter(
      (op) =>
        !op.correctionOfOperationId &&
        op._count.corrections === 0 &&
        !movements.some(
          (row) => row.operationId === op.id && row.reversalOfMovementId,
        ),
    )
    .flatMap((op) => op.purchaseReceipts.map((receipt) => receipt.id))
  const purchases: Awaited<
    ReturnType<typeof resolveReviewedCostPurchaseSourcesInTransaction>
  > = purchaseReceiptIds.length
    ? await resolveReviewedCostPurchaseSourcesInTransaction(
        tx,
        { ...input, receiptIds: purchaseReceiptIds },
        context,
      )
    : new Map()
  const needsPriorPostings = Boolean(
    discovery.reviewAllocationIds.length ||
      discovery.priorReviewIds?.length ||
      discovery.priorReviewPoolSnapshotIds?.length,
  )
  const originalShortages: ReviewedShortagePostingCandidate[] = []
  const priorPostingInputs = needsPriorPostings
    ? {
        originalShortages,
        originalPostings: [...purchases.values()].map(
          (proof) => proof.originalPosting,
        ),
      }
    : {}
  for (const op of owners) {
    const rows = movements.filter((row) => row.operationId === op.id)
    const ordinaryCorrection =
      correctionsById.get(op.id) ?? correctedOriginalsById.get(op.id)
    if (ordinaryCorrection) {
      const source = ordinaryCorrection
      if (!source.targetEvent || !source.saved) {
        blockers.push({ code: "SOURCE_CONTRACT_PENDING", sourceId: op.id })
        continue
      }
      if (op.id === source.original.id) {
        add(
          source.originalEffectNegative
            ? {
                movementId: source.originalMovement.id,
                kind: "WITHDRAWAL",
                purpose: "ORDINARY",
              }
            : { movementId: source.originalMovement.id, kind: "ORIGIN" },
        )
        sourceFacts.push(facts({ kind: "ORDINARY_CORRECTION", source }))
      } else {
        add(
          source.originalEffectNegative
            ? {
                movementId: source.inverseMovement.id,
                kind: "RESTORATION",
                originalMovementId: source.originalMovement.id,
              }
            : {
                movementId: source.inverseMovement.id,
                kind: "WITHDRAWAL",
                purpose: "ORDINARY",
              },
        )
        add(
          source.originalEffectNegative
            ? {
                movementId: source.replacementMovement.id,
                kind: "WITHDRAWAL",
                purpose: "ORDINARY",
              }
            : { movementId: source.replacementMovement.id, kind: "ORIGIN" },
        )
      }
      continue
    }
    if (
      op.correctionOfOperationId ||
      op._count.corrections ||
      rows.some((row) => row.reversalOfMovementId)
    ) {
      blockers.push({ code: "SOURCE_CORRECTION", sourceId: op.id })
      continue
    }
    if (op.purchaseReceipts.length) {
      competing(op, ["purchaseReceipts"])
      const receipt = op.purchaseReceipts[0]
      if (op._count.purchaseReceipts !== 1 || !receipt)
        conflict("Original purchase owner is ambiguous.")
      const proof = purchases.get(receipt.id)
      if (!proof) conflict("Complete original purchase proof is missing.")
      add(proof.semantics)
      sourceFacts.push(facts({ kind: "PURCHASE", snapshot: proof.snapshot }))
    } else if (op.productFulfillments.length) {
      competing(op, ["productFulfillments"], true)
      const fulfillment = op.productFulfillments[0]
      const original = returns.snapshot.fulfillments.find(
        (row) => row.id === fulfillment?.id,
      )
      if (
        op._count.productFulfillments !== 1 ||
        rows.length !== 1 ||
        !original ||
        !original.stockMovementId ||
        original.stockOperationId !== op.id ||
        original.stockMovementId !== rows[0]?.id ||
        original.reservationId !== op.committedReservation?.id ||
        !returns.issues.some((issue) => issue.fulfillmentId === original.id)
      )
        conflict(
          "Product issue differs from its complete original return-source proof.",
        )
      add({
        movementId: original.stockMovementId,
        kind: "WITHDRAWAL",
        purpose: "PRODUCT_ISSUE",
      })
    } else if (op.productReturns.length) {
      competing(op, ["productReturns"])
      const productReturn = op.productReturns[0]
      const original = returns.snapshot.returns.find(
        (row) => row.id === productReturn?.id,
      )
      if (
        op._count.productReturns !== 1 ||
        rows.length !== 1 ||
        !original ||
        original.stockOperationId !== op.id ||
        original.disposition !== "RESTOCK" ||
        original.destinationBalanceSourceId !== rows[0]?.balanceSourceId
      )
        conflict(
          "Physical Product return differs from its original source proof.",
        )
      const movement = rows[0]
      if (!movement) conflict("Original Product recovery movement is missing.")
      add({
        movementId: movement.id,
        kind: "RETURN_RESTOCK",
        productReturnId: original.id,
      })
    } else if (op.type === "TRANSFORMATION") {
      competing(op, [])
      const source = transformationsByOperation.get(op.id)
      if (!source)
        conflict("Original packaged transformation source is missing.")
      if (!source.saved) {
        blockers.push({ code: "SOURCE_CONTRACT_PENDING", sourceId: op.id })
        continue
      }
      add({ movementId: source.sourceMovement.id, kind: "TRANSFER_OUT" })
      add({
        movementId: source.targetMovement.id,
        kind: "TRANSFER_IN",
        originalMovementId: source.sourceMovement.id,
      })
      sourceFacts.push(facts({ kind: "PACKAGED_TRANSFORMATION", source }))
    } else if (op.type === "RESERVATION_COMMIT" && op.committedReservation) {
      competing(op, [], true)
      const source = reservationsByOperation.get(op.id)
      if (!source)
        conflict("Original standalone reservation source is missing.")
      if (!source.movement.valuationEvent) {
        blockers.push({ code: "SOURCE_CONTRACT_PENDING", sourceId: op.id })
        continue
      }
      assertSavedReservationCommitSource(source)
      add({
        movementId: source.movement.id,
        kind: "WITHDRAWAL",
        purpose: "STANDALONE_COMMITMENT",
      })
      sourceFacts.push(facts({ kind: "STANDALONE_RESERVATION_COMMIT", source }))
    } else if (op._count.finalizedCloseouts) {
      competing(op, ["finalizedCloseouts"])
      const source = closeoutsByOperation.get(op.id)
      if (!source) conflict("Original Closeout source is missing.")
      if (
        source.nonzeroLines.some(({ movement }) => !movement.valuationEvent)
      ) {
        blockers.push({ code: "SOURCE_CONTRACT_PENDING", sourceId: op.id })
        continue
      }
      const events = assertSavedInventoryCloseoutSource(source)
      if (needsPriorPostings)
        originalShortages.push(
          ...captureReviewedShortageCandidates({
            tenantId: input.tenantId,
            bookId: input.bookId,
            kind: "INVENTORY_CLOSEOUT",
            documentId: source.closeout.id,
            operation: source.operation,
            events,
          }),
        )
      for (const { movement, effect } of source.nonzeroLines)
        add(
          effect.startsWith("-")
            ? {
                movementId: movement.id,
                kind: "WITHDRAWAL",
                purpose: "CLOSEOUT_SHORTAGE",
              }
            : { movementId: movement.id, kind: "ORIGIN" },
        )
      sourceFacts.push(facts({ kind: "INVENTORY_CLOSEOUT", source }))
    } else if (op._count.finalizedCounts) {
      competing(op, ["finalizedCounts"])
      const source = countsByOperation.get(op.id)
      if (!source) conflict("Original Stock Count source is missing.")
      if (
        source.nonzeroLines.some(({ movement }) => !movement.valuationEvent)
      ) {
        blockers.push({ code: "SOURCE_CONTRACT_PENDING", sourceId: op.id })
        continue
      }
      const events = assertSavedStockCountSource(source)
      if (needsPriorPostings)
        originalShortages.push(
          ...captureReviewedShortageCandidates({
            tenantId: input.tenantId,
            bookId: input.bookId,
            kind: "STOCK_COUNT",
            documentId: source.count.id,
            operation: source.operation,
            events,
          }),
        )
      for (const { movement, effect } of source.nonzeroLines)
        add(
          effect.startsWith("-")
            ? {
                movementId: movement.id,
                kind: "WITHDRAWAL",
                purpose: "COUNT_SHORTAGE",
              }
            : { movementId: movement.id, kind: "ORIGIN" },
        )
      sourceFacts.push(facts({ kind: "STOCK_COUNT", source }))
    } else if (op.type === "OPENING_STOCK") {
      competing(op, [])
      const event = rows[0]?.valuationEvent
      if (
        rows.length !== 1 ||
        !event ||
        !["CATALOG_OPENING", "GRADUATION_OPENING"].includes(event.sourceKind)
      )
        conflict("Opening requires a typed original Catalog command receipt.")
      // The saved label only locates a candidate. The resolver proves actual ownership.
      if (openingReceipts.has(event.sourceId)) continue
      const source = await resolveInventoryOpeningSourceInTransaction(tx, {
        tenantId: input.tenantId,
        receiptId: event.sourceId,
        expectedBookId: input.bookId,
      })
      if (!source.sources.some((item) => item.operation.id === op.id))
        conflict(
          "Opening candidate receipt does not own the original operation.",
        )
      for (const item of source.sources) {
        const saved = item.movement.valuationEvent
        if (!saved) conflict("Opening has no saved original cost event.")
        assertSavedInventoryOpeningSource(saved, source, item)
        if (item.corrections)
          conflict("Original opening has unrepresented source corrections.")
        // Sibling variants share command proof but have independent cost graphs.
        if (discovery.movementIds.includes(item.movement.id))
          add({ movementId: item.movement.id, kind: "ORIGIN" })
      }
      openingReceipts.add(event.sourceId)
      sourceFacts.push(facts({ kind: "OPENING", source }))
    } else if (
      ["TRANSFER", "CUSTODY_ASSIGNMENT", "CUSTODY_RETURN"].includes(op.type)
    ) {
      competing(op, [
        "dispatchedTransfers",
        "receivedTransfers",
        "cancelledTransfers",
      ])
      const stages = Math.max(
        op._count.dispatchedTransfers +
          op._count.receivedTransfers +
          op._count.cancelledTransfers,
        op.transferAcknowledgment ? 1 : 0,
      )
      if (rows.length !== 2 || stages !== (op.type === "TRANSFER" ? 1 : 0))
        conflict(
          "Original relocation has an ambiguous or incomplete owning stage.",
        )
      const original = stockById.get(op.id)
      if (!original) conflict("Original relocation graph is missing.")
      const source = resolveLoadedInventoryRelocationSource(
        original,
        input.tenantId,
        heldBook,
      )
      if (!source || source.book.id !== input.bookId)
        conflict("Original relocation Book proof is missing.")
      assertSavedInventoryRelocationSource(source)
      add({ movementId: source.source.movement.id, kind: "TRANSFER_OUT" })
      add({
        movementId: source.target.movement.id,
        kind: "TRANSFER_IN",
        originalMovementId: source.source.movement.id,
      })
      sourceFacts.push(facts({ kind: "RELOCATION", source }))
    } else if (ordinaryIds.has(op.id)) {
      competing(op, [])
      const original = stockById.get(op.id)
      if (!original) conflict("Original ordinary stock graph is missing.")
      const source = resolveLoadedOrdinaryStockSource(
        original,
        input.tenantId,
        heldBook,
      )
      if (!source.movement.valuationEvent) {
        blockers.push({ code: "SOURCE_CONTRACT_PENDING", sourceId: op.id })
        continue
      }
      assertSavedOrdinaryStockSource(source)
      add(
        source.effect.startsWith("-")
          ? {
              movementId: source.movement.id,
              kind: "WITHDRAWAL",
              purpose: "ORDINARY",
            }
          : { movementId: source.movement.id, kind: "ORIGIN" },
      )
      sourceFacts.push(facts({ kind: "ORDINARY", source }))
    } else {
      blockers.push({ code: "SOURCE_CONTRACT_PENDING", sourceId: op.id })
    }
  }
  const originalEvents = movements.map((row) => {
    const event: Event | null = row.valuationEvent
    return facts({ movement: row, event })
  })
  const physicalOperationIds = new Set(movements.map((row) => row.operationId))
  return {
    semantics: semantics.sort((a, b) =>
      a.movementId.localeCompare(b.movementId),
    ),
    blockers: blockers.sort(
      (a, b) =>
        a.sourceId.localeCompare(b.sourceId) || a.code.localeCompare(b.code),
    ),
    ...priorPostingInputs,
    // Retain actual normalized owner documents for the complete review fingerprint.
    snapshot: facts({ owners, originalEvents, sourceFacts, returns }),
    // Zero-only documents remain proved snapshot facts, without inventing a
    // physical operation binding. The binding checker still requires an exact set.
    operationBindings: owners
      .filter((op) => physicalOperationIds.has(op.id))
      .map(
        ({
          id,
          tenantId,
          storeId,
          store,
          type,
          source,
          clientOperationId,
          payloadHash,
          actorUserId,
          effectiveAt,
          linkedOperationId,
          correctionOfOperationId,
        }) => ({
          id,
          tenantId,
          storeId,
          store,
          type,
          source,
          clientOperationId,
          payloadHash,
          actorUserId,
          effectiveAt,
          linkedOperationId,
          correctionOfOperationId,
        }),
      ),
    movementBindings: movements.map((row) => ({
      id: row.id,
      operationId: row.operationId,
      balanceSourceId: row.balanceSourceId,
      configurationVersionId: row.configurationVersionId,
      enteredInventoryUnitId: row.enteredInventoryUnitId,
      enteredQuantity: row.enteredQuantity.toFixed(),
      transactionScaleSnapshot: row.transactionScaleSnapshot,
      unitFactorSnapshot: row.unitFactorSnapshot.toFixed(),
      signedCanonicalEffect: row.signedCanonicalEffect.toFixed(),
      previousOnHandQuantity: row.previousOnHandQuantity.toFixed(),
      resultingOnHandQuantity: row.resultingOnHandQuantity.toFixed(),
      reversalOfMovementId: row.reversalOfMovementId,
      createdAt: row.createdAt,
      valuation: row.valuationEvent
        ? {
            id: row.valuationEvent.id,
            tenantId: row.valuationEvent.tenantId,
            bookId: row.valuationEvent.bookId,
            poolId: row.valuationEvent.poolId,
            balanceSourceId: row.valuationEvent.balanceSourceId,
            stockOperationId: row.valuationEvent.stockOperationId,
            stockMovementId: row.valuationEvent.stockMovementId,
            sequence: row.valuationEvent.sequence,
            sourceKind: row.valuationEvent.sourceKind,
            sourceId: row.valuationEvent.sourceId,
            canonicalEffect: row.valuationEvent.canonicalEffect.toFixed(),
            quantityBefore: row.valuationEvent.quantityBefore.toFixed(),
            quantityAfter: row.valuationEvent.quantityAfter.toFixed(),
            sourceCostMinor: row.valuationEvent.sourceCostMinor,
            effectiveAt: row.valuationEvent.effectiveAt,
          }
        : null,
    })),
  }
}
