import type { RouterInputs } from "@ewatrade/api/trpc/routers/_app"
import { formatMinorMoney, majorToMinor } from "@ewatrade/utils"
import type { IntakeProjection } from "./service-intake-model"
import type { ServicePaymentFields } from "./service-payment-model"

type IntakeInput = RouterInputs["services"]["createAndConfirmIntake"]
type Draft = {
  clientIntakeId: string
  storeId: string
  projection: IntakeProjection
  serviceNames: ReadonlyMap<string, string>
  customerName: string
  customerPhone: string
  dueAt: string
  instructions: string
  express: boolean
  payment: ServicePaymentFields
  notificationChannel: "" | "sms" | "whatsapp"
  evidenceCount: number
}
type PreparedIntake = {
  input: IntakeInput
  facts: Array<{ label: string; value: string }>
}

export function prepareServiceIntake(
  draft: Draft,
): { value: PreparedIntake; error: null } | { value: null; error: string } {
  const { projection, payment } = draft
  const dueCommitmentAt = draft.dueAt.trim()
    ? new Date(draft.dueAt.trim())
    : undefined
  if (dueCommitmentAt && Number.isNaN(dueCommitmentAt.getTime()))
    return { value: null, error: "Enter a valid promised date and time." }
  if (
    draft.customerName.trim().length > 160 ||
    draft.customerPhone.trim().length > 40 ||
    draft.instructions.trim().length > 4000 ||
    payment.reference.trim().length > 160
  )
    return {
      value: null,
      error: "One of the intake fields exceeds its supported length.",
    }
  if (draft.evidenceCount && !projection.createsTrackedWork)
    return {
      value: null,
      error: "Private evidence requires tracked Service work.",
    }
  const initialPaymentMinor = payment.amount.trim()
    ? majorToMinor(payment.amount)
    : 0
  if (
    initialPaymentMinor === null ||
    initialPaymentMinor < 0 ||
    initialPaymentMinor > 100_000_000 ||
    initialPaymentMinor > projection.totalMinor
  )
    return {
      value: null,
      error:
        "Enter a non-negative payment within the supported limit and order total.",
    }
  if (draft.notificationChannel && !draft.customerPhone.trim())
    return { value: null, error: "Customer updates require a phone number." }
  const input: IntakeInput = {
    clientIntakeId: draft.clientIntakeId,
    schemaVersion: 1,
    storeId: draft.storeId,
    lines: projection.lines.map((line) => ({ ...line })),
    priority: "normal",
    customerName: draft.customerName.trim() || undefined,
    customerPhone: draft.customerPhone.trim() || undefined,
    dueCommitmentAt,
    instructions: draft.instructions.trim() || undefined,
    initialPaymentMinor,
    initialPaymentMethod: initialPaymentMinor > 0 ? payment.method : undefined,
    initialPaymentReference: payment.reference.trim() || undefined,
    notificationChannel: draft.notificationChannel || undefined,
    serviceLevel: draft.express ? "express" : "standard",
  }
  return {
    error: null,
    value: {
      input,
      facts: [
        {
          label: "Services",
          value: projection.lines
            .map(
              (line) =>
                `${draft.serviceNames.get(line.offeringId) ?? "Service"} × ${line.quantity}`,
            )
            .join("\n"),
        },
        {
          label: "Total",
          value: formatMinorMoney(
            projection.totalMinor,
            projection.currencyCode,
          ),
        },
        {
          label: "Payment now",
          value:
            formatMinorMoney(initialPaymentMinor, projection.currencyCode) +
            (initialPaymentMinor > 0
              ? ` · ${payment.method}`
              : " · Collect later"),
        },
        {
          label: "Reference",
          value: input.initialPaymentReference ?? "Not provided",
        },
        { label: "Customer", value: input.customerName ?? "Not provided" },
        { label: "Phone", value: input.customerPhone ?? "Not provided" },
        {
          label: "Promised time",
          value: dueCommitmentAt?.toLocaleString() ?? "Not set",
        },
        { label: "Instructions", value: input.instructions ?? "Not provided" },
        {
          label: "Service level",
          value: draft.express ? "Express" : "Standard",
        },
        {
          label: "Customer updates",
          value: input.notificationChannel ?? "None",
        },
        {
          label: "Private evidence",
          value: `${draft.evidenceCount} local file(s)`,
        },
      ],
    },
  }
}
