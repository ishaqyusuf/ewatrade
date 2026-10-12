import { generalMoney } from "@ewatrade/assistant/general/contracts"
import {
  type ServiceIntakeAction,
  type ServiceIntakeReceipt,
  serviceIntakeAction,
} from "@ewatrade/assistant/general/service-intake"
import { CatalogError } from "@ewatrade/db/queries"
import {
  ServiceIntakeReviewError,
  prepareReviewedServiceIntakeInTransaction,
  reviewServiceIntakeInTransaction,
} from "@ewatrade/db/service-intake-review"
import { TRPCError } from "@trpc/server"
import { serviceIntakeCreateSchema } from "../schemas/services"
import type { GeneralTransactionContext } from "./general-actions"
import { requireGeneralScope } from "./general-context"

async function operation<T>(run: () => Promise<T>) {
  try {
    return await run()
  } catch (error) {
    if (error instanceof ServiceIntakeReviewError)
      throw new TRPCError({
        code: error.code,
        message: error.message,
        cause: error,
      })
    if (error instanceof CatalogError)
      throw new TRPCError({
        code: "CONFLICT",
        message: error.message,
        cause: error,
      })
    throw error
  }
}
function commandInput(
  ctx: GeneralTransactionContext,
  raw: ServiceIntakeAction,
) {
  const payload = serviceIntakeAction.parse(raw)
  const { action: _action, customerId, ...fields } = payload
  const scope = requireGeneralScope(ctx)
  // This parser is the same boundary the native Service intake form uses.
  const {
    clientIntakeId: _key,
    schemaVersion: _version,
    ...parsed
  } = serviceIntakeCreateSchema.parse({
    ...fields,
    schemaVersion: 1,
    clientIntakeId: "service-intake-review",
    storeId: scope.storeId,
  })
  return {
    ...parsed,
    storeId: scope.storeId,
    tenantId: scope.tenantId,
    actorUserId: scope.userId,
    customerId,
  }
}
type Review = Awaited<
  ReturnType<typeof reviewServiceIntakeInTransaction>
>["review"]
export function serviceIntakeReviewLines(
  review: Review,
  payload: ServiceIntakeAction,
) {
  const money = (minor: number) => generalMoney(minor, review.currencyCode)
  return [
    `Customer: ${review.customer.name ?? "Walk-in contact"}${review.customer.phone ? ` · ${review.customer.phone}` : ""}${review.customer.email ? ` · ${review.customer.email}` : ""}.`,
    ...review.lines.map(
      (line) =>
        `${line.itemName} · ${line.variantName} · ${line.offeringName}: ${line.quantity} × ${money(line.unitPriceMinor)} = ${money(line.totalMinor)} · ${line.workPolicy === "TRACKED" ? "tracked Job Line" : "charge-only Order line"} · authorization ${line.authorizationPolicy.replaceAll("_", " ").toLowerCase()}.`,
    ),
    `Subtotal ${money(review.subtotalMinor)} · service charge ${money(review.serviceChargeMinor)} · total ${money(review.totalMinor)}.`,
    `Initial recorded payment ${money(review.initialPaymentMinor)}${review.initialPaymentMinor ? ` · ${payload.initialPaymentMethod?.replaceAll("_", " ")}` : ""} · balance ${money(review.balanceMinor)}.`,
    ...(payload.initialPaymentReference
      ? [`Payment reference: ${payload.initialPaymentReference}.`]
      : []),
    `Service level: ${payload.serviceLevel ?? "standard"} · priority ${payload.priority === "urgent" || payload.serviceLevel === "express" ? "urgent" : "normal"}.`,
    `Assignee: ${review.assignee?.name ?? "Unassigned"}.`,
    `Promised time: ${review.dueCommitmentAt ?? "None"}.`,
    ...(payload.requestedAt ? [`Requested at: ${payload.requestedAt}.`] : []),
    ...(payload.instructions ? [`Instructions: ${payload.instructions}`] : []),
    ...(payload.conditionNote ? [`Condition: ${payload.conditionNote}`] : []),
    `One Intake and Order${review.trackedLineCount ? ` with one Job and ${review.trackedLineCount} tracked Job Line(s)` : "; no Job"}. Work remains queued; payment-gated/manual-release lines are not released by this action.`,
    "No customer message, stock movement or service handoff. Payment is a recorded receipt, not a provider charge.",
  ]
}
async function current(
  ctx: GeneralTransactionContext,
  payload: ServiceIntakeAction,
) {
  const prepared = await operation(() =>
    reviewServiceIntakeInTransaction(ctx.db, commandInput(ctx, payload)),
  )
  return {
    ...prepared,
    target: { id: prepared.review.storeId, revision: prepared.revision },
  }
}
async function prepareExecution(
  ctx: GeneralTransactionContext,
  payload: ServiceIntakeAction,
) {
  const prepared = await operation(() =>
    prepareReviewedServiceIntakeInTransaction(
      ctx.db,
      commandInput(ctx, payload),
    ),
  )
  return {
    target: { id: prepared.review.storeId, revision: prepared.revision },
    execute: async (key: string): Promise<ServiceIntakeReceipt> => {
      const saved = await operation(() => prepared.execute(key))
      return {
        kind: "service_intake",
        recordId: saved.intakeId,
        orderId: saved.orderId,
        title: "Service intake confirmed",
        detail: `${prepared.review.customer.name ?? "Walk-in contact"} · ${generalMoney(prepared.review.totalMinor, prepared.review.currencyCode)} · ${saved.jobs.length} Job(s), ${saved.jobs.reduce((count, job) => count + job.lines.length, 0)} tracked line(s). Initial payment ${generalMoney(prepared.review.initialPaymentMinor, prepared.review.currencyCode)}; balance ${generalMoney(prepared.review.balanceMinor, prepared.review.currencyCode)}.`,
      }
    },
  }
}
/** Registered by the coordinator after the contract/manifest patch is reviewed. */
export const serviceIntake = {
  stale:
    "The customer, service, price, work policy, Store settings or staff access changed. Review again.",
  unavailable:
    "This Service intake is unavailable. Check the saved services and current Store.",
  async prepare(ctx: GeneralTransactionContext, payload: ServiceIntakeAction) {
    const prepared = await current(ctx, payload)
    return {
      ...payload,
      ...(prepared.review.dueCommitmentAt
        ? { dueCommitmentAt: prepared.review.dueCommitmentAt }
        : {}),
    }
  },
  async validate(
    ctx: GeneralTransactionContext,
    payload: ServiceIntakeAction,
    _lock: boolean,
  ) {
    return (await current(ctx, payload)).target
  },
  async review(ctx: GeneralTransactionContext, payload: ServiceIntakeAction) {
    const prepared = await current(ctx, payload)
    return {
      target: prepared.target,
      lines: serviceIntakeReviewLines(prepared.review, payload),
    }
  },
  prepareExecution,
  async execute(
    ctx: GeneralTransactionContext,
    payload: ServiceIntakeAction,
    key: string,
  ) {
    return (await prepareExecution(ctx, payload)).execute(key)
  },
}
