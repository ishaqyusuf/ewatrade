import { Prisma } from "@ewatrade/db"
import {
  CatalogError,
  CommerceInquiryError,
  CustomerChannelsError,
  PrescriptionRequestError,
  ServiceCommerceIntakeError,
  ServiceCommercePolicyError,
  submitServiceCommerceIntake,
} from "@ewatrade/db/queries"
import type { ServiceCommerceIntakeRecovery } from "@ewatrade/service-commerce"

import {
  publicServiceCommerceIntakeSchema,
  staffServiceCommerceIntakeSchema,
  whatsAppServiceCommerceIntakeSchema,
} from "../../../schemas/service-commerce-intake"
import {
  createTRPCRouter,
  internalProcedure,
  protectedProcedure,
  publicProcedure,
} from "../../init"
import { resolveServiceStoreId } from "../service-permissions"

function recovery(
  code: ServiceCommerceIntakeRecovery["code"],
  action: ServiceCommerceIntakeRecovery["action"],
): ServiceCommerceIntakeRecovery {
  return { action, code, status: "recovery" }
}

function recoverExpectedIntakeError(
  error: unknown,
): ServiceCommerceIntakeRecovery {
  if (error instanceof ServiceCommerceIntakeError) {
    if (error.code === "AMBIGUOUS") {
      return recovery("ambiguous", "choose_intent")
    }
    if (error.code === "STALE_CONTEXT") {
      return recovery("stale_context", "use_current_entry")
    }
    if (error.code === "UNSUPPORTED") {
      return recovery("unsupported", "choose_intent")
    }
    return recovery("disabled", "contact_business")
  }
  if (
    error instanceof CustomerChannelsError ||
    error instanceof ServiceCommercePolicyError
  ) {
    return error.code === "CONFLICT"
      ? recovery("stale_context", "retry")
      : recovery("disabled", "contact_business")
  }
  if (error instanceof CommerceInquiryError) {
    return error.code === "EXACT_PRODUCT_REQUIRES_COMMERCE"
      ? recovery("unsupported", "use_cart")
      : error.code === "CONFLICT"
        ? recovery("stale_context", "retry")
        : recovery("disabled", "contact_business")
  }
  if (error instanceof PrescriptionRequestError) {
    return error.code === "IDEMPOTENCY_MISMATCH"
      ? recovery("stale_context", "retry")
      : recovery("disabled", "contact_business")
  }
  if (error instanceof CatalogError) {
    return error.code === "IDEMPOTENCY_MISMATCH"
      ? recovery("stale_context", "retry")
      : recovery("disabled", "contact_business")
  }
  if (
    error instanceof Prisma.PrismaClientInitializationError ||
    (error instanceof Prisma.PrismaClientKnownRequestError &&
      ["P1001", "P1002", "P2024", "P2028"].includes(error.code))
  ) {
    return recovery("temporary_failure", "retry")
  }
  throw error
}

async function submitOrRecover(
  submit: () => ReturnType<typeof submitServiceCommerceIntake>,
) {
  try {
    return await submit()
  } catch (error) {
    return recoverExpectedIntakeError(error)
  }
}

export const serviceCommerceIntakeRouter = createTRPCRouter({
  submitPublicIntake: publicProcedure
    .input(publicServiceCommerceIntakeSchema)
    .mutation(({ ctx, input }) =>
      submitOrRecover(() =>
        submitServiceCommerceIntake(ctx.db, { envelope: input }),
      ),
    ),

  submitStaffIntake: protectedProcedure
    .input(staffServiceCommerceIntakeSchema)
    .mutation(({ ctx, input }) => {
      const storeId = resolveServiceStoreId(
        ctx.tenantContext.stores,
        ctx.tenantContext.activeStore,
        input.context.kind === "store" ? input.context.storeId : undefined,
      )
      return submitOrRecover(() =>
        submitServiceCommerceIntake(ctx.db, {
          actorUserId: ctx.session.user.id,
          envelope: {
            ...input,
            context: { kind: "store", storeId },
          },
          tenantId: ctx.tenantContext.tenant.id,
        }),
      )
    }),

  submitWhatsAppIntake: internalProcedure
    .input(whatsAppServiceCommerceIntakeSchema)
    .mutation(({ ctx, input }) =>
      submitOrRecover(() =>
        submitServiceCommerceIntake(ctx.db, { envelope: input }),
      ),
    ),
})
