import { createHash, randomUUID } from "node:crypto"

import {
  addExactDecimals,
  compareExactDecimals,
  parseExactDecimal,
  subtractExactDecimals,
} from "@ewatrade/utils/exact-decimal"

import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import {
  CatalogRecordStatus,
  MembershipStatus,
  PaymentStatus,
  SellableOfferingKind,
  ServiceEvidenceAuditAction,
  ServiceEvidenceMediaType,
  ServiceEvidencePurpose,
  ServiceEvidenceUploadStatus,
  ServiceEvidenceVisibility,
  ServiceExceptionOutcome,
  ServiceExceptionType,
  ServiceIntakeStatus,
  ServiceJobLineStatus,
  ServicePriority,
  ServiceWorkEventType,
  ServiceWorkPolicy,
  WorkAuthorizationPolicy,
  WorkAuthorizationStatus,
} from "../../generated/prisma/enums"
import { CatalogError } from "./catalog"
import { createCommercialOrderInTransaction } from "./commercial-orders"

export type ServiceIntakeLineInput = {
  approvedQuotePriceMinor?: number
  expectedFixedPriceMinor?: number
  offeringId: string
  quantity: string
}

export type CreateServiceIntakeInput = {
  actorUserId: string
  clientIntakeId: string
  conditionNote?: string
  customerEmail?: string
  customerName?: string
  customerPhone?: string
  dueCommitmentAt?: Date
  instructions?: string
  lines: ServiceIntakeLineInput[]
  priority?: "normal" | "urgent"
  requestedAssigneeId?: string
  requestedAt?: Date
  schemaVersion: number
  storeId: string
  tenantId: string
}

function stableJson(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString())
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

function hash(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex")
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

function assertSchemaVersion(version: number) {
  if (version !== 1) {
    throw new CatalogError(
      "INVALID_SERVICE_TRANSITION",
      "CLIENT_SCHEMA_UNSUPPORTED: Service Operations require schema version 1.",
    )
  }
}

const jobGraph = {
  assignments: { orderBy: { assignedAt: "asc" } },
  commercialOrder: true,
  dueCommitments: { orderBy: { effectiveAt: "asc" } },
  evidence: { orderBy: { createdAt: "asc" } },
  events: { orderBy: [{ effectiveAt: "asc" }, { createdAt: "asc" }] },
  exceptions: { orderBy: { occurredAt: "asc" } },
  lines: {
    include: { commercialOrderLine: { include: { snapshot: true } } },
    orderBy: { createdAt: "asc" },
  },
  notes: { orderBy: { createdAt: "asc" } },
} satisfies Prisma.ServiceJobInclude

type JobGraph = Prisma.ServiceJobGetPayload<{ include: typeof jobGraph }>

function derivedJobSummary(lines: JobGraph["lines"]) {
  if (lines.length === 0) return "cancelled" as const
  const statuses = lines.map((line) => line.status)
  if (statuses.every((status) => status === ServiceJobLineStatus.CANCELLED)) {
    return "cancelled" as const
  }
  if (
    statuses.every(
      (status) =>
        status === ServiceJobLineStatus.COMPLETED ||
        status === ServiceJobLineStatus.CANCELLED,
    )
  ) {
    return "completed" as const
  }
  const readyOrCompleted = statuses.filter(
    (status) =>
      status === ServiceJobLineStatus.READY_FOR_HANDOFF ||
      status === ServiceJobLineStatus.COMPLETED,
  ).length
  const unfinished = statuses.filter(
    (status) =>
      status !== ServiceJobLineStatus.CANCELLED &&
      status !== ServiceJobLineStatus.COMPLETED &&
      status !== ServiceJobLineStatus.READY_FOR_HANDOFF,
  ).length
  if (readyOrCompleted > 0 && unfinished > 0) return "partially_ready" as const
  if (readyOrCompleted > 0 && unfinished === 0) {
    return "ready_for_handoff" as const
  }
  if (statuses.some((status) => status === ServiceJobLineStatus.BLOCKED)) {
    return "blocked" as const
  }
  if (statuses.some((status) => status === ServiceJobLineStatus.IN_PROGRESS)) {
    return "in_progress" as const
  }
  return "queued" as const
}

function customerMilestone(summary: ReturnType<typeof derivedJobSummary>) {
  if (summary === "queued") return "received" as const
  if (summary === "in_progress") return "work_started" as const
  if (summary === "blocked") return "update_available" as const
  if (summary === "partially_ready") return "partially_ready" as const
  if (summary === "ready_for_handoff") return "ready" as const
  if (summary === "completed") return "completed" as const
  return "cancelled" as const
}

function serializeJob(job: JobGraph) {
  const summary = derivedJobSummary(job.lines)
  const currentDue = [...job.dueCommitments]
    .reverse()
    .find((commitment) => !commitment.supersededAt)
  return {
    assignments: job.assignments.map((assignment) => ({
      assignedAt: assignment.assignedAt,
      assignedUserId: assignment.assignedUserId,
      endedAt: assignment.endedAt,
      id: assignment.id,
      previousUserId: assignment.previousUserId,
      reason: assignment.reason,
    })),
    commercialOrderId: job.commercialOrderId,
    createdAt: job.createdAt,
    currentAssigneeUserId: job.currentAssigneeUserId,
    customerMilestone: customerMilestone(summary),
    dueCommitmentAt: currentDue?.promisedAt ?? null,
    dueHistory: job.dueCommitments.map((commitment) => ({
      effectiveAt: commitment.effectiveAt,
      id: commitment.id,
      previousPromisedAt: commitment.previousPromisedAt,
      promisedAt: commitment.promisedAt,
      reason: commitment.reason,
      supersededAt: commitment.supersededAt,
    })),
    evidence: job.evidence.map((evidence) => ({
      capturedAt: evidence.capturedAt,
      failureReason: evidence.failureReason,
      id: evidence.id,
      label: evidence.label,
      mediaType: evidence.mediaType,
      purpose: evidence.purpose,
      publishedAt: evidence.publishedAt,
      uploadStatus: evidence.uploadStatus,
      visibility: evidence.visibility,
    })),
    exceptions: job.exceptions.map((exception) => ({
      description: exception.description,
      id: exception.id,
      lineId: exception.serviceJobLineId,
      occurredAt: exception.occurredAt,
      outcome: exception.outcome,
      type: exception.type,
    })),
    id: job.id,
    lines: job.lines.map((line) => ({
      allocatedQuantity: line.allocatedQuantity.toString(),
      authorizationPolicy: line.authorizationPolicy,
      authorizationStatus: line.authorizationStatus,
      catalogItemName:
        line.commercialOrderLine.snapshot?.catalogItemName ?? "Service",
      commercialOrderLineId: line.commercialOrderLineId,
      completedAt: line.completedAt,
      id: line.id,
      offeringName:
        line.commercialOrderLine.snapshot?.offeringName ?? "Service",
      optionSelections:
        line.commercialOrderLine.snapshot?.optionSelections ?? [],
      revision: line.revision,
      status: line.status,
      variantName:
        line.commercialOrderLine.snapshot?.variantName ?? "Service",
    })),
    orderNumber: job.commercialOrder.orderNumber,
    paymentStatus: job.commercialOrder.paymentStatus,
    priority:
      job.priority === ServicePriority.URGENT ? ("urgent" as const) : ("normal" as const),
    revision: job.revision,
    notes: job.notes.map((note) => ({
      body: note.body,
      createdAt: note.createdAt,
      id: note.id,
      lineId: note.serviceJobLineId,
    })),
    storeId: job.storeId,
    summary,
  }
}

async function loadJob(
  db: Prisma.TransactionClient | PrismaClient,
  input: { jobId: string; tenantId: string },
) {
  const job = await db.serviceJob.findFirst({
    include: jobGraph,
    where: { id: input.jobId, tenantId: input.tenantId },
  })
  if (!job) {
    throw new CatalogError("SERVICE_JOB_NOT_FOUND", "Service Job not found.")
  }
  return job
}

async function assertActiveAssignee(
  tx: Prisma.TransactionClient,
  input: { tenantId: string; userId: string },
) {
  const membership = await tx.membership.findFirst({
    where: {
      status: MembershipStatus.ACTIVE,
      tenantId: input.tenantId,
      userId: input.userId,
    },
  })
  if (!membership) {
    throw new CatalogError(
      "INVALID_ASSIGNEE",
      "Assignee must be an active member of this business.",
    )
  }
}

export async function createServiceIntakeDraft(
  db: PrismaClient,
  input: CreateServiceIntakeInput,
) {
  assertSchemaVersion(input.schemaVersion)
  if (input.lines.length === 0) {
    throw new CatalogError(
      "INVALID_ORDER",
      "Service Intake requires at least one Service Offering.",
    )
  }
  const payloadHash = hash(input)
  return db.$transaction(async (tx) => {
    const previous = await tx.serviceIntake.findUnique({
      include: { lines: true },
      where: {
        tenantId_clientIntakeId: {
          clientIntakeId: input.clientIntakeId,
          tenantId: input.tenantId,
        },
      },
    })
    if (previous) {
      if (previous.payloadHash !== payloadHash) {
        throw new CatalogError(
          "IDEMPOTENCY_MISMATCH",
          "This Service Intake identity was already used with different input.",
        )
      }
      return previous
    }
    const store = await tx.store.findFirst({
      where: { id: input.storeId, tenantId: input.tenantId },
    })
    if (!store) throw new CatalogError("STORE_NOT_FOUND", "Store not found.")
    const offerings = await tx.sellableOffering.findMany({
      include: {
        serviceOffering: true,
        storeAvailability: { where: { storeId: input.storeId } },
      },
      where: {
        id: { in: input.lines.map((line) => line.offeringId) },
        kind: SellableOfferingKind.SERVICE,
        status: CatalogRecordStatus.ACTIVE,
        tenantId: input.tenantId,
      },
    })
    if (
      offerings.length !== new Set(input.lines.map((line) => line.offeringId)).size ||
      offerings.some(
        (offering) =>
          !offering.serviceOffering ||
          !offering.storeAvailability[0]?.isAvailable,
      )
    ) {
      throw new CatalogError(
        "OFFERING_UNAVAILABLE",
        "Service Intake contains an unavailable Offering.",
      )
    }
    const scaleByOffering = new Map(
      offerings.map((offering) => [
        offering.id,
        offering.serviceOffering!.quantityScale,
      ]),
    )
    for (const line of input.lines) {
      parseExactDecimal(line.quantity, {
        allowZero: false,
        maxScale: scaleByOffering.get(line.offeringId) ?? 0,
      })
    }
    if (input.requestedAssigneeId) {
      await assertActiveAssignee(tx, {
        tenantId: input.tenantId,
        userId: input.requestedAssigneeId,
      })
    }
    const intake = await tx.serviceIntake.create({
      data: {
        clientIntakeId: input.clientIntakeId,
        conditionNote: input.conditionNote?.trim() || null,
        createdByUserId: input.actorUserId,
        customerEmail: input.customerEmail?.trim() || null,
        customerName: input.customerName?.trim() || null,
        customerPhone: input.customerPhone?.trim() || null,
        dueCommitmentAt: input.dueCommitmentAt,
        instructions: input.instructions?.trim() || null,
        payloadHash,
        priority:
          input.priority === "urgent"
            ? ServicePriority.URGENT
            : ServicePriority.NORMAL,
        requestedAssigneeId: input.requestedAssigneeId,
        requestedAt: input.requestedAt,
        schemaVersion: input.schemaVersion,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    await tx.serviceIntakeLine.createMany({
      data: input.lines.map((line) => ({
        approvedQuotePriceMinor: line.approvedQuotePriceMinor,
        expectedFixedPriceMinor: line.expectedFixedPriceMinor,
        intakeId: intake.id,
        offeringId: line.offeringId,
        quantity: parseExactDecimal(line.quantity, {
          allowZero: false,
          maxScale: scaleByOffering.get(line.offeringId) ?? 0,
        }),
      })),
    })
    return tx.serviceIntake.findUniqueOrThrow({
      include: { lines: true },
      where: { id: intake.id },
    })
  })
}

export async function confirmServiceIntake(
  db: PrismaClient,
  input: {
    actorUserId: string
    intakeId: string
    schemaVersion: number
    tenantId: string
  },
) {
  assertSchemaVersion(input.schemaVersion)
  return db.$transaction(async (tx) => {
    const intake = await tx.serviceIntake.findFirst({
      include: { lines: true },
      where: { id: input.intakeId, tenantId: input.tenantId },
    })
    if (!intake) {
      throw new CatalogError(
        "SERVICE_INTAKE_NOT_FOUND",
        "Service Intake not found.",
      )
    }
    if (intake.status === ServiceIntakeStatus.CONFIRMED) {
      const jobs = await tx.serviceJob.findMany({
        include: jobGraph,
        where: { intakeId: intake.id },
      })
      return {
        intakeId: intake.id,
        jobs: jobs.map(serializeJob),
        orderId: intake.commercialOrderId!,
      }
    }
    if (intake.status !== ServiceIntakeStatus.DRAFT) {
      throw new CatalogError(
        "INVALID_SERVICE_TRANSITION",
        "Only a Draft Service Intake can be confirmed.",
      )
    }
    const order = await createCommercialOrderInTransaction(tx, {
      actorUserId: input.actorUserId,
      clientOrderId: `${intake.clientIntakeId}:order`,
      customerEmail: intake.customerEmail ?? undefined,
      customerName: intake.customerName ?? undefined,
      customerPhone: intake.customerPhone ?? undefined,
      createTrackedServiceWork: false,
      lines: intake.lines.map((line) => ({
        approvedQuotePriceMinor: line.approvedQuotePriceMinor ?? undefined,
        expectedFixedPriceMinor: line.expectedFixedPriceMinor ?? undefined,
        offeringId: line.offeringId,
        quantity: line.quantity.toString(),
      })),
      notes: intake.instructions ?? undefined,
      schemaVersion: 1,
      storeId: intake.storeId,
      tenantId: input.tenantId,
    })
    const trackedOrderLines = await tx.commercialOrderLine.findMany({
      include: {
        offering: { include: { serviceOffering: true } },
        snapshot: true,
      },
      where: {
        orderId: order.id,
        offering: {
          serviceOffering: { workPolicy: ServiceWorkPolicy.TRACKED },
        },
      },
    })
    const jobs: JobGraph[] = []
    if (trackedOrderLines.length > 0) {
      const job = await tx.serviceJob.create({
        data: {
          clientJobId: `${intake.clientIntakeId}:job:1`,
          commercialOrderId: order.id,
          createdByUserId: input.actorUserId,
          currentAssigneeUserId: intake.requestedAssigneeId,
          intakeId: intake.id,
          priority: intake.priority,
          storeId: intake.storeId,
          tenantId: input.tenantId,
        },
      })
      for (const orderLine of trackedOrderLines) {
        const policy =
          orderLine.offering.serviceOffering!.authorizationPolicy
        const status =
          policy === WorkAuthorizationPolicy.ON_ORDER_CONFIRMATION ||
          (policy === WorkAuthorizationPolicy.AFTER_REQUIRED_PAYMENT &&
            order.paymentStatus === PaymentStatus.PAID)
            ? WorkAuthorizationStatus.AUTHORIZED
            : policy === WorkAuthorizationPolicy.AFTER_REQUIRED_PAYMENT
              ? WorkAuthorizationStatus.PENDING_PAYMENT
              : WorkAuthorizationStatus.PENDING_RELEASE
        const line = await tx.serviceJobLine.create({
          data: {
            allocatedQuantity: orderLine.quantity,
            allocationSnapshot: json(orderLine.snapshot),
            authorizationPolicy: policy,
            authorizationSource:
              status === WorkAuthorizationStatus.AUTHORIZED
                ? "order_confirmation"
                : null,
            authorizationStatus: status,
            authorizedAt:
              status === WorkAuthorizationStatus.AUTHORIZED
                ? new Date()
                : null,
            commercialOrderLineId: orderLine.id,
            serviceJobId: job.id,
          },
        })
        await tx.serviceWorkEvent.create({
          data: {
            actorUserId: input.actorUserId,
            payload: json({ allocatedQuantity: line.allocatedQuantity.toString() }),
            serviceJobId: job.id,
            serviceJobLineId: line.id,
            source: "service_intake",
            tenantId: input.tenantId,
            type: ServiceWorkEventType.CREATED,
          },
        })
        if (status === WorkAuthorizationStatus.AUTHORIZED) {
          await tx.serviceWorkEvent.create({
            data: {
              actorUserId: input.actorUserId,
              serviceJobId: job.id,
              serviceJobLineId: line.id,
              source: "service_intake",
              tenantId: input.tenantId,
              type: ServiceWorkEventType.AUTHORIZED,
            },
          })
        }
      }
      if (intake.requestedAssigneeId) {
        await tx.serviceWorkAssignment.create({
          data: {
            assignedByUserId: input.actorUserId,
            assignedUserId: intake.requestedAssigneeId,
            reason: "Assigned during Intake",
            serviceJobId: job.id,
          },
        })
      }
      if (intake.dueCommitmentAt) {
        await tx.serviceDueCommitment.create({
          data: {
            createdByUserId: input.actorUserId,
            promisedAt: intake.dueCommitmentAt,
            reason: "Committed during Intake",
            serviceJobId: job.id,
          },
        })
      }
      jobs.push(await loadJob(tx, { jobId: job.id, tenantId: input.tenantId }))
    }
    await tx.serviceIntake.update({
      data: {
        commercialOrderId: order.id,
        confirmedAt: new Date(),
        status: ServiceIntakeStatus.CONFIRMED,
      },
      where: { id: intake.id },
    })
    return {
      intakeId: intake.id,
      jobs: jobs.map(serializeJob),
      orderId: order.id,
    }
  })
}

export async function createAndConfirmServiceIntake(
  db: PrismaClient,
  input: CreateServiceIntakeInput,
) {
  const draft = await createServiceIntakeDraft(db, input)
  return confirmServiceIntake(db, {
    actorUserId: input.actorUserId,
    intakeId: draft.id,
    schemaVersion: input.schemaVersion,
    tenantId: input.tenantId,
  })
}

const allowedTransitions = new Map<ServiceJobLineStatus, ServiceJobLineStatus[]>([
  [
    ServiceJobLineStatus.QUEUED,
    [
      ServiceJobLineStatus.IN_PROGRESS,
      ServiceJobLineStatus.BLOCKED,
      ServiceJobLineStatus.READY_FOR_HANDOFF,
      ServiceJobLineStatus.COMPLETED,
      ServiceJobLineStatus.CANCELLED,
    ],
  ],
  [
    ServiceJobLineStatus.IN_PROGRESS,
    [
      ServiceJobLineStatus.BLOCKED,
      ServiceJobLineStatus.READY_FOR_HANDOFF,
      ServiceJobLineStatus.COMPLETED,
      ServiceJobLineStatus.CANCELLED,
    ],
  ],
  [
    ServiceJobLineStatus.BLOCKED,
    [
      ServiceJobLineStatus.QUEUED,
      ServiceJobLineStatus.IN_PROGRESS,
      ServiceJobLineStatus.CANCELLED,
    ],
  ],
  [
    ServiceJobLineStatus.READY_FOR_HANDOFF,
    [
      ServiceJobLineStatus.IN_PROGRESS,
      ServiceJobLineStatus.COMPLETED,
      ServiceJobLineStatus.CANCELLED,
    ],
  ],
  [ServiceJobLineStatus.COMPLETED, []],
  [ServiceJobLineStatus.CANCELLED, []],
])

function lineStatus(value: string) {
  if (value === "in_progress") return ServiceJobLineStatus.IN_PROGRESS
  if (value === "blocked") return ServiceJobLineStatus.BLOCKED
  if (value === "ready_for_handoff") {
    return ServiceJobLineStatus.READY_FOR_HANDOFF
  }
  if (value === "completed") return ServiceJobLineStatus.COMPLETED
  if (value === "cancelled") return ServiceJobLineStatus.CANCELLED
  return ServiceJobLineStatus.QUEUED
}

export async function transitionServiceJobLine(
  db: PrismaClient,
  input: {
    actorUserId: string
    clientCommandId: string
    effectiveAt?: Date
    expectedRevision: number
    lineId: string
    reason?: string
    schemaVersion: number
    source: string
    tenantId: string
    toStatus:
      | "blocked"
      | "cancelled"
      | "completed"
      | "in_progress"
      | "queued"
      | "ready_for_handoff"
  },
) {
  assertSchemaVersion(input.schemaVersion)
  return db.$transaction(async (tx) => {
    const previous = await tx.serviceWorkEvent.findUnique({
      where: {
        tenantId_clientCommandId: {
          clientCommandId: input.clientCommandId,
          tenantId: input.tenantId,
        },
      },
    })
    if (previous) {
      return serializeJob(
        await loadJob(tx, {
          jobId: previous.serviceJobId,
          tenantId: input.tenantId,
        }),
      )
    }
    const line = await tx.serviceJobLine.findFirst({
      include: { serviceJob: true },
      where: { id: input.lineId, serviceJob: { tenantId: input.tenantId } },
    })
    if (!line) {
      throw new CatalogError("SERVICE_JOB_NOT_FOUND", "Service Job Line not found.")
    }
    if (line.revision !== input.expectedRevision) {
      throw new CatalogError(
        "REVISION_CONFLICT",
        "Service Job Line changed before this transition.",
      )
    }
    const next = lineStatus(input.toStatus)
    if (!allowedTransitions.get(line.status)?.includes(next)) {
      throw new CatalogError(
        "INVALID_SERVICE_TRANSITION",
        "This Service Job Line transition is not allowed.",
      )
    }
    if (
      next !== ServiceJobLineStatus.CANCELLED &&
      line.authorizationStatus !== WorkAuthorizationStatus.AUTHORIZED
    ) {
      throw new CatalogError(
        "SERVICE_WORK_NOT_AUTHORIZED",
        "Tracked work must be authorized before progress can change.",
      )
    }
    const update = await tx.serviceJobLine.updateMany({
      data: {
        cancelledAt:
          next === ServiceJobLineStatus.CANCELLED ? new Date() : undefined,
        completedAt:
          next === ServiceJobLineStatus.COMPLETED ? new Date() : undefined,
        revision: { increment: 1 },
        status: next,
      },
      where: { id: line.id, revision: line.revision },
    })
    if (update.count !== 1) {
      throw new CatalogError(
        "REVISION_CONFLICT",
        "Service Job Line changed while applying this transition.",
      )
    }
    await tx.serviceWorkEvent.create({
      data: {
        actorUserId: input.actorUserId,
        clientCommandId: input.clientCommandId,
        effectiveAt: input.effectiveAt,
        fromStatus: line.status,
        reason: input.reason?.trim() || null,
        serviceJobId: line.serviceJobId,
        serviceJobLineId: line.id,
        source: input.source,
        tenantId: input.tenantId,
        toStatus: next,
        type: ServiceWorkEventType.STATUS_CHANGED,
      },
    })
    await tx.serviceJob.update({
      data: { revision: { increment: 1 } },
      where: { id: line.serviceJobId },
    })
    return serializeJob(
      await loadJob(tx, {
        jobId: line.serviceJobId,
        tenantId: input.tenantId,
      }),
    )
  })
}

export async function authorizeServiceJobLine(
  db: PrismaClient,
  input: {
    actorUserId: string
    clientCommandId: string
    expectedRevision: number
    lineId: string
    reason: string
    source: "manual_release" | "payment"
    tenantId: string
  },
) {
  return db.$transaction(async (tx) => {
    const line = await tx.serviceJobLine.findFirst({
      include: { commercialOrderLine: { include: { order: true } }, serviceJob: true },
      where: { id: input.lineId, serviceJob: { tenantId: input.tenantId } },
    })
    if (!line) throw new CatalogError("SERVICE_JOB_NOT_FOUND", "Job Line not found.")
    if (line.revision !== input.expectedRevision) {
      throw new CatalogError("REVISION_CONFLICT", "Job Line changed before authorization.")
    }
    if (
      input.source === "payment" &&
      line.commercialOrderLine.order.paymentStatus !== PaymentStatus.PAID
    ) {
      throw new CatalogError(
        "SERVICE_WORK_NOT_AUTHORIZED",
        "The required Commercial Order payment is not complete.",
      )
    }
    if (
      input.source === "manual_release" &&
      line.authorizationPolicy !== WorkAuthorizationPolicy.MANUAL_RELEASE
    ) {
      throw new CatalogError(
        "SERVICE_WORK_NOT_AUTHORIZED",
        "This Offering is not configured for manual work release.",
      )
    }
    await tx.serviceJobLine.update({
      data: {
        authorizationSource: input.source,
        authorizationStatus: WorkAuthorizationStatus.AUTHORIZED,
        authorizedAt: new Date(),
        revision: { increment: 1 },
      },
      where: { id: line.id },
    })
    await tx.serviceWorkEvent.create({
      data: {
        actorUserId: input.actorUserId,
        clientCommandId: input.clientCommandId,
        reason: input.reason.trim(),
        serviceJobId: line.serviceJobId,
        serviceJobLineId: line.id,
        source: input.source,
        tenantId: input.tenantId,
        type: ServiceWorkEventType.AUTHORIZED,
      },
    })
    return serializeJob(
      await loadJob(tx, { jobId: line.serviceJobId, tenantId: input.tenantId }),
    )
  })
}

export async function splitServiceJobLine(
  db: PrismaClient,
  input: {
    actorUserId: string
    clientCommandId: string
    expectedRevision: number
    lineId: string
    quantity: string
    reason: string
    tenantId: string
  },
) {
  return db.$transaction(async (tx) => {
    const line = await tx.serviceJobLine.findFirst({
      include: { serviceJob: true },
      where: { id: input.lineId, serviceJob: { tenantId: input.tenantId } },
    })
    if (!line) throw new CatalogError("SERVICE_JOB_NOT_FOUND", "Job Line not found.")
    if (line.revision !== input.expectedRevision) {
      throw new CatalogError("REVISION_CONFLICT", "Job Line changed before splitting.")
    }
    if (
      (line.status === ServiceJobLineStatus.COMPLETED ||
        line.status === ServiceJobLineStatus.CANCELLED)
    ) {
      throw new CatalogError(
        "SERVICE_ALLOCATION_CONFLICT",
        "Completed or cancelled work cannot be split.",
      )
    }
    const quantity = parseExactDecimal(input.quantity, {
      allowZero: false,
      maxScale: 6,
    })
    if (compareExactDecimals(quantity, line.allocatedQuantity.toString()) >= 0) {
      throw new CatalogError(
        "SERVICE_ALLOCATION_CONFLICT",
        "Split quantity must be smaller than the current allocation.",
      )
    }
    const remaining = subtractExactDecimals(
      line.allocatedQuantity.toString(),
      quantity,
    )
    const newJob = await tx.serviceJob.create({
      data: {
        clientJobId: `${line.serviceJob.clientJobId}:split:${randomUUID()}`,
        commercialOrderId: line.serviceJob.commercialOrderId,
        createdByUserId: input.actorUserId,
        intakeId: line.serviceJob.intakeId,
        priority: line.serviceJob.priority,
        splitFromJobId: line.serviceJobId,
        storeId: line.serviceJob.storeId,
        tenantId: input.tenantId,
      },
    })
    await tx.serviceJobLine.update({
      data: { allocatedQuantity: remaining, revision: { increment: 1 } },
      where: { id: line.id },
    })
    const newLine = await tx.serviceJobLine.create({
      data: {
        allocatedQuantity: quantity,
        allocationSnapshot: line.allocationSnapshot as Prisma.InputJsonValue,
        authorizationPolicy: line.authorizationPolicy,
        authorizationSource: line.authorizationSource,
        authorizationStatus: line.authorizationStatus,
        authorizedAt: line.authorizedAt,
        commercialOrderLineId: line.commercialOrderLineId,
        serviceJobId: newJob.id,
        status: line.status,
      },
    })
    await tx.serviceWorkEvent.create({
      data: {
        actorUserId: input.actorUserId,
        clientCommandId: input.clientCommandId,
        payload: json({
          movedQuantity: quantity,
          sourceLineId: line.id,
          targetJobId: newJob.id,
          targetLineId: newLine.id,
        }),
        reason: input.reason.trim(),
        serviceJobId: line.serviceJobId,
        serviceJobLineId: line.id,
        source: "service_work",
        tenantId: input.tenantId,
        type: ServiceWorkEventType.SPLIT,
      },
    })
    return {
      sourceJob: serializeJob(
        await loadJob(tx, {
          jobId: line.serviceJobId,
          tenantId: input.tenantId,
        }),
      ),
      targetJob: serializeJob(
        await loadJob(tx, { jobId: newJob.id, tenantId: input.tenantId }),
      ),
    }
  })
}

export async function assignServiceJob(
  db: PrismaClient,
  input: {
    actorUserId: string
    assigneeUserId: string
    expectedRevision: number
    jobId: string
    reason?: string
    tenantId: string
  },
) {
  return db.$transaction(async (tx) => {
    const job = await tx.serviceJob.findFirst({
      where: { id: input.jobId, tenantId: input.tenantId },
    })
    if (!job) throw new CatalogError("SERVICE_JOB_NOT_FOUND", "Job not found.")
    if (job.revision !== input.expectedRevision) {
      throw new CatalogError("REVISION_CONFLICT", "Job changed before assignment.")
    }
    await assertActiveAssignee(tx, {
      tenantId: input.tenantId,
      userId: input.assigneeUserId,
    })
    await tx.serviceWorkAssignment.updateMany({
      data: { endedAt: new Date() },
      where: { endedAt: null, serviceJobId: job.id },
    })
    await tx.serviceWorkAssignment.create({
      data: {
        assignedByUserId: input.actorUserId,
        assignedUserId: input.assigneeUserId,
        previousUserId: job.currentAssigneeUserId,
        reason: input.reason?.trim() || null,
        serviceJobId: job.id,
      },
    })
    await tx.serviceJob.update({
      data: {
        currentAssigneeUserId: input.assigneeUserId,
        revision: { increment: 1 },
      },
      where: { id: job.id },
    })
    await tx.serviceWorkEvent.create({
      data: {
        actorUserId: input.actorUserId,
        payload: json({ assigneeUserId: input.assigneeUserId }),
        reason: input.reason?.trim() || null,
        serviceJobId: job.id,
        source: "service_work",
        tenantId: input.tenantId,
        type: job.currentAssigneeUserId
          ? ServiceWorkEventType.REASSIGNED
          : ServiceWorkEventType.ASSIGNED,
      },
    })
    return serializeJob(
      await loadJob(tx, { jobId: job.id, tenantId: input.tenantId }),
    )
  })
}

export async function rescheduleServiceJob(
  db: PrismaClient,
  input: {
    actorUserId: string
    expectedRevision: number
    jobId: string
    promisedAt: Date
    reason: string
    tenantId: string
  },
) {
  return db.$transaction(async (tx) => {
    const job = await tx.serviceJob.findFirst({
      include: { dueCommitments: { where: { supersededAt: null } } },
      where: { id: input.jobId, tenantId: input.tenantId },
    })
    if (!job) throw new CatalogError("SERVICE_JOB_NOT_FOUND", "Job not found.")
    if (job.revision !== input.expectedRevision) {
      throw new CatalogError("REVISION_CONFLICT", "Job changed before rescheduling.")
    }
    const previous = job.dueCommitments[0]
    if (previous) {
      await tx.serviceDueCommitment.update({
        data: { supersededAt: new Date() },
        where: { id: previous.id },
      })
    }
    await tx.serviceDueCommitment.create({
      data: {
        createdByUserId: input.actorUserId,
        previousPromisedAt: previous?.promisedAt,
        promisedAt: input.promisedAt,
        reason: input.reason.trim(),
        serviceJobId: job.id,
      },
    })
    await tx.serviceJob.update({
      data: { revision: { increment: 1 } },
      where: { id: job.id },
    })
    await tx.serviceWorkEvent.create({
      data: {
        actorUserId: input.actorUserId,
        payload: json({
          previousPromisedAt: previous?.promisedAt ?? null,
          promisedAt: input.promisedAt,
        }),
        reason: input.reason.trim(),
        serviceJobId: job.id,
        source: "service_work",
        tenantId: input.tenantId,
        type: previous
          ? ServiceWorkEventType.DUE_COMMITMENT_REVISED
          : ServiceWorkEventType.DUE_COMMITMENT_CREATED,
      },
    })
    return serializeJob(
      await loadJob(tx, { jobId: job.id, tenantId: input.tenantId }),
    )
  })
}

export async function addServiceInternalNote(
  db: PrismaClient,
  input: {
    actorUserId: string
    body: string
    clientCommandId: string
    jobId: string
    lineId?: string
    tenantId: string
  },
) {
  return db.$transaction(async (tx) => {
    const job = await tx.serviceJob.findFirst({
      where: { id: input.jobId, tenantId: input.tenantId },
    })
    if (!job) throw new CatalogError("SERVICE_JOB_NOT_FOUND", "Job not found.")
    const note = await tx.serviceInternalNote.upsert({
      create: {
        actorUserId: input.actorUserId,
        body: input.body.trim(),
        clientCommandId: input.clientCommandId,
        serviceJobId: job.id,
        serviceJobLineId: input.lineId,
      },
      update: {},
      where: {
        serviceJobId_clientCommandId: {
          clientCommandId: input.clientCommandId,
          serviceJobId: job.id,
        },
      },
    })
    return note
  })
}

export async function recordServiceException(
  db: PrismaClient,
  input: {
    actorUserId: string
    description: string
    jobId: string
    lineId?: string
    tenantId: string
    type: "customer_rejection" | "delay" | "failed_attempt" | "other" | "quality"
  },
) {
  const job = await loadJob(db, { jobId: input.jobId, tenantId: input.tenantId })
  const type =
    input.type === "delay"
      ? ServiceExceptionType.DELAY
      : input.type === "quality"
        ? ServiceExceptionType.QUALITY
        : input.type === "failed_attempt"
          ? ServiceExceptionType.FAILED_ATTEMPT
          : input.type === "customer_rejection"
            ? ServiceExceptionType.CUSTOMER_REJECTION
            : ServiceExceptionType.OTHER
  return db.serviceException.create({
    data: {
      actorUserId: input.actorUserId,
      description: input.description.trim(),
      outcome: ServiceExceptionOutcome.OPEN,
      serviceJobId: job.id,
      serviceJobLineId: input.lineId,
      type,
    },
  })
}

export async function createServiceRework(
  db: PrismaClient,
  input: {
    actorUserId: string
    clientCommandId: string
    lineId: string
    quantity: string
    reason: string
    tenantId: string
  },
) {
  return db.$transaction(async (tx) => {
    const source = await tx.serviceJobLine.findFirst({
      include: { serviceJob: true },
      where: { id: input.lineId, serviceJob: { tenantId: input.tenantId } },
    })
    if (!source) throw new CatalogError("SERVICE_JOB_NOT_FOUND", "Job Line not found.")
    if (source.status !== ServiceJobLineStatus.COMPLETED) {
      throw new CatalogError(
        "INVALID_SERVICE_TRANSITION",
        "Post-completion rework requires a completed source allocation.",
      )
    }
    const quantity = parseExactDecimal(input.quantity, {
      allowZero: false,
      maxScale: 6,
    })
    if (compareExactDecimals(quantity, source.allocatedQuantity.toString()) > 0) {
      throw new CatalogError(
        "SERVICE_ALLOCATION_CONFLICT",
        "Rework quantity cannot exceed the completed source allocation.",
      )
    }
    const job = await tx.serviceJob.create({
      data: {
        clientJobId: `${source.serviceJob.clientJobId}:rework:${randomUUID()}`,
        commercialOrderId: source.serviceJob.commercialOrderId,
        createdByUserId: input.actorUserId,
        priority: source.serviceJob.priority,
        reworkOfJobId: source.serviceJobId,
        storeId: source.serviceJob.storeId,
        tenantId: input.tenantId,
      },
    })
    const line = await tx.serviceJobLine.create({
      data: {
        allocatedQuantity: quantity,
        allocationSnapshot: source.allocationSnapshot as Prisma.InputJsonValue,
        authorizationPolicy: source.authorizationPolicy,
        authorizationSource: "rework",
        authorizationStatus: WorkAuthorizationStatus.AUTHORIZED,
        authorizedAt: new Date(),
        commercialOrderLineId: source.commercialOrderLineId,
        reworkOfLineId: source.id,
        serviceJobId: job.id,
      },
    })
    await tx.serviceWorkEvent.create({
      data: {
        actorUserId: input.actorUserId,
        clientCommandId: input.clientCommandId,
        payload: json({ quantity, sourceLineId: source.id }),
        reason: input.reason.trim(),
        serviceJobId: job.id,
        serviceJobLineId: line.id,
        source: "service_work",
        tenantId: input.tenantId,
        type: ServiceWorkEventType.REWORK,
      },
    })
    return serializeJob(
      await loadJob(tx, { jobId: job.id, tenantId: input.tenantId }),
    )
  })
}

function evidencePurpose(value: string) {
  if (value === "intake_condition") return ServiceEvidencePurpose.INTAKE_CONDITION
  if (value === "progress") return ServiceEvidencePurpose.PROGRESS
  if (value === "completion") return ServiceEvidencePurpose.COMPLETION
  if (value === "exception") return ServiceEvidencePurpose.EXCEPTION
  if (value === "approval") return ServiceEvidencePurpose.APPROVAL
  if (value === "handoff") return ServiceEvidencePurpose.HANDOFF
  return ServiceEvidencePurpose.OTHER
}

function evidenceMediaType(value: string) {
  if (value === "photo") return ServiceEvidenceMediaType.PHOTO
  if (value === "video") return ServiceEvidenceMediaType.VIDEO
  return ServiceEvidenceMediaType.FILE
}

export async function captureServiceEvidence(
  db: PrismaClient,
  input: {
    actorUserId: string
    assetReference?: string
    capturedAt?: Date
    clientEvidenceId: string
    jobId: string
    label?: string
    lineId?: string
    mediaType: "file" | "photo" | "video"
    purpose:
      | "approval"
      | "completion"
      | "exception"
      | "handoff"
      | "intake_condition"
      | "other"
      | "progress"
    tenantId: string
    uploadStatus?: "failed" | "local" | "queued"
  },
) {
  const job = await loadJob(db, { jobId: input.jobId, tenantId: input.tenantId })
  const status =
    input.uploadStatus === "failed"
      ? ServiceEvidenceUploadStatus.FAILED
      : input.uploadStatus === "queued"
        ? ServiceEvidenceUploadStatus.QUEUED
        : ServiceEvidenceUploadStatus.LOCAL
  return db.$transaction(async (tx) => {
    const evidence = await tx.serviceEvidence.upsert({
      create: {
        assetReference: input.assetReference,
        capturedAt: input.capturedAt,
        clientEvidenceId: input.clientEvidenceId,
        label: input.label?.trim() || null,
        mediaType: evidenceMediaType(input.mediaType),
        purpose: evidencePurpose(input.purpose),
        serviceJobId: job.id,
        serviceJobLineId: input.lineId,
        tenantId: input.tenantId,
        uploadStatus: status,
        uploadedAt: null,
        uploaderUserId: input.actorUserId,
      },
      update: {},
      where: {
        tenantId_clientEvidenceId: {
          clientEvidenceId: input.clientEvidenceId,
          tenantId: input.tenantId,
        },
      },
    })
    await tx.serviceEvidenceAuditEvent.create({
      data: {
        action: ServiceEvidenceAuditAction.CAPTURED,
        actorUserId: input.actorUserId,
        evidenceId: evidence.id,
      },
    })
    return evidence
  })
}

export async function updateServiceEvidenceUpload(
  db: PrismaClient,
  input: {
    actorUserId: string
    assetReference?: string
    evidenceId: string
    failureReason?: string
    safePublicAssetId?: string
    safetyMetadata?: Record<string, unknown>
    status: "available" | "failed" | "queued" | "uploading"
    tenantId: string
  },
) {
  return db.$transaction(async (tx) => {
    const evidence = await tx.serviceEvidence.findFirst({
      where: { id: input.evidenceId, tenantId: input.tenantId },
    })
    if (!evidence) {
      throw new CatalogError(
        "SERVICE_EVIDENCE_UNAVAILABLE",
        "Service Evidence not found.",
      )
    }
    const status =
      input.status === "available"
        ? ServiceEvidenceUploadStatus.AVAILABLE
        : input.status === "failed"
          ? ServiceEvidenceUploadStatus.FAILED
          : input.status === "uploading"
            ? ServiceEvidenceUploadStatus.UPLOADING
            : ServiceEvidenceUploadStatus.QUEUED
    const updated = await tx.serviceEvidence.update({
      data: {
        assetReference: input.assetReference,
        failureReason: input.failureReason,
        safePublicAssetId: input.safePublicAssetId,
        safetyMetadata: input.safetyMetadata
          ? json(input.safetyMetadata)
          : undefined,
        uploadStatus: status,
        uploadedAt:
          status === ServiceEvidenceUploadStatus.AVAILABLE ? new Date() : undefined,
      },
      where: { id: evidence.id },
    })
    await tx.serviceEvidenceAuditEvent.create({
      data: {
        action:
          status === ServiceEvidenceUploadStatus.AVAILABLE
            ? ServiceEvidenceAuditAction.UPLOAD_SUCCEEDED
            : status === ServiceEvidenceUploadStatus.FAILED
              ? ServiceEvidenceAuditAction.UPLOAD_FAILED
              : status === ServiceEvidenceUploadStatus.UPLOADING
                ? ServiceEvidenceAuditAction.UPLOAD_STARTED
                : ServiceEvidenceAuditAction.UPLOAD_QUEUED,
        actorUserId: input.actorUserId,
        evidenceId: evidence.id,
        reason: input.failureReason,
      },
    })
    return updated
  })
}

export async function publishServiceEvidence(
  db: PrismaClient,
  input: {
    actorUserId: string
    evidenceId: string
    tenantId: string
  },
) {
  return db.$transaction(async (tx) => {
    const evidence = await tx.serviceEvidence.findFirst({
      where: { id: input.evidenceId, tenantId: input.tenantId },
    })
    if (
      !evidence ||
      evidence.uploadStatus !== ServiceEvidenceUploadStatus.AVAILABLE ||
      !evidence.safePublicAssetId ||
      !evidence.safetyMetadata
    ) {
      throw new CatalogError(
        "SERVICE_EVIDENCE_UNAVAILABLE",
        "Only an available, safety-reviewed asset can be published.",
      )
    }
    const tracking = await tx.customerTrackingAccess.findFirst({
      where: {
        serviceJobId: evidence.serviceJobId,
        status: "ACTIVE",
        tenantId: input.tenantId,
      },
    })
    if (!tracking) {
      throw new CatalogError(
        "SERVICE_EVIDENCE_UNAVAILABLE",
        "Publishing Evidence requires active customer tracking scope.",
      )
    }
    const updated = await tx.serviceEvidence.update({
      data: {
        publishedAt: new Date(),
        visibility: ServiceEvidenceVisibility.PUBLISHED,
      },
      where: { id: evidence.id },
    })
    await tx.serviceEvidenceAuditEvent.create({
      data: {
        action: ServiceEvidenceAuditAction.PUBLISHED,
        actorUserId: input.actorUserId,
        evidenceId: evidence.id,
      },
    })
    return updated
  })
}

export async function revokeServiceEvidencePublication(
  db: PrismaClient,
  input: {
    actorUserId: string
    evidenceId: string
    reason: string
    tenantId: string
  },
) {
  return db.$transaction(async (tx) => {
    const evidence = await tx.serviceEvidence.findFirst({
      where: { id: input.evidenceId, tenantId: input.tenantId },
    })
    if (!evidence) {
      throw new CatalogError(
        "SERVICE_EVIDENCE_UNAVAILABLE",
        "Service Evidence not found.",
      )
    }
    const updated = await tx.serviceEvidence.update({
      data: {
        revokedAt: new Date(),
        uploadStatus: ServiceEvidenceUploadStatus.REVOKED,
        visibility: ServiceEvidenceVisibility.REVOKED,
      },
      where: { id: evidence.id },
    })
    await tx.serviceEvidenceAuditEvent.create({
      data: {
        action: ServiceEvidenceAuditAction.PUBLICATION_REVOKED,
        actorUserId: input.actorUserId,
        evidenceId: evidence.id,
        reason: input.reason.trim(),
      },
    })
    return updated
  })
}

export async function getServiceJob(
  db: PrismaClient,
  input: { jobId: string; tenantId: string },
) {
  const job = await db.serviceJob.findFirst({
    include: jobGraph,
    where: { id: input.jobId, tenantId: input.tenantId },
  })
  return job ? serializeJob(job) : null
}

export async function listServiceWorkQueue(
  db: PrismaClient,
  input: {
    assigneeUserId?: string
    due?: "all" | "overdue" | "today"
    limit?: number
    priority?: "normal" | "urgent"
    storeId?: string
    tenantId: string
  },
) {
  const now = new Date()
  const endOfToday = new Date(now)
  endOfToday.setHours(23, 59, 59, 999)
  const jobs = await db.serviceJob.findMany({
    include: jobGraph,
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    take: Math.min(Math.max(input.limit ?? 100, 1), 200),
    where: {
      currentAssigneeUserId: input.assigneeUserId,
      dueCommitments:
        input.due && input.due !== "all"
          ? {
              some: {
                promisedAt:
                  input.due === "overdue"
                    ? { lt: now }
                    : { gte: now, lte: endOfToday },
                supersededAt: null,
              },
            }
          : undefined,
      priority:
        input.priority === "urgent"
          ? ServicePriority.URGENT
          : input.priority === "normal"
            ? ServicePriority.NORMAL
            : undefined,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
  return jobs
    .map(serializeJob)
    .filter((job) => !["cancelled", "completed"].includes(job.summary))
}

export async function listServiceAssignees(
  db: PrismaClient,
  input: { tenantId: string },
) {
  const memberships = await db.membership.findMany({
    include: { user: true },
    orderBy: { createdAt: "asc" },
    where: {
      status: MembershipStatus.ACTIVE,
      tenantId: input.tenantId,
    },
  })
  return memberships.map((membership) => ({
    email: membership.user.email,
    id: membership.userId,
    name:
      membership.user.displayName ||
      membership.user.name ||
      membership.user.email,
    role: membership.role,
  }))
}
