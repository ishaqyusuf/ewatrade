import { randomBytes } from "node:crypto"

import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import {
  CatalogItemKind as DurableCatalogItemKind,
  ServiceJobEventType as DurableServiceJobEventType,
  ServiceJobStatus as DurableServiceJobStatus,
  ServiceNotificationChannel as DurableServiceNotificationChannel,
  ServiceNotificationIntentStatus as DurableServiceNotificationIntentStatus,
  ServiceNotificationIntentType as DurableServiceNotificationIntentType,
  ServiceRequestStatus as DurableServiceRequestStatus,
} from "../../generated/prisma/enums"
import {
  type RetailOpsPaymentMethod,
  createRetailOpsCatalogSale,
} from "./retail-ops-sales"

type RetailOpsServiceJobStatus =
  | "cancelled"
  | "completed"
  | "in_progress"
  | "ready"
  | "received"

export type RetailOpsServiceRequestStatus =
  | "cancelled"
  | "confirmed"
  | "converted"
  | "pending"
  | "rejected"

export type RetailOpsServiceJob = {
  assignedUserId: string | null
  cancelledAt: string | null
  completedAt: string | null
  createdAt: string
  customer: {
    email: string | null
    name: string | null
    phone: string | null
  }
  dueAt: string | null
  events: Array<{
    actorUserId: string | null
    fromStatus: RetailOpsServiceJobStatus | null
    happenedAt: string
    id: string
    note: string | null
    revisedDueAt: string | null
    toStatus: RetailOpsServiceJobStatus | null
    type:
      | "assigned"
      | "created"
      | "delayed"
      | "due_date_changed"
      | "evidence_added"
      | "note_added"
      | "status_changed"
  }>
  evidence: Array<{
    addedAt: string
    id: string
    label: string | null
    mediaType: string | null
    url: string
  }>
  id: string
  lines: Array<{
    cancelledAt: string | null
    id: string
    itemId: string
    itemName: string
    orderItemId: string
    quantity: number
    totalMinor: number
    unitPriceMinor: number
    variantId: string | null
    variantName: string | null
  }>
  order: {
    currencyCode: string
    id: string
    orderNumber: string
    paymentStatus: string
    totalMinor: number
  }
  status: RetailOpsServiceJobStatus
  trackingToken: string
  updatedAt: string
}

export type RetailOpsServiceRequest = {
  createdAt: string
  currencyCode: string
  customerEmail: string | null
  customerName: string
  customerPhone: string | null
  id: string
  lines: Array<{
    id: string
    itemId: string
    itemName: string
    quantity: number
    totalMinor: number
    unitPriceMinor: number
    variantId: string | null
    variantName: string | null
  }>
  notes: string | null
  status: RetailOpsServiceRequestStatus
  totalMinor: number
  trackingToken: string
}

type RetailOpsServiceOperationsErrorCode =
  | "INVALID_STATUS_TRANSITION"
  | "REQUEST_ALREADY_CONVERTED"
  | "SERVICE_ITEM_NOT_FOUND"
  | "SERVICE_ASSIGNEE_NOT_FOUND"
  | "SERVICE_JOB_NOT_FOUND"
  | "SERVICE_REQUEST_LINK_NOT_FOUND"
  | "SERVICE_REQUEST_NOT_FOUND"
  | "STORE_NOT_FOUND"

export class RetailOpsServiceOperationsError extends Error {
  code: RetailOpsServiceOperationsErrorCode

  constructor(code: RetailOpsServiceOperationsErrorCode, message: string) {
    super(message)
    this.name = "RetailOpsServiceOperationsError"
    this.code = code
  }
}

function createToken() {
  return randomBytes(18).toString("base64url")
}

function fromDurableServiceJobStatus(
  status: string,
): RetailOpsServiceJobStatus {
  switch (status) {
    case DurableServiceJobStatus.IN_PROGRESS:
      return "in_progress"
    case DurableServiceJobStatus.READY:
      return "ready"
    case DurableServiceJobStatus.COMPLETED:
      return "completed"
    case DurableServiceJobStatus.CANCELLED:
      return "cancelled"
    default:
      return "received"
  }
}

function toDurableServiceJobStatus(
  status: RetailOpsServiceJobStatus,
): DurableServiceJobStatus {
  switch (status) {
    case "in_progress":
      return DurableServiceJobStatus.IN_PROGRESS
    case "ready":
      return DurableServiceJobStatus.READY
    case "completed":
      return DurableServiceJobStatus.COMPLETED
    case "cancelled":
      return DurableServiceJobStatus.CANCELLED
    default:
      return DurableServiceJobStatus.RECEIVED
  }
}

function fromDurableServiceRequestStatus(
  status: string,
): RetailOpsServiceRequestStatus {
  switch (status) {
    case DurableServiceRequestStatus.CONFIRMED:
      return "confirmed"
    case DurableServiceRequestStatus.CONVERTED:
      return "converted"
    case DurableServiceRequestStatus.REJECTED:
      return "rejected"
    case DurableServiceRequestStatus.CANCELLED:
      return "cancelled"
    default:
      return "pending"
  }
}

function toDurableServiceRequestStatus(
  status: Exclude<RetailOpsServiceRequestStatus, "converted">,
): DurableServiceRequestStatus {
  switch (status) {
    case "confirmed":
      return DurableServiceRequestStatus.CONFIRMED
    case "rejected":
      return DurableServiceRequestStatus.REJECTED
    case "cancelled":
      return DurableServiceRequestStatus.CANCELLED
    default:
      return DurableServiceRequestStatus.PENDING
  }
}

function fromDurableServiceJobEventType(
  type: string,
): RetailOpsServiceJob["events"][number]["type"] {
  switch (type) {
    case DurableServiceJobEventType.ASSIGNED:
      return "assigned"
    case DurableServiceJobEventType.STATUS_CHANGED:
      return "status_changed"
    case DurableServiceJobEventType.DELAYED:
      return "delayed"
    case DurableServiceJobEventType.DUE_DATE_CHANGED:
      return "due_date_changed"
    case DurableServiceJobEventType.NOTE_ADDED:
      return "note_added"
    case DurableServiceJobEventType.EVIDENCE_ADDED:
      return "evidence_added"
    default:
      return "created"
  }
}

const serviceJobSelect = {
  assignedUserId: true,
  cancelledAt: true,
  completedAt: true,
  createdAt: true,
  dueAt: true,
  events: {
    orderBy: [{ happenedAt: "asc" as const }, { createdAt: "asc" as const }],
    select: {
      actorUserId: true,
      fromStatus: true,
      happenedAt: true,
      id: true,
      note: true,
      revisedDueAt: true,
      toStatus: true,
      type: true,
    },
  },
  evidence: {
    orderBy: [{ addedAt: "asc" as const }, { createdAt: "asc" as const }],
    select: {
      addedAt: true,
      id: true,
      label: true,
      mediaType: true,
      url: true,
    },
  },
  id: true,
  lines: {
    orderBy: {
      createdAt: "asc" as const,
    },
    select: {
      cancelledAt: true,
      id: true,
      nameSnapshot: true,
      orderItemId: true,
      productId: true,
      productVariantId: true,
      quantity: true,
      totalPriceMinor: true,
      unitPriceMinor: true,
      variantNameSnapshot: true,
    },
  },
  order: {
    select: {
      currencyCode: true,
      customerEmail: true,
      customerName: true,
      customerPhone: true,
      id: true,
      orderNumber: true,
      paymentStatus: true,
      totalMinor: true,
    },
  },
  status: true,
  trackingToken: true,
  updatedAt: true,
} satisfies Prisma.ServiceJobSelect

function mapServiceJob(
  job: Prisma.ServiceJobGetPayload<{ select: typeof serviceJobSelect }>,
): RetailOpsServiceJob {
  return {
    assignedUserId: job.assignedUserId,
    cancelledAt: job.cancelledAt?.toISOString() ?? null,
    completedAt: job.completedAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
    customer: {
      email: job.order.customerEmail,
      name: job.order.customerName,
      phone: job.order.customerPhone,
    },
    dueAt: job.dueAt?.toISOString() ?? null,
    events: job.events.map((event) => ({
      actorUserId: event.actorUserId,
      fromStatus: event.fromStatus
        ? fromDurableServiceJobStatus(event.fromStatus)
        : null,
      happenedAt: event.happenedAt.toISOString(),
      id: event.id,
      note: event.note,
      revisedDueAt: event.revisedDueAt?.toISOString() ?? null,
      toStatus: event.toStatus
        ? fromDurableServiceJobStatus(event.toStatus)
        : null,
      type: fromDurableServiceJobEventType(event.type),
    })),
    evidence: job.evidence.map((evidence) => ({
      addedAt: evidence.addedAt.toISOString(),
      id: evidence.id,
      label: evidence.label,
      mediaType: evidence.mediaType,
      url: evidence.url,
    })),
    id: job.id,
    lines: job.lines.map((line) => ({
      cancelledAt: line.cancelledAt?.toISOString() ?? null,
      id: line.id,
      itemId: line.productId,
      itemName: line.nameSnapshot,
      orderItemId: line.orderItemId,
      quantity: line.quantity,
      totalMinor: line.totalPriceMinor,
      unitPriceMinor: line.unitPriceMinor,
      variantId: line.productVariantId,
      variantName: line.variantNameSnapshot,
    })),
    order: {
      currencyCode: job.order.currencyCode,
      id: job.order.id,
      orderNumber: job.order.orderNumber,
      paymentStatus: job.order.paymentStatus,
      totalMinor: job.order.totalMinor,
    },
    status: fromDurableServiceJobStatus(job.status),
    trackingToken: job.trackingToken,
    updatedAt: job.updatedAt.toISOString(),
  }
}

const serviceRequestSelect = {
  createdAt: true,
  currencyCode: true,
  customerEmail: true,
  customerName: true,
  customerPhone: true,
  id: true,
  lines: {
    orderBy: {
      createdAt: "asc" as const,
    },
    select: {
      id: true,
      nameSnapshot: true,
      productId: true,
      productVariantId: true,
      quantity: true,
      totalPriceMinor: true,
      unitPriceMinor: true,
      variantNameSnapshot: true,
    },
  },
  notes: true,
  status: true,
  totalMinor: true,
  trackingToken: true,
} satisfies Prisma.ServiceRequestSelect

function mapServiceRequest(
  request: Prisma.ServiceRequestGetPayload<{
    select: typeof serviceRequestSelect
  }>,
): RetailOpsServiceRequest {
  return {
    createdAt: request.createdAt.toISOString(),
    currencyCode: request.currencyCode,
    customerEmail: request.customerEmail,
    customerName: request.customerName,
    customerPhone: request.customerPhone,
    id: request.id,
    lines: request.lines.map((line) => ({
      id: line.id,
      itemId: line.productId,
      itemName: line.nameSnapshot,
      quantity: line.quantity,
      totalMinor: line.totalPriceMinor,
      unitPriceMinor: line.unitPriceMinor,
      variantId: line.productVariantId,
      variantName: line.variantNameSnapshot,
    })),
    notes: request.notes,
    status: fromDurableServiceRequestStatus(request.status),
    totalMinor: request.totalMinor,
    trackingToken: request.trackingToken,
  }
}

export async function listRetailOpsServiceJobs(
  db: PrismaClient,
  input: {
    limit?: number
    status?: RetailOpsServiceJobStatus
    storeId: string
    tenantId: string
  },
): Promise<RetailOpsServiceJob[]> {
  const jobs = await db.serviceJob.findMany({
    where: {
      ...(input.status
        ? { status: toDurableServiceJobStatus(input.status) }
        : {}),
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
    orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
    take: Math.min(Math.max(input.limit ?? 100, 1), 250),
    select: serviceJobSelect,
  })

  return jobs.map(mapServiceJob)
}

export async function getPublicRetailOpsServiceTracking(
  db: PrismaClient,
  input: {
    trackingToken: string
  },
) {
  const job = await db.serviceJob.findUnique({
    where: {
      trackingToken: input.trackingToken,
    },
    select: {
      createdAt: true,
      dueAt: true,
      events: {
        where: {
          type: {
            in: [
              DurableServiceJobEventType.CREATED,
              DurableServiceJobEventType.DELAYED,
              DurableServiceJobEventType.DUE_DATE_CHANGED,
              DurableServiceJobEventType.STATUS_CHANGED,
            ],
          },
        },
        orderBy: [{ happenedAt: "asc" }, { createdAt: "asc" }],
        select: {
          happenedAt: true,
          revisedDueAt: true,
          toStatus: true,
          type: true,
        },
      },
      lines: {
        orderBy: {
          createdAt: "asc",
        },
        select: {
          cancelledAt: true,
          nameSnapshot: true,
          quantity: true,
          totalPriceMinor: true,
          unitPriceMinor: true,
          variantNameSnapshot: true,
        },
      },
      order: {
        select: {
          currencyCode: true,
          orderNumber: true,
          paymentStatus: true,
          totalMinor: true,
        },
      },
      status: true,
      store: {
        select: {
          name: true,
          slug: true,
        },
      },
      updatedAt: true,
    },
  })

  if (!job) {
    throw new RetailOpsServiceOperationsError(
      "SERVICE_JOB_NOT_FOUND",
      "Service job not found.",
    )
  }
  const status = fromDurableServiceJobStatus(job.status)
  const guidance =
    status === "ready"
      ? "Your service is ready. Contact the business to confirm pickup or delivery."
      : status === "completed"
        ? "The service is complete. Contact the business if collection or delivery still needs to be arranged."
        : status === "cancelled"
          ? "This service job was cancelled. Contact the business if you need more information."
          : "The business is still working on this service and will confirm pickup or delivery when it is ready."

  return {
    business: job.store,
    createdAt: job.createdAt.toISOString(),
    dueAt: job.dueAt?.toISOString() ?? null,
    guidance,
    items: job.lines.map((line) => ({
      cancelled: Boolean(line.cancelledAt),
      itemName: line.nameSnapshot,
      quantity: line.quantity,
      totalMinor: line.totalPriceMinor,
      unitPriceMinor: line.unitPriceMinor,
      variantName: line.variantNameSnapshot,
    })),
    payment: {
      currencyCode: job.order.currencyCode,
      status: job.order.paymentStatus,
      totalMinor: job.order.totalMinor,
    },
    reference: job.order.orderNumber,
    status,
    timeline: job.events.map((event) => ({
      happenedAt: event.happenedAt.toISOString(),
      revisedDueAt: event.revisedDueAt?.toISOString() ?? null,
      status: event.toStatus
        ? fromDurableServiceJobStatus(event.toStatus)
        : null,
      type: fromDurableServiceJobEventType(event.type),
    })),
    updatedAt: job.updatedAt.toISOString(),
  }
}

const ALLOWED_JOB_TRANSITIONS: Record<
  RetailOpsServiceJobStatus,
  RetailOpsServiceJobStatus[]
> = {
  cancelled: [],
  completed: [],
  in_progress: ["ready", "completed", "cancelled"],
  ready: ["in_progress", "completed", "cancelled"],
  received: ["in_progress", "ready", "completed", "cancelled"],
}

export async function updateRetailOpsServiceJobStatus(
  db: PrismaClient,
  input: {
    actorUserId: string
    jobId: string
    note?: string
    status: RetailOpsServiceJobStatus
    storeId: string
    tenantId: string
  },
): Promise<RetailOpsServiceJob> {
  return db.$transaction(async (tx) => {
    const current = await tx.serviceJob.findFirst({
      where: {
        id: input.jobId,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
      select: {
        id: true,
        status: true,
      },
    })

    if (!current) {
      throw new RetailOpsServiceOperationsError(
        "SERVICE_JOB_NOT_FOUND",
        "Service job not found.",
      )
    }

    const currentStatus = fromDurableServiceJobStatus(current.status)
    if (
      currentStatus !== input.status &&
      !ALLOWED_JOB_TRANSITIONS[currentStatus].includes(input.status)
    ) {
      throw new RetailOpsServiceOperationsError(
        "INVALID_STATUS_TRANSITION",
        `A service job cannot move from ${currentStatus} to ${input.status}.`,
      )
    }

    if (currentStatus !== input.status) {
      const changedAt = new Date()
      await tx.serviceJob.update({
        where: {
          id: current.id,
        },
        data: {
          cancelledAt:
            input.status === "cancelled"
              ? changedAt
              : currentStatus === "cancelled"
                ? null
                : undefined,
          completedAt:
            input.status === "completed"
              ? changedAt
              : currentStatus === "completed"
                ? null
                : undefined,
          status: toDurableServiceJobStatus(input.status),
        },
        select: {
          id: true,
        },
      })
      await tx.serviceJobEvent.create({
        data: {
          actorUserId: input.actorUserId,
          fromStatus: current.status,
          happenedAt: changedAt,
          note: input.note?.trim() || null,
          serviceJobId: current.id,
          toStatus: toDurableServiceJobStatus(input.status),
          type: DurableServiceJobEventType.STATUS_CHANGED,
        },
        select: {
          id: true,
        },
      })
    } else if (input.note?.trim()) {
      await tx.serviceJobEvent.create({
        data: {
          actorUserId: input.actorUserId,
          note: input.note.trim(),
          serviceJobId: current.id,
          type: DurableServiceJobEventType.NOTE_ADDED,
        },
        select: {
          id: true,
        },
      })
    }

    const updated = await tx.serviceJob.findUniqueOrThrow({
      where: {
        id: current.id,
      },
      select: serviceJobSelect,
    })
    return mapServiceJob(updated)
  })
}

export async function assignRetailOpsServiceJob(
  db: PrismaClient,
  input: {
    actorUserId: string
    assignedUserId?: string | null
    jobId: string
    note?: string
    storeId: string
    tenantId: string
  },
): Promise<RetailOpsServiceJob> {
  return db.$transaction(async (tx) => {
    const assignedUserId =
      input.assignedUserId === undefined
        ? input.actorUserId
        : input.assignedUserId
    const [job, assignee] = await Promise.all([
      tx.serviceJob.findFirst({
        where: {
          id: input.jobId,
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
        select: {
          assignedUserId: true,
          id: true,
          status: true,
        },
      }),
      assignedUserId
        ? tx.membership.findFirst({
            where: {
              status: "ACTIVE",
              tenantId: input.tenantId,
              userId: assignedUserId,
            },
            select: {
              user: {
                select: {
                  displayName: true,
                  email: true,
                  name: true,
                },
              },
              userId: true,
            },
          })
        : Promise.resolve(null),
    ])

    if (!job) {
      throw new RetailOpsServiceOperationsError(
        "SERVICE_JOB_NOT_FOUND",
        "Service job not found.",
      )
    }
    const currentStatus = fromDurableServiceJobStatus(job.status)
    if (currentStatus === "completed" || currentStatus === "cancelled") {
      throw new RetailOpsServiceOperationsError(
        "INVALID_STATUS_TRANSITION",
        `A ${currentStatus} service job cannot be reassigned.`,
      )
    }
    if (assignedUserId && !assignee) {
      throw new RetailOpsServiceOperationsError(
        "SERVICE_ASSIGNEE_NOT_FOUND",
        "Active service assignee not found for this business.",
      )
    }
    if (job.assignedUserId === assignedUserId) {
      const unchanged = await tx.serviceJob.findUniqueOrThrow({
        where: {
          id: job.id,
        },
        select: serviceJobSelect,
      })
      return mapServiceJob(unchanged)
    }

    const happenedAt = new Date()
    await tx.serviceJob.update({
      where: {
        id: job.id,
      },
      data: {
        assignedUserId,
      },
      select: {
        id: true,
      },
    })
    const assigneeName = assignee
      ? assignee.user.displayName ||
        assignee.user.name ||
        assignee.user.email ||
        "staff member"
      : null
    await tx.serviceJobEvent.create({
      data: {
        actorUserId: input.actorUserId,
        happenedAt,
        metadata: {
          assignedUserId,
          previousAssignedUserId: job.assignedUserId,
        },
        note:
          input.note?.trim() ||
          (assigneeName
            ? `Assigned to ${assigneeName}.`
            : "Service job unassigned."),
        serviceJobId: job.id,
        type: DurableServiceJobEventType.ASSIGNED,
      },
      select: {
        id: true,
      },
    })

    const updated = await tx.serviceJob.findUniqueOrThrow({
      where: {
        id: job.id,
      },
      select: serviceJobSelect,
    })
    return mapServiceJob(updated)
  })
}

export async function delayRetailOpsServiceJob(
  db: PrismaClient,
  input: {
    actorUserId: string
    dueAt: Date
    jobId: string
    note: string
    storeId: string
    tenantId: string
  },
) {
  return db.$transaction(async (tx) => {
    const job = await tx.serviceJob.findFirst({
      where: {
        id: input.jobId,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
      select: {
        id: true,
        status: true,
        order: {
          select: {
            customerEmail: true,
            customerName: true,
            customerPhone: true,
            orderNumber: true,
          },
        },
      },
    })

    if (!job) {
      throw new RetailOpsServiceOperationsError(
        "SERVICE_JOB_NOT_FOUND",
        "Service job not found.",
      )
    }
    const currentStatus = fromDurableServiceJobStatus(job.status)
    if (currentStatus === "completed" || currentStatus === "cancelled") {
      throw new RetailOpsServiceOperationsError(
        "INVALID_STATUS_TRANSITION",
        `A ${currentStatus} service job cannot be delayed.`,
      )
    }

    await tx.serviceJob.update({
      where: {
        id: job.id,
      },
      data: {
        dueAt: input.dueAt,
      },
      select: {
        id: true,
      },
    })
    await tx.serviceJobEvent.create({
      data: {
        actorUserId: input.actorUserId,
        happenedAt: new Date(),
        note: input.note.trim(),
        revisedDueAt: input.dueAt,
        serviceJobId: job.id,
        type: DurableServiceJobEventType.DELAYED,
      },
      select: {
        id: true,
      },
    })
    const notificationIntent = await tx.serviceNotificationIntent.create({
      data: {
        channel: DurableServiceNotificationChannel.MANUAL,
        customerEmail: job.order.customerEmail,
        customerPhone: job.order.customerPhone,
        manualCopy: `${job.order.customerName ?? "Customer"}, service job ${job.order.orderNumber} is delayed. New due date: ${input.dueAt.toISOString()}. ${input.note.trim()}`,
        serviceJobId: job.id,
        status: DurableServiceNotificationIntentStatus.PENDING,
        storeId: input.storeId,
        tenantId: input.tenantId,
        type: DurableServiceNotificationIntentType.DELAY,
      },
      select: {
        createdAt: true,
        id: true,
        manualCopy: true,
        status: true,
      },
    })

    const updated = await tx.serviceJob.findUniqueOrThrow({
      where: {
        id: job.id,
      },
      select: serviceJobSelect,
    })
    return {
      ...mapServiceJob(updated),
      notificationIntent,
    }
  })
}

export async function addRetailOpsServiceJobEvidence(
  db: PrismaClient,
  input: {
    actorUserId: string
    jobId: string
    label?: string
    mediaType?: string
    storeId: string
    tenantId: string
    url: string
  },
): Promise<RetailOpsServiceJob> {
  return db.$transaction(async (tx) => {
    const job = await tx.serviceJob.findFirst({
      where: {
        id: input.jobId,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
      select: {
        id: true,
      },
    })

    if (!job) {
      throw new RetailOpsServiceOperationsError(
        "SERVICE_JOB_NOT_FOUND",
        "Service job not found.",
      )
    }

    const evidence = await tx.serviceJobEvidence.create({
      data: {
        actorUserId: input.actorUserId,
        label: input.label?.trim() || null,
        mediaType: input.mediaType?.trim() || null,
        serviceJobId: job.id,
        url: input.url.trim(),
      },
      select: {
        id: true,
      },
    })
    await tx.serviceJobEvent.create({
      data: {
        actorUserId: input.actorUserId,
        metadata: {
          evidenceId: evidence.id,
        } as Prisma.InputJsonValue,
        note: input.label?.trim() || null,
        serviceJobId: job.id,
        type: DurableServiceJobEventType.EVIDENCE_ADDED,
      },
      select: {
        id: true,
      },
    })

    const updated = await tx.serviceJob.findUniqueOrThrow({
      where: {
        id: job.id,
      },
      select: serviceJobSelect,
    })
    return mapServiceJob(updated)
  })
}

export async function queueRetailOpsServiceReadyNotification(
  db: PrismaClient,
  input: {
    jobId: string
    storeId: string
    tenantId: string
  },
) {
  const job = await db.serviceJob.findFirst({
    where: {
      id: input.jobId,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
    select: {
      id: true,
      order: {
        select: {
          customerEmail: true,
          customerName: true,
          customerPhone: true,
          orderNumber: true,
        },
      },
    },
  })

  if (!job) {
    throw new RetailOpsServiceOperationsError(
      "SERVICE_JOB_NOT_FOUND",
      "Service job not found.",
    )
  }

  return db.serviceNotificationIntent.upsert({
    where: {
      dedupeKey: `service-ready:${job.id}`,
    },
    create: {
      channel: DurableServiceNotificationChannel.MANUAL,
      customerEmail: job.order.customerEmail,
      customerPhone: job.order.customerPhone,
      dedupeKey: `service-ready:${job.id}`,
      manualCopy: `${job.order.customerName ?? "Customer"}, service job ${job.order.orderNumber} is ready.`,
      serviceJobId: job.id,
      status: DurableServiceNotificationIntentStatus.PENDING,
      storeId: input.storeId,
      tenantId: input.tenantId,
      type: DurableServiceNotificationIntentType.READY,
    },
    update: {},
    select: {
      createdAt: true,
      id: true,
      manualCopy: true,
      status: true,
    },
  })
}

export async function createRetailOpsServiceRequestLink(
  db: PrismaClient,
  input: {
    actorUserId: string
    label: string
    storeId: string
    tenantId: string
  },
) {
  const store = await db.store.findFirst({
    where: {
      id: input.storeId,
      status: { not: "ARCHIVED" },
      tenantId: input.tenantId,
    },
    select: {
      id: true,
    },
  })
  if (!store) {
    throw new RetailOpsServiceOperationsError(
      "STORE_NOT_FOUND",
      "Store not found.",
    )
  }

  return db.serviceRequestLink.create({
    data: {
      createdByUserId: input.actorUserId,
      label: input.label.trim(),
      storeId: input.storeId,
      tenantId: input.tenantId,
      token: createToken(),
    },
    select: {
      createdAt: true,
      disabledAt: true,
      id: true,
      label: true,
      token: true,
    },
  })
}

export async function listRetailOpsServiceRequestLinks(
  db: PrismaClient,
  input: {
    storeId: string
    tenantId: string
  },
) {
  return db.serviceRequestLink.findMany({
    where: {
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      createdAt: true,
      disabledAt: true,
      id: true,
      label: true,
      token: true,
    },
  })
}

export async function disableRetailOpsServiceRequestLink(
  db: PrismaClient,
  input: {
    linkId: string
    storeId: string
    tenantId: string
  },
) {
  const result = await db.serviceRequestLink.updateMany({
    where: {
      disabledAt: null,
      id: input.linkId,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
    data: {
      disabledAt: new Date(),
    },
  })
  if (result.count !== 1) {
    throw new RetailOpsServiceOperationsError(
      "SERVICE_REQUEST_LINK_NOT_FOUND",
      "Service request link not found.",
    )
  }
}

export async function getPublicRetailOpsServiceRequestLink(
  db: PrismaClient,
  input: {
    token: string
  },
) {
  const link = await db.serviceRequestLink.findFirst({
    where: {
      disabledAt: null,
      token: input.token,
    },
    select: {
      id: true,
      label: true,
      store: {
        select: {
          currencyCode: true,
          id: true,
          name: true,
          slug: true,
        },
      },
      tenant: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
      token: true,
    },
  })

  if (!link) {
    throw new RetailOpsServiceOperationsError(
      "SERVICE_REQUEST_LINK_NOT_FOUND",
      "Service request link not found.",
    )
  }

  const items = await db.product.findMany({
    where: {
      kind: DurableCatalogItemKind.SERVICE,
      status: { not: "ARCHIVED" },
      storeId: link.store.id,
      tenantId: link.tenant.id,
    },
    orderBy: {
      name: "asc",
    },
    select: {
      category: true,
      description: true,
      id: true,
      name: true,
      variants: {
        where: {
          isActive: true,
        },
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
        select: {
          id: true,
          isDefault: true,
          name: true,
          priceMinor: true,
        },
      },
    },
  })

  return {
    ...link,
    items,
  }
}

export async function createPublicRetailOpsServiceRequest(
  db: PrismaClient,
  input: {
    customerEmail?: string
    customerName: string
    customerPhone?: string
    lines: Array<{
      catalogItemVariantId: string
      quantity: number
    }>
    notes?: string
    token: string
  },
): Promise<RetailOpsServiceRequest> {
  return db.$transaction(async (tx) => {
    const link = await tx.serviceRequestLink.findFirst({
      where: {
        disabledAt: null,
        token: input.token,
      },
      select: {
        id: true,
        store: {
          select: {
            currencyCode: true,
            id: true,
          },
        },
        tenantId: true,
      },
    })
    if (!link) {
      throw new RetailOpsServiceOperationsError(
        "SERVICE_REQUEST_LINK_NOT_FOUND",
        "Service request link not found.",
      )
    }

    const linesByVariant = new Map<string, number>()
    for (const line of input.lines) {
      const quantity = Math.trunc(line.quantity)
      if (quantity <= 0) continue
      linesByVariant.set(
        line.catalogItemVariantId,
        (linesByVariant.get(line.catalogItemVariantId) ?? 0) + quantity,
      )
    }
    const variants = await tx.productVariant.findMany({
      where: {
        id: {
          in: [...linesByVariant.keys()],
        },
        isActive: true,
        product: {
          kind: DurableCatalogItemKind.SERVICE,
          status: { not: "ARCHIVED" },
          storeId: link.store.id,
          tenantId: link.tenantId,
        },
      },
      select: {
        id: true,
        name: true,
        priceMinor: true,
        product: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    if (variants.length === 0 || variants.length !== linesByVariant.size) {
      throw new RetailOpsServiceOperationsError(
        "SERVICE_ITEM_NOT_FOUND",
        "One or more service items are unavailable.",
      )
    }

    const preparedLines = variants.map((variant) => {
      const quantity = linesByVariant.get(variant.id) ?? 0
      return {
        quantity,
        totalMinor: variant.priceMinor * quantity,
        variant,
      }
    })
    const request = await tx.serviceRequest.create({
      data: {
        currencyCode: link.store.currencyCode,
        customerEmail: input.customerEmail?.trim() || null,
        customerName: input.customerName.trim(),
        customerPhone: input.customerPhone?.trim() || null,
        notes: input.notes?.trim() || null,
        requestLinkId: link.id,
        status: DurableServiceRequestStatus.PENDING,
        storeId: link.store.id,
        tenantId: link.tenantId,
        totalMinor: preparedLines.reduce(
          (total, line) => total + line.totalMinor,
          0,
        ),
        trackingToken: createToken(),
        lines: {
          create: preparedLines.map((line) => ({
            nameSnapshot: line.variant.product.name,
            productId: line.variant.product.id,
            productVariantId: line.variant.id,
            quantity: line.quantity,
            totalPriceMinor: line.totalMinor,
            unitPriceMinor: line.variant.priceMinor,
            variantNameSnapshot: line.variant.name,
          })),
        },
      },
      select: serviceRequestSelect,
    })

    return mapServiceRequest(request)
  })
}

export async function listRetailOpsServiceRequests(
  db: PrismaClient,
  input: {
    limit?: number
    status?: RetailOpsServiceRequestStatus
    storeId: string
    tenantId: string
  },
): Promise<RetailOpsServiceRequest[]> {
  const requests = await db.serviceRequest.findMany({
    where: {
      ...(input.status
        ? {
            status:
              input.status === "converted"
                ? DurableServiceRequestStatus.CONVERTED
                : toDurableServiceRequestStatus(input.status),
          }
        : {}),
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: Math.min(Math.max(input.limit ?? 100, 1), 250),
    select: serviceRequestSelect,
  })

  return requests.map(mapServiceRequest)
}

export async function updateRetailOpsServiceRequestStatus(
  db: PrismaClient,
  input: {
    requestId: string
    status: Exclude<RetailOpsServiceRequestStatus, "converted">
    storeId: string
    tenantId: string
  },
): Promise<RetailOpsServiceRequest> {
  const request = await db.serviceRequest.findFirst({
    where: {
      id: input.requestId,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
    select: {
      convertedOrderId: true,
      id: true,
    },
  })
  if (!request) {
    throw new RetailOpsServiceOperationsError(
      "SERVICE_REQUEST_NOT_FOUND",
      "Service request not found.",
    )
  }
  if (request.convertedOrderId) {
    throw new RetailOpsServiceOperationsError(
      "REQUEST_ALREADY_CONVERTED",
      "This service request has already been converted to an order.",
    )
  }

  const updated = await db.serviceRequest.update({
    where: {
      id: request.id,
    },
    data: {
      status: toDurableServiceRequestStatus(input.status),
    },
    select: serviceRequestSelect,
  })
  return mapServiceRequest(updated)
}

export async function convertRetailOpsServiceRequestToSale(
  db: PrismaClient,
  input: {
    actorUserId: string
    paymentMethod: RetailOpsPaymentMethod
    requestId: string
    serviceDueAt?: Date
    storeId: string
    tenantId: string
  },
) {
  const request = await db.serviceRequest.findFirst({
    where: {
      id: input.requestId,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
    select: {
      convertedOrderId: true,
      customerEmail: true,
      customerName: true,
      customerPhone: true,
      id: true,
      lines: {
        select: {
          productVariantId: true,
          quantity: true,
        },
      },
      notes: true,
      status: true,
    },
  })
  if (!request) {
    throw new RetailOpsServiceOperationsError(
      "SERVICE_REQUEST_NOT_FOUND",
      "Service request not found.",
    )
  }
  const sale = await createRetailOpsCatalogSale(db, {
    actorUserId: input.actorUserId,
    customerEmail: request.customerEmail ?? undefined,
    customerName: request.customerName,
    customerPhone: request.customerPhone ?? undefined,
    externalId: `service_request:${request.id}`,
    lines: request.lines.flatMap((line) =>
      line.productVariantId
        ? [
            {
              catalogItemVariantId: line.productVariantId,
              quantity: line.quantity,
            },
          ]
        : [],
    ),
    notes: request.notes ?? undefined,
    paymentMethod: input.paymentMethod,
    serviceDueAt: input.serviceDueAt,
    storeId: input.storeId,
    tenantId: input.tenantId,
  })

  await db.serviceRequest.updateMany({
    where: {
      convertedOrderId: null,
      id: request.id,
    },
    data: {
      convertedAt: new Date(),
      convertedOrderId: sale.order.id,
      status: DurableServiceRequestStatus.CONVERTED,
    },
  })

  return sale
}

export async function getRetailOpsServiceOperationsReport(
  db: PrismaClient,
  input: {
    from?: Date
    storeId: string
    tenantId: string
    to?: Date
  },
) {
  const createdAt =
    input.from || input.to
      ? {
          ...(input.from ? { gte: input.from } : {}),
          ...(input.to ? { lte: input.to } : {}),
        }
      : undefined
  const [jobs, requests] = await Promise.all([
    db.serviceJob.findMany({
      where: {
        ...(createdAt ? { createdAt } : {}),
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
      select: {
        assignedUserId: true,
        completedAt: true,
        createdAt: true,
        dueAt: true,
        events: {
          select: {
            actorUserId: true,
            type: true,
          },
        },
        lines: {
          select: {
            cancelledAt: true,
            nameSnapshot: true,
            orderItemId: true,
            productId: true,
            quantity: true,
            totalPriceMinor: true,
          },
        },
        order: {
          select: {
            paymentEvents: {
              where: {
                type: "REFUND",
              },
              select: {
                amountMinor: true,
                metadata: true,
              },
            },
            paymentStatus: true,
          },
        },
        status: true,
      },
    }),
    db.serviceRequest.groupBy({
      by: ["status"],
      where: {
        ...(createdAt ? { createdAt } : {}),
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
      _count: {
        _all: true,
      },
    }),
  ])
  const statusCounts = Object.fromEntries(
    ["received", "in_progress", "ready", "completed", "cancelled"].map(
      (status) => [status, 0],
    ),
  ) as Record<RetailOpsServiceJobStatus, number>
  for (const job of jobs) {
    statusCounts[fromDurableServiceJobStatus(job.status)] += 1
  }
  const now = new Date()
  const endOfToday = new Date(now)
  endOfToday.setHours(23, 59, 59, 999)
  const activeJobs = jobs.filter(
    (job) =>
      job.status !== DurableServiceJobStatus.COMPLETED &&
      job.status !== DurableServiceJobStatus.CANCELLED,
  )
  const completedJobs = jobs.filter(
    (
      job,
    ): job is typeof job & {
      completedAt: Date
    } => Boolean(job.completedAt),
  )
  const popularServiceMap = new Map<
    string,
    {
      itemName: string
      jobIds: Set<string>
      quantity: number
      revenueMinor: number
    }
  >()
  let revenueMinor = 0
  jobs.forEach((job, jobIndex) => {
    const refundsByOrderItemId = new Map<string, number>()
    for (const event of job.order.paymentEvents) {
      if (
        !event.metadata ||
        typeof event.metadata !== "object" ||
        Array.isArray(event.metadata)
      ) {
        continue
      }
      const orderItemId = event.metadata.orderItemId
      if (typeof orderItemId !== "string") continue
      refundsByOrderItemId.set(
        orderItemId,
        (refundsByOrderItemId.get(orderItemId) ?? 0) + event.amountMinor,
      )
    }
    for (const line of job.lines) {
      const netLineRevenueMinor = Math.max(
        line.totalPriceMinor -
          (refundsByOrderItemId.get(line.orderItemId) ?? 0),
        0,
      )
      revenueMinor += netLineRevenueMinor
      if (line.cancelledAt) continue
      const current = popularServiceMap.get(line.productId) ?? {
        itemName: line.nameSnapshot,
        jobIds: new Set<string>(),
        quantity: 0,
        revenueMinor: 0,
      }
      current.jobIds.add(String(jobIndex))
      current.quantity += line.quantity
      current.revenueMinor += netLineRevenueMinor
      popularServiceMap.set(line.productId, current)
    }
  })
  const staffActivityMap = new Map<
    string,
    { assignedJobCount: number; eventCount: number }
  >()
  for (const job of jobs) {
    if (job.assignedUserId) {
      const current = staffActivityMap.get(job.assignedUserId) ?? {
        assignedJobCount: 0,
        eventCount: 0,
      }
      current.assignedJobCount += 1
      staffActivityMap.set(job.assignedUserId, current)
    }
    for (const event of job.events) {
      if (!event.actorUserId) continue
      const current = staffActivityMap.get(event.actorUserId) ?? {
        assignedJobCount: 0,
        eventCount: 0,
      }
      current.eventCount += 1
      staffActivityMap.set(event.actorUserId, current)
    }
  }
  const serviceRequestCounts = Object.fromEntries(
    (
      ["pending", "confirmed", "converted", "rejected", "cancelled"] as const
    ).map((status) => [status, 0]),
  ) as Record<RetailOpsServiceRequestStatus, number>
  for (const request of requests) {
    serviceRequestCounts[fromDurableServiceRequestStatus(request.status)] =
      request._count._all
  }
  const requestCount = Object.values(serviceRequestCounts).reduce(
    (total, count) => total + count,
    0,
  )

  return {
    averageCompletionHours:
      completedJobs.length > 0
        ? completedJobs.reduce(
            (total, job) =>
              total +
              (job.completedAt.getTime() - job.createdAt.getTime()) / 3_600_000,
            0,
          ) / completedJobs.length
        : null,
    completedOnTimeCount: jobs.filter(
      (job) =>
        job.status === DurableServiceJobStatus.COMPLETED &&
        job.completedAt &&
        (!job.dueAt || job.completedAt <= job.dueAt),
    ).length,
    delayedJobCount: jobs.filter((job) =>
      job.events.some(
        (event) => event.type === DurableServiceJobEventType.DELAYED,
      ),
    ).length,
    dueTodayCount: activeJobs.filter(
      (job) => job.dueAt && job.dueAt >= now && job.dueAt <= endOfToday,
    ).length,
    jobCount: jobs.length,
    overdueCount: activeJobs.filter((job) => job.dueAt && job.dueAt < now)
      .length,
    paymentStatusCounts: jobs.reduce<Record<string, number>>((counts, job) => {
      counts[job.order.paymentStatus] =
        (counts[job.order.paymentStatus] ?? 0) + 1
      return counts
    }, {}),
    popularServices: [...popularServiceMap.entries()]
      .map(([itemId, service]) => ({
        itemId,
        itemName: service.itemName,
        jobCount: service.jobIds.size,
        quantity: service.quantity,
        revenueMinor: service.revenueMinor,
      }))
      .sort(
        (left, right) =>
          right.quantity - left.quantity ||
          right.revenueMinor - left.revenueMinor,
      )
      .slice(0, 10),
    requestConversionRate:
      requestCount > 0 ? serviceRequestCounts.converted / requestCount : null,
    revenueMinor,
    serviceRequestCounts,
    staffActivity: [...staffActivityMap.entries()]
      .map(([userId, activity]) => ({
        ...activity,
        userId,
      }))
      .sort(
        (left, right) =>
          right.eventCount - left.eventCount ||
          right.assignedJobCount - left.assignedJobCount,
      ),
    statusCounts,
  }
}
