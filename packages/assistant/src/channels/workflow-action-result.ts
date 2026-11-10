import { z } from "zod"
import { catalogItemAppHref } from "./read-record-links"
import { whatsAppPlainText } from "./render"
import { workflowConversationAppLink } from "./workflow"
import { whatsAppWorkflowActionSourceSchema } from "./workflow-action-review"

export const WHATSAPP_WORKFLOW_ACTION_RESULT_VERSION =
  "whatsapp-workflow-action-result-v1"
export const WHATSAPP_WORKFLOW_ACTION_INVALID_REPLY =
  "That workflow confirmation is unavailable or changed. Open the exact saved workflow in EwaTrade, or request a fresh review. Nothing was changed by this message."
export const WHATSAPP_WORKFLOW_ACTION_DISABLED_REPLY =
  "WhatsApp workflow confirmations are not enabled. Open the exact saved workflow in EwaTrade to review and add its records. Nothing was changed by this message."
const id = z.string().min(1).max(128)
export const whatsAppWorkflowActionResultSchema = z
  .object({
    version: z.literal("workflow-result-v1"),
    purpose: z.enum(["SETUP", "PRODUCT_CREATE"]),
    conversationId: id,
    draftId: id,
    results: z
      .array(
        z
          .object({
            entityId: id,
            key: z.string().min(1).max(140),
            state: z.enum(["COMMITTED", "FAILED", "CANCELLED"]),
            recordId: id.optional(),
            kind: z.enum(["PRODUCT", "SERVICE", "CUSTOMER"]).optional(),
            name: z.string().min(1).max(160).optional(),
            errorCode: z.string().min(1).max(160).optional(),
          })
          .strict()
          .superRefine((entry, context) => {
            if ((entry.state === "COMMITTED") !== Boolean(entry.recordId))
              context.addIssue({
                code: "custom",
                message:
                  "Saved outcomes need their canonical record reference.",
              })
          }),
      )
      .min(1)
      .max(3),
  })
  .strict()
export type WhatsAppWorkflowActionResult = z.infer<
  typeof whatsAppWorkflowActionResultSchema
>
export const whatsAppWorkflowActionResultContentSchema = z.discriminatedUnion(
  "type",
  [
    z
      .object({
        type: z.literal("workflow_action_result"),
        reviewId: id,
        resultRef: whatsAppWorkflowActionResultSchema,
      })
      .strict(),
    z
      .object({
        type: z.literal("workflow_action_refusal"),
        reason: z.enum(["disabled", "invalid"]),
      })
      .strict(),
  ],
)

/** Immutable canonical receipt references only; this formatter cannot authorize or execute a workflow. */
export function renderWhatsAppWorkflowActionResult(
  sourceInput: unknown,
  resultInput: unknown,
  options?: {
    trustedAppOrigin: string
    currentScope: { tenantId: string; storeId: string }
  },
) {
  const source = whatsAppWorkflowActionSourceSchema.safeParse(sourceInput)
  const result = whatsAppWorkflowActionResultSchema.safeParse(resultInput)
  if (
    !source.success ||
    !result.success ||
    source.data.purpose !== result.data.purpose ||
    source.data.conversationId !== result.data.conversationId ||
    source.data.draftId !== result.data.draftId ||
    source.data.selection.length !== result.data.results.length ||
    result.data.results.some(
      (entry, index) =>
        entry.entityId !== source.data.selection[index]?.entityId ||
        entry.key !== source.data.selection[index]?.key,
    )
  )
    throw Error("Canonical workflow receipt unavailable")
  if (result.data.results.every((entry) => entry.state === "CANCELLED"))
    return "Workflow review cancelled. No records were added by this confirmation."
  if (result.data.results.some((entry) => entry.state === "CANCELLED"))
    throw Error("Canonical workflow receipt unavailable")
  const saved = result.data.results.filter(
    (entry) => entry.state === "COMMITTED",
  )
  const failed = result.data.results.filter((entry) => entry.state === "FAILED")
  const lines = [
    saved.length
      ? `Saved in EwaTrade: ${saved.length} selected ${saved.length === 1 ? "record" : "records"}.`
      : "No selected records were added.",
  ]
  // Exact per-record links only for the original business/Store.
  const inScope =
    options &&
    source.data.origin.tenantId === options.currentScope.tenantId &&
    source.data.origin.storeId === options.currentScope.storeId
  for (const entry of saved) {
    const added =
      entry.name && entry.kind
        ? `Added ${entry.kind.toLowerCase()}: ${entry.name}`
        : `Added saved draft: ${entry.key}`
    const href =
      inScope && entry.recordId && entry.kind !== "CUSTOMER"
        ? catalogItemAppHref(entry.recordId, options)
        : undefined
    lines.push(href ? `${added}\n${href}` : added)
  }
  if (failed.length)
    lines.push(
      `${failed.length} selected ${failed.length === 1 ? "record needs" : "records need"} review in EwaTrade before retrying.`,
    )
  const link = options
    ? workflowConversationAppLink(
        {
          purpose: source.data.purpose,
          conversationId: source.data.conversationId,
          origin: source.data.origin,
        },
        options,
      )
    : undefined
  const safe = lines.every((line) => {
    const text = line.split("\n")[0] ?? ""
    return !text.includes("…") && whatsAppPlainText(text) === text
  })
  const body =
    safe && lines.join("\n\n").length <= 2400
      ? lines.join("\n\n")
      : saved.length
        ? "Selected records saved in EwaTrade. Open the saved workflow for the complete original receipt."
        : "Open the saved workflow in EwaTrade to review this selection before retrying."
  return `${body}${link ? `\n\nOpen the saved workflow in its original business and Store:\n${link}` : ""}`
}
