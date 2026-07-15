import {
  type EwaTradeRole,
  canManageSalesOperations,
  canOperatePos,
  normalizeRole,
} from "@ewatrade/auth/roles"
import {
  RetailOpsCustomerError,
  RetailOpsOfflineDeviceError,
  RetailOpsProductError,
  RetailOpsSaleError,
  RetailOpsSessionError,
  RetailOpsShareLinkError,
  RetailOpsStaffError,
  RetailOpsStockError,
  RetailOpsSubscriptionError,
  assertRetailOpsOfflineDeviceCanSync,
  assertRetailOpsReportRangeAllowed,
  closeRetailOpsSession,
  createRetailOpsProduct,
  createRetailOpsProductShareLink,
  createRetailOpsSale,
  createRetailOpsSharedProductOrderRequest,
  deactivateRetailOpsProductShareLink,
  getRetailOpsCustomerBook,
  getRetailOpsDashboardSummary,
  getRetailOpsInventorySnapshot,
  getRetailOpsSalesByProduct,
  getRetailOpsSharedProduct,
  inviteRetailOpsStaff,
  listRetailOpsOfflineDevices,
  listRetailOpsRevokedOfflineDevices,
  listRetailOpsSalesByRep,
  listRetailOpsSyncConflicts,
  listRetailOpsSyncRuns,
  openRetailOpsSession,
  recordRetailOpsCreditPayment,
  recordRetailOpsCustomerUpsert,
  recordRetailOpsSharedLinkNotificationDispatch,
  recordRetailOpsStockAdjustment,
  recordRetailOpsStockIntake,
  recordRetailOpsSyncRun,
  recordRetailOpsUnitConversion,
  registerRetailOpsOfflineDevice,
  restoreRetailOpsOfflineDevice,
  reviewRetailOpsSyncConflict,
  revokeRetailOpsOfflineDevice,
} from "@ewatrade/db/queries"
import type { InvitedRetailOpsStaff } from "@ewatrade/db/queries"
import {
  enqueueRetailOpsSharedLinkOrderNotification,
  enqueueRetailOpsStaffInviteNotification,
} from "@ewatrade/jobs"
import { TRPCError } from "@trpc/server"
import {
  type RetailOpsSyncEventInput,
  retailOpsCreateSharedProductOrderRequestSchema,
  retailOpsCustomerBookSchema,
  retailOpsRegisterOfflineDeviceSchema,
  retailOpsReportRangeSchema,
  retailOpsRestoreOfflineDeviceSchema,
  retailOpsReviewSyncConflictSchema,
  retailOpsRevokeOfflineDeviceSchema,
  retailOpsSharedProductLookupSchema,
  retailOpsStoreScopeSchema,
  retailOpsSyncConflictsSchema,
  retailOpsSyncEventsSchema,
  retailOpsSyncHistorySchema,
} from "../../schemas/retail-ops"
import {
  type TRPCContext,
  createTRPCRouter,
  mergeRouters,
  protectedProcedure,
  publicProcedure,
} from "../init"
import { retailOpsBusinessTemplatesRouter } from "./retail-ops-business-templates"
import { retailOpsProductsRouter } from "./retail-ops-products"
import { retailOpsSalesRouter } from "./retail-ops-sales"
import { retailOpsSessionsRouter } from "./retail-ops-sessions"
import { retailOpsShareLinksRouter } from "./retail-ops-share-links"
import { retailOpsStaffRouter } from "./retail-ops-staff"
import { retailOpsStockRouter } from "./retail-ops-stock"
import { retailOpsSubscriptionsRouter } from "./retail-ops-subscriptions"

function getSaleErrorCode(error: RetailOpsSaleError): "CONFLICT" | "NOT_FOUND" {
  if (error.code === "INSUFFICIENT_STOCK") return "CONFLICT"
  if (error.code === "CREDIT_PAYMENT_NOT_ALLOWED") return "CONFLICT"
  if (error.code === "CREDIT_PAYMENT_OVERPAID") return "CONFLICT"

  return "NOT_FOUND"
}

function getProductErrorCode(
  error: RetailOpsProductError,
): "BAD_REQUEST" | "NOT_FOUND" {
  if (error.code === "DUPLICATE_UNIT") return "BAD_REQUEST"
  if (error.code === "FUTURE_PRICE_NOT_SUPPORTED") return "BAD_REQUEST"

  return "NOT_FOUND"
}

function getStockErrorCode(
  error: RetailOpsStockError,
): "BAD_REQUEST" | "CONFLICT" | "NOT_FOUND" {
  if (error.code === "INSUFFICIENT_STOCK") return "CONFLICT"
  if (
    error.code === "CONVERSION_RATIO_MISMATCH" ||
    error.code === "DIFFERENT_PRODUCT" ||
    error.code === "INVALID_STOCK_ADJUSTMENT" ||
    error.code === "SAME_UNIT"
  ) {
    return "BAD_REQUEST"
  }

  return "NOT_FOUND"
}

function getSessionErrorCode(
  error: RetailOpsSessionError,
): "BAD_REQUEST" | "CONFLICT" | "NOT_FOUND" {
  if (error.code === "DUPLICATE_INVENTORY_LINE") return "BAD_REQUEST"
  if (error.code === "OPEN_SESSION_EXISTS") return "CONFLICT"
  if (error.code === "SESSION_NOT_CLOSED") return "CONFLICT"

  return "NOT_FOUND"
}

function getStaffErrorCode(
  error: RetailOpsStaffError,
): "BAD_REQUEST" | "CONFLICT" | "FORBIDDEN" | "NOT_FOUND" {
  if (error.code === "STAFF_ALREADY_ACTIVE") return "CONFLICT"
  if (error.code === "STAFF_SELF_UPDATE_FORBIDDEN") return "FORBIDDEN"
  if (error.code === "STAFF_STATUS_NOT_ALLOWED") return "BAD_REQUEST"
  if (error.code === "STAFF_STATUS_UNCHANGED") return "CONFLICT"

  return "NOT_FOUND"
}

function getShareLinkErrorCode(
  error: RetailOpsShareLinkError,
): "CONFLICT" | "FORBIDDEN" | "NOT_FOUND" {
  if (error.code === "INSUFFICIENT_STOCK") return "CONFLICT"
  if (error.code === "ORDER_REQUEST_ALREADY_FINALIZED") return "CONFLICT"
  if (error.code === "ORDER_REQUEST_FORBIDDEN") return "FORBIDDEN"
  if (error.code === "SHARE_LINK_FORBIDDEN") return "FORBIDDEN"

  return "NOT_FOUND"
}

function getCustomerErrorCode(
  error: RetailOpsCustomerError,
): "CONFLICT" | "NOT_FOUND" {
  if (error.code === "SOURCE_SALE_NOT_FOUND") return "CONFLICT"

  return "NOT_FOUND"
}

function getRetailOpsRole(role: string): EwaTradeRole {
  const normalizedRole = normalizeRole(role)

  if (!normalizedRole) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have permission to use Retail Ops.",
    })
  }

  return normalizedRole
}

function getRetailOpsActorReadScope(role: string, userId: string) {
  const normalizedRole = getRetailOpsRole(role)

  return canManageSalesOperations(normalizedRole) ? undefined : userId
}

function assertCanManageRetailOpsStaff(role: string) {
  const normalizedRole = getRetailOpsRole(role)

  if (!canManageSalesOperations(normalizedRole)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have permission to manage Retail Ops staff.",
    })
  }
}

function assertCanOperateRetailOpsPos(role: string) {
  const normalizedRole = getRetailOpsRole(role)

  if (!canOperatePos(normalizedRole)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have permission to operate Retail Ops POS.",
    })
  }
}

function assertCanReviewRetailOpsSyncConflicts(role: string) {
  const normalizedRole = getRetailOpsRole(role)

  if (!canManageSalesOperations(normalizedRole)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "You do not have permission to review Retail Ops sync conflicts.",
    })
  }
}

function assertCanUseRetailOpsShareLinks(role: string) {
  const normalizedRole = getRetailOpsRole(role)

  if (!canOperatePos(normalizedRole)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have permission to share Retail Ops products.",
    })
  }

  return normalizedRole
}

function assertCanRegisterRetailOpsOfflineDevice(role: string) {
  const normalizedRole = getRetailOpsRole(role)

  if (!canOperatePos(normalizedRole)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have permission to register an offline device.",
    })
  }
}

function assertCanManageRetailOpsOfflineDevices(role: string) {
  const normalizedRole = getRetailOpsRole(role)

  if (!canManageSalesOperations(normalizedRole)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have permission to manage offline devices.",
    })
  }
}

function assertCanSyncRetailOpsEvents(role: string) {
  const normalizedRole = getRetailOpsRole(role)

  if (!canOperatePos(normalizedRole)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have permission to sync Retail Ops events.",
    })
  }
}

function assertCanViewRetailOpsSyncHistory(role: string) {
  const normalizedRole = getRetailOpsRole(role)

  if (!canOperatePos(normalizedRole)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have permission to view Retail Ops sync history.",
    })
  }

  return normalizedRole
}

async function assertRetailOpsReportHistoryAllowed(
  ctx: {
    db: TRPCContext["db"]
    tenantContext: NonNullable<TRPCContext["tenantContext"]>
  },
  input: {
    from?: Date
  },
) {
  try {
    await assertRetailOpsReportRangeAllowed(ctx.db, {
      from: input.from,
      tenantId: ctx.tenantContext.tenant.id,
    })
  } catch (error) {
    if (error instanceof RetailOpsSubscriptionError) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: error.message,
      })
    }

    throw error
  }
}

function getPublicProductBaseUrl() {
  return (
    process.env.STOREFRONT_URL ??
    process.env.NEXT_PUBLIC_STOREFRONT_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "https://ewatrade.com"
  )
}

function getRetailOpsAppUrl() {
  return (
    process.env.MOBILE_APP_URL ??
    process.env.NEXT_PUBLIC_MOBILE_APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "https://ewatrade.com/download"
  )
}

function getRetailOpsStaffInviteUrl(token: string | null | undefined) {
  const appUrl = getRetailOpsAppUrl()

  if (!token) return appUrl

  try {
    const url = new URL(appUrl)
    url.pathname = "/staff-onboarding"
    url.searchParams.set("inviteToken", token)
    return url.toString()
  } catch {
    return `${appUrl.replace(/\/$/, "")}/staff-onboarding?inviteToken=${encodeURIComponent(
      token,
    )}`
  }
}

async function enqueueStaffInviteNotification(input: {
  businessName: string
  invitedByName: string
  invitedStaff: InvitedRetailOpsStaff
}) {
  if (!input.invitedStaff.notification.shouldSend) return

  await enqueueRetailOpsStaffInviteNotification({
    appUrl: getRetailOpsAppUrl(),
    businessName: input.businessName,
    inviteUrl: getRetailOpsStaffInviteUrl(
      input.invitedStaff.invite.acceptanceToken,
    ),
    invitedByName: input.invitedByName,
    inviteeEmail: input.invitedStaff.staff.email,
    inviteeName:
      input.invitedStaff.staff.displayName ||
      input.invitedStaff.staff.name ||
      null,
    membershipId: input.invitedStaff.invite.id,
    role: input.invitedStaff.invite.role,
  })
}

function hideStaffInviteAcceptanceToken(
  invitedStaff: InvitedRetailOpsStaff,
): InvitedRetailOpsStaff {
  return {
    ...invitedStaff,
    invite: {
      ...invitedStaff.invite,
      acceptanceToken: null,
    },
  }
}

async function enqueueSharedLinkOrderNotification(input: {
  db: TRPCContext["db"]
  orderRequest: Awaited<
    ReturnType<typeof createRetailOpsSharedProductOrderRequest>
  >
}) {
  try {
    await enqueueRetailOpsSharedLinkOrderNotification(
      input.orderRequest.notification,
    )
    await recordRetailOpsSharedLinkNotificationDispatch(input.db, {
      notification: input.orderRequest.notification,
      orderId: input.orderRequest.order.id,
      status: "queued",
    }).catch(() => undefined)
  } catch (error) {
    await recordRetailOpsSharedLinkNotificationDispatch(input.db, {
      failureReason:
        error instanceof Error
          ? error.message
          : "Unknown notification dispatch failure.",
      notification: input.orderRequest.notification,
      orderId: input.orderRequest.order.id,
      status: "failed",
    }).catch(() => undefined)
  }
}

function resolveStore(
  stores: Array<{
    id: string
    name: string
    slug: string
  }>,
  activeStore: {
    id: string
    name: string
    slug: string
  } | null,
  input: {
    storeId?: string
  },
) {
  if (input.storeId) {
    const store = stores.find(
      (currentStore) => currentStore.id === input.storeId,
    )

    if (!store) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Store not found for this tenant.",
      })
    }

    return store
  }

  const store = activeStore ?? stores[0] ?? null

  if (!store) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Create a store before opening Retail Ops.",
    })
  }

  return store
}

type RetailOpsProtectedContext = TRPCContext & {
  session: NonNullable<TRPCContext["session"]>
  tenantContext: NonNullable<TRPCContext["tenantContext"]>
}

type RetailOpsSyncEventResult = {
  error?: {
    code: string
    message: string
  }
  eventId: string
  message?: string
  result?: unknown
  status: "applied" | "failed" | "skipped"
  type: RetailOpsSyncEventInput["type"]
}

function getSyncEventError(error: unknown) {
  if (error instanceof TRPCError) {
    return {
      code: error.code,
      message: error.message,
    }
  }

  if (error instanceof RetailOpsSaleError) {
    return {
      code: getSaleErrorCode(error),
      message: error.message,
    }
  }

  if (error instanceof RetailOpsCustomerError) {
    return {
      code: getCustomerErrorCode(error),
      message: error.message,
    }
  }

  if (error instanceof RetailOpsStockError) {
    return {
      code: getStockErrorCode(error),
      message: error.message,
    }
  }

  if (error instanceof RetailOpsProductError) {
    return {
      code: getProductErrorCode(error),
      message: error.message,
    }
  }

  if (error instanceof RetailOpsStaffError) {
    return {
      code: getStaffErrorCode(error),
      message: error.message,
    }
  }

  if (error instanceof RetailOpsShareLinkError) {
    return {
      code: getShareLinkErrorCode(error),
      message: error.message,
    }
  }

  if (error instanceof RetailOpsSessionError) {
    return {
      code: getSessionErrorCode(error),
      message: error.message,
    }
  }

  if (error instanceof RetailOpsSubscriptionError) {
    return {
      code: "FORBIDDEN",
      message: error.message,
    }
  }

  if (error instanceof Error) {
    return {
      code: "INTERNAL_SERVER_ERROR",
      message: error.message,
    }
  }

  return {
    code: "INTERNAL_SERVER_ERROR",
    message: "Unable to sync Retail Ops event.",
  }
}

async function processRetailOpsSyncEvent(
  ctx: RetailOpsProtectedContext,
  event: RetailOpsSyncEventInput,
): Promise<RetailOpsSyncEventResult> {
  const eventId = event.eventId
  const eventType = event.type

  try {
    if (event.type === "product_setup") {
      const store = resolveStore(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        event.payload,
      )
      const result = await createRetailOpsProduct(ctx.db, {
        actorUserId: ctx.session.user.id,
        description: event.payload.description,
        externalId: event.payload.externalId ?? event.eventId,
        imageUrl: event.payload.imageUrl,
        name: event.payload.name,
        openingStockQuantity: event.payload.openingStockQuantity,
        primaryUnitName: event.payload.primaryUnitName,
        priceMinor: event.payload.priceMinor,
        storeId: store.id,
        tenantId: ctx.tenantContext.tenant.id,
        variants: event.payload.variants,
      })

      return {
        eventId: event.eventId,
        result,
        status: "applied",
        type: event.type,
      }
    }

    if (event.type === "sale_created") {
      const store = resolveStore(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        event.payload,
      )
      const result = await createRetailOpsSale(ctx.db, {
        actorUserId: ctx.session.user.id,
        cashierSessionId: event.payload.cashierSessionId,
        creditDueAt: event.payload.creditDueAt,
        creditTermsNote: event.payload.creditTermsNote,
        customerEmail: event.payload.customerEmail,
        customerName: event.payload.customerName,
        customerPhone: event.payload.customerPhone,
        externalId: event.payload.externalId ?? event.eventId,
        notes: event.payload.notes,
        paymentMethod: event.payload.paymentMethod,
        productVariantId: event.payload.productVariantId,
        quantity: event.payload.quantity,
        soldAt: event.payload.soldAt ?? event.createdAt,
        storeId: store.id,
        tenantId: ctx.tenantContext.tenant.id,
      })

      return {
        eventId: event.eventId,
        result,
        status: "applied",
        type: event.type,
      }
    }

    if (event.type === "credit_payment_recorded") {
      const store = resolveStore(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        event.payload,
      )
      const result = await recordRetailOpsCreditPayment(ctx.db, {
        actorUserId: ctx.session.user.id,
        amountMinor: event.payload.amountMinor,
        cashierSessionId: event.payload.cashierSessionId,
        externalId: event.payload.externalId ?? event.eventId,
        notes: event.payload.notes,
        orderId: event.payload.orderId,
        paidAt: event.payload.paidAt ?? event.createdAt,
        paymentMethod: event.payload.paymentMethod,
        storeId: store.id,
        tenantId: ctx.tenantContext.tenant.id,
      })

      return {
        eventId: event.eventId,
        result,
        status: "applied",
        type: event.type,
      }
    }

    if (event.type === "stock_intake_recorded") {
      const store = resolveStore(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        event.payload,
      )
      const result = await recordRetailOpsStockIntake(ctx.db, {
        actorUserId: ctx.session.user.id,
        externalId: event.payload.externalId ?? event.eventId,
        note: event.payload.note,
        productVariantId: event.payload.productVariantId,
        quantity: event.payload.quantity,
        receivedAt: event.payload.receivedAt ?? event.createdAt,
        sourceName: event.payload.sourceName,
        storeId: store.id,
        tenantId: ctx.tenantContext.tenant.id,
      })

      return {
        eventId: event.eventId,
        result,
        status: "applied",
        type: event.type,
      }
    }

    if (event.type === "stock_adjustment_recorded") {
      const store = resolveStore(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        event.payload,
      )
      const result = await recordRetailOpsStockAdjustment(ctx.db, {
        actorUserId: ctx.session.user.id,
        adjustedAt: event.payload.adjustedAt ?? event.createdAt,
        direction: event.payload.direction,
        externalId: event.payload.externalId ?? event.eventId,
        note: event.payload.note,
        productVariantId: event.payload.productVariantId,
        quantity: event.payload.quantity,
        reason: event.payload.reason,
        sourceName: event.payload.sourceName,
        storeId: store.id,
        tenantId: ctx.tenantContext.tenant.id,
      })

      return {
        eventId: event.eventId,
        result,
        status: "applied",
        type: event.type,
      }
    }

    if (event.type === "unit_conversion_recorded") {
      const store = resolveStore(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        event.payload,
      )
      const result = await recordRetailOpsUnitConversion(ctx.db, {
        actorUserId: ctx.session.user.id,
        convertedAt: event.payload.convertedAt ?? event.createdAt,
        externalId: event.payload.externalId ?? event.eventId,
        note: event.payload.note,
        sourceProductVariantId: event.payload.sourceProductVariantId,
        sourceQuantity: event.payload.sourceQuantity,
        storeId: store.id,
        targetProductVariantId: event.payload.targetProductVariantId,
        targetQuantity: event.payload.targetQuantity,
        tenantId: ctx.tenantContext.tenant.id,
      })

      return {
        eventId: event.eventId,
        result,
        status: "applied",
        type: event.type,
      }
    }

    if (event.type === "customer_upsert") {
      const store = resolveStore(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        event.payload,
      )
      const result = await recordRetailOpsCustomerUpsert(ctx.db, {
        actorUserId: ctx.session.user.id,
        email: event.payload.email,
        externalId: event.payload.externalId ?? event.eventId,
        lastSaleExternalId: event.payload.lastSaleExternalId,
        lastSeenAt: event.payload.lastSeenAt ?? event.createdAt,
        name: event.payload.name,
        phone: event.payload.phone,
        storeId: store.id,
        tenantId: ctx.tenantContext.tenant.id,
      })

      return {
        eventId: event.eventId,
        result,
        status: "applied",
        type: event.type,
      }
    }

    if (event.type === "rep_session_opened") {
      const store = resolveStore(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        event.payload,
      )
      const result = await openRetailOpsSession(ctx.db, {
        actorUserId: ctx.session.user.id,
        externalId: event.payload.externalId ?? event.eventId,
        inventoryLines: event.payload.inventoryLines,
        notes: event.payload.notes,
        openedAt: event.payload.openedAt ?? event.createdAt,
        openingFloatMinor: event.payload.openingFloatMinor,
        storeId: store.id,
        tenantId: ctx.tenantContext.tenant.id,
      })

      return {
        eventId: event.eventId,
        result,
        status: "applied",
        type: event.type,
      }
    }

    if (event.type === "closeout_created") {
      const store = resolveStore(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        event.payload,
      )
      const result = await closeRetailOpsSession(ctx.db, {
        actorUserId: ctx.session.user.id,
        cashierSessionId: event.payload.cashierSessionId,
        closedAt: event.payload.closedAt ?? event.createdAt,
        closingFloatMinor: event.payload.closingFloatMinor,
        declaredCardMinor: event.payload.declaredCardMinor,
        declaredCreditMinor: event.payload.declaredCreditMinor,
        declaredTransferMinor: event.payload.declaredTransferMinor,
        externalId: event.payload.externalId ?? event.eventId,
        inventoryLines: event.payload.inventoryLines,
        notes: event.payload.notes,
        storeId: store.id,
        tenantId: ctx.tenantContext.tenant.id,
      })

      return {
        eventId: event.eventId,
        result,
        status: "applied",
        type: event.type,
      }
    }

    if (event.type === "share_link_created") {
      assertCanUseRetailOpsShareLinks(ctx.tenantContext.membership.role)

      const store = resolveStore(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        event.payload,
      )
      const result = await createRetailOpsProductShareLink(ctx.db, {
        actorUserId: ctx.session.user.id,
        externalId: event.payload.externalId ?? event.eventId,
        label: event.payload.label,
        productId: event.payload.productId,
        publicBaseUrl: getPublicProductBaseUrl(),
        storeId: store.id,
        tenantId: ctx.tenantContext.tenant.id,
      })

      return {
        eventId: event.eventId,
        result,
        status: "applied",
        type: event.type,
      }
    }

    if (event.type === "share_link_deactivated") {
      const role = assertCanUseRetailOpsShareLinks(
        ctx.tenantContext.membership.role,
      )
      const store = resolveStore(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        event.payload,
      )
      const result = await deactivateRetailOpsProductShareLink(ctx.db, {
        actorUserId: ctx.session.user.id,
        canManageAllLinks: canManageSalesOperations(role),
        externalId: event.payload.externalId ?? event.eventId,
        productId: event.payload.productId,
        shareLinkId: event.payload.shareLinkId,
        storeId: store.id,
        tenantId: ctx.tenantContext.tenant.id,
      })

      return {
        eventId: event.eventId,
        result,
        status: "applied",
        type: event.type,
      }
    }

    if (event.type === "staff_invited") {
      assertCanManageRetailOpsStaff(ctx.tenantContext.membership.role)

      const store = resolveStore(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        event.payload,
      )
      const result = await inviteRetailOpsStaff(ctx.db, {
        actorUserId: ctx.session.user.id,
        email: event.payload.email,
        externalId: event.payload.externalId ?? event.eventId,
        name: event.payload.name,
        role: event.payload.role,
        storeId: store.id,
        tenantId: ctx.tenantContext.tenant.id,
      })

      await enqueueStaffInviteNotification({
        businessName: ctx.tenantContext.tenant.name,
        invitedByName:
          ctx.session.user.displayName ||
          ctx.session.user.name ||
          ctx.session.user.email,
        invitedStaff: result,
      })

      return {
        eventId: event.eventId,
        result: hideStaffInviteAcceptanceToken(result),
        status: "applied",
        type: event.type,
      }
    }

    return {
      eventId,
      message: "This Retail Ops sync event type is not supported yet.",
      status: "skipped",
      type: eventType,
    }
  } catch (error) {
    return {
      error: getSyncEventError(error),
      eventId,
      status: "failed",
      type: eventType,
    }
  }
}

const retailOpsCoreRouter = createTRPCRouter({
  sharedProduct: publicProcedure
    .input(retailOpsSharedProductLookupSchema)
    .query(async ({ ctx, input }) => {
      try {
        return await getRetailOpsSharedProduct(ctx.db, {
          productSlug: input.productSlug,
          recordView: true,
          storeSlug: input.storeSlug,
          tenantSlug: input.tenantSlug,
          token: input.token,
        })
      } catch (error) {
        if (error instanceof RetailOpsShareLinkError) {
          throw new TRPCError({
            code: getShareLinkErrorCode(error),
            message: error.message,
          })
        }

        throw error
      }
    }),

  createSharedProductOrderRequest: publicProcedure
    .input(retailOpsCreateSharedProductOrderRequestSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const orderRequest = await createRetailOpsSharedProductOrderRequest(
          ctx.db,
          {
            customerEmail: input.customerEmail,
            customerName: input.customerName,
            customerPhone: input.customerPhone,
            notes: input.notes,
            productSlug: input.productSlug,
            productVariantId: input.productVariantId,
            quantity: input.quantity,
            storeSlug: input.storeSlug,
            tenantSlug: input.tenantSlug,
            token: input.token,
          },
        )

        await enqueueSharedLinkOrderNotification({
          db: ctx.db,
          orderRequest,
        })

        return orderRequest
      } catch (error) {
        if (error instanceof RetailOpsShareLinkError) {
          throw new TRPCError({
            code: getShareLinkErrorCode(error),
            message: error.message,
          })
        }

        throw error
      }
    }),

  summary: protectedProcedure
    .input(retailOpsReportRangeSchema)
    .query(async ({ ctx, input }) => {
      const store = resolveStore(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input,
      )

      await assertRetailOpsReportHistoryAllowed(ctx, input)

      return getRetailOpsDashboardSummary(ctx.db, {
        tenantId: ctx.tenantContext.tenant.id,
        storeId: store.id,
        from: input.from,
        to: input.to,
      })
    }),

  inventory: protectedProcedure
    .input(retailOpsStoreScopeSchema)
    .query(async ({ ctx, input }) => {
      const store = resolveStore(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input,
      )

      return getRetailOpsInventorySnapshot(ctx.db, {
        tenantId: ctx.tenantContext.tenant.id,
        storeId: store.id,
      })
    }),

  salesByProduct: protectedProcedure
    .input(retailOpsReportRangeSchema)
    .query(async ({ ctx, input }) => {
      const store = resolveStore(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input,
      )

      await assertRetailOpsReportHistoryAllowed(ctx, input)

      return getRetailOpsSalesByProduct(ctx.db, {
        actorUserId: getRetailOpsActorReadScope(
          ctx.tenantContext.membership.role,
          ctx.session.user.id,
        ),
        tenantId: ctx.tenantContext.tenant.id,
        storeId: store.id,
        from: input.from,
        to: input.to,
      })
    }),

  salesByRep: protectedProcedure
    .input(retailOpsReportRangeSchema)
    .query(async ({ ctx, input }) => {
      const store = resolveStore(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input,
      )

      await assertRetailOpsReportHistoryAllowed(ctx, input)

      return listRetailOpsSalesByRep(ctx.db, {
        actorUserId: getRetailOpsActorReadScope(
          ctx.tenantContext.membership.role,
          ctx.session.user.id,
        ),
        tenantId: ctx.tenantContext.tenant.id,
        storeId: store.id,
        from: input.from,
        to: input.to,
      })
    }),

  offlineDevices: protectedProcedure.query(async ({ ctx }) => {
    assertCanManageRetailOpsOfflineDevices(ctx.tenantContext.membership.role)

    return listRetailOpsOfflineDevices(ctx.db, {
      tenantId: ctx.tenantContext.tenant.id,
    })
  }),

  revokedOfflineDevices: protectedProcedure.query(async ({ ctx }) => {
    assertCanManageRetailOpsOfflineDevices(ctx.tenantContext.membership.role)

    return listRetailOpsRevokedOfflineDevices(ctx.db, {
      tenantId: ctx.tenantContext.tenant.id,
    })
  }),

  registerOfflineDevice: protectedProcedure
    .input(retailOpsRegisterOfflineDeviceSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanRegisterRetailOpsOfflineDevice(ctx.tenantContext.membership.role)

      const store = resolveStore(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input,
      )

      try {
        return await registerRetailOpsOfflineDevice(ctx.db, {
          actorUserId: ctx.session.user.id,
          appVersion: input.appVersion,
          deviceId: input.deviceId,
          deviceName: input.deviceName,
          platform: input.platform,
          storeId: store.id,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        if (error instanceof RetailOpsOfflineDeviceError) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: error.message,
          })
        }

        if (error instanceof RetailOpsSubscriptionError) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: error.message,
          })
        }

        throw error
      }
    }),

  revokeOfflineDevice: protectedProcedure
    .input(retailOpsRevokeOfflineDeviceSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanManageRetailOpsOfflineDevices(ctx.tenantContext.membership.role)

      const revokedDevice = await revokeRetailOpsOfflineDevice(ctx.db, {
        deviceId: input.deviceId,
        revokedByUserId: ctx.session.user.id,
        tenantId: ctx.tenantContext.tenant.id,
      })

      if (!revokedDevice) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Offline device not found for this tenant.",
        })
      }

      return revokedDevice
    }),

  restoreOfflineDevice: protectedProcedure
    .input(retailOpsRestoreOfflineDeviceSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanManageRetailOpsOfflineDevices(ctx.tenantContext.membership.role)

      const restoredDevice = await restoreRetailOpsOfflineDevice(ctx.db, {
        deviceId: input.deviceId,
        tenantId: ctx.tenantContext.tenant.id,
      })

      if (!restoredDevice) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Revoked offline device not found for this tenant.",
        })
      }

      return restoredDevice
    }),

  syncEvents: protectedProcedure
    .input(retailOpsSyncEventsSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanSyncRetailOpsEvents(ctx.tenantContext.membership.role)

      try {
        await assertRetailOpsOfflineDeviceCanSync(ctx.db, {
          deviceId: input.deviceId,
          tenantId: ctx.tenantContext.tenant.id,
        })
      } catch (error) {
        if (error instanceof RetailOpsOfflineDeviceError) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: error.message,
          })
        }

        throw error
      }

      const results: RetailOpsSyncEventResult[] = []

      for (const event of input.events) {
        results.push(await processRetailOpsSyncEvent(ctx, event))
      }
      const syncRun = await recordRetailOpsSyncRun(ctx.db, {
        actorUserId: ctx.session.user.id,
        deviceId: input.deviceId,
        results: results.map((result) => ({
          error: result.error,
          eventId: result.eventId,
          status: result.status,
          type: result.type,
        })),
        tenantId: ctx.tenantContext.tenant.id,
      })

      return {
        appliedCount: results.filter((result) => result.status === "applied")
          .length,
        deviceId: input.deviceId ?? null,
        failedCount: results.filter((result) => result.status === "failed")
          .length,
        results,
        skippedCount: results.filter((result) => result.status === "skipped")
          .length,
        syncRun,
        totalCount: results.length,
      }
    }),

  syncHistory: protectedProcedure
    .input(retailOpsSyncHistorySchema)
    .query(async ({ ctx, input }) => {
      const role = assertCanViewRetailOpsSyncHistory(
        ctx.tenantContext.membership.role,
      )

      return listRetailOpsSyncRuns(ctx.db, {
        actorUserId: canManageSalesOperations(role)
          ? undefined
          : ctx.session.user.id,
        deviceId: input.deviceId,
        limit: input.limit,
        tenantId: ctx.tenantContext.tenant.id,
      })
    }),

  syncConflicts: protectedProcedure
    .input(retailOpsSyncConflictsSchema)
    .query(async ({ ctx, input }) => {
      assertCanReviewRetailOpsSyncConflicts(ctx.tenantContext.membership.role)

      return listRetailOpsSyncConflicts(ctx.db, {
        deviceId: input.deviceId,
        limit: input.limit,
        tenantId: ctx.tenantContext.tenant.id,
      })
    }),

  reviewSyncConflict: protectedProcedure
    .input(retailOpsReviewSyncConflictSchema)
    .mutation(async ({ ctx, input }) => {
      assertCanReviewRetailOpsSyncConflicts(ctx.tenantContext.membership.role)

      const reviewedConflict = await reviewRetailOpsSyncConflict(ctx.db, {
        eventId: input.eventId,
        reviewedByUserId: ctx.session.user.id,
        tenantId: ctx.tenantContext.tenant.id,
      })

      if (!reviewedConflict) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Sync conflict not found for this tenant.",
        })
      }

      return reviewedConflict
    }),

  customerBook: protectedProcedure
    .input(retailOpsCustomerBookSchema)
    .query(async ({ ctx, input }) => {
      const store = resolveStore(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input,
      )

      return getRetailOpsCustomerBook(ctx.db, {
        actorUserId: getRetailOpsActorReadScope(
          ctx.tenantContext.membership.role,
          ctx.session.user.id,
        ),
        limit: input.limit,
        search: input.search,
        storeId: store.id,
        tenantId: ctx.tenantContext.tenant.id,
      })
    }),
})

export const retailOpsRouter = mergeRouters(
  retailOpsCoreRouter,
  retailOpsBusinessTemplatesRouter,
  retailOpsProductsRouter,
  retailOpsSalesRouter,
  retailOpsSessionsRouter,
  retailOpsShareLinksRouter,
  retailOpsStaffRouter,
  retailOpsStockRouter,
  retailOpsSubscriptionsRouter,
)
