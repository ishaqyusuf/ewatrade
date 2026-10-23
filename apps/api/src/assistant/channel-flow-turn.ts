import { randomBytes } from "node:crypto"
import { capabilityForAction } from "@ewatrade/assistant/capabilities/manifest"
import {
  capabilityActionHandoffInstruction,
  classifyCapabilityAction,
} from "@ewatrade/assistant/channels/capability-action-handoff"
import { WHATSAPP_DELIVERY_REQUEST_MS } from "@ewatrade/assistant/channels/delivery"
import {
  parseWhatsAppFlowSubmission,
  whatsAppFlowFirstScreen,
  whatsAppFlowRequiredOptions,
} from "@ewatrade/assistant/channels/flows"
import { presentWhatsAppMessage } from "@ewatrade/assistant/channels/presentation"
import type {
  GeneralAction,
  generalStoredPartSchema,
} from "@ewatrade/assistant/general/contracts"
import {
  DirectMetaWhatsAppProvider,
  readAssistantWhatsAppConfig,
} from "@ewatrade/communications"
import {
  type AssistantStoredMessage,
  beginAssistantRunInTransaction,
  completeAssistantRunInTransaction,
} from "@ewatrade/db/assistant"
import { readGeneralActiveRun } from "@ewatrade/db/assistant-general"
import {
  type WhatsAppInboxLease,
  assistantWhatsAppAuthorityDigest,
  stampAssistantWhatsAppExecution,
} from "@ewatrade/db/assistant-whatsapp"
import { previewOrdinaryStockReceipt } from "@ewatrade/db/queries"
import { financePostingDayStart } from "@ewatrade/utils/finance-posting-date"
import { evaluateQaProviderPolicy } from "@ewatrade/utils/qa-provider-policy"
import { TRPCError } from "@trpc/server"
import { z } from "zod"
import {
  type BusinessFlowKind,
  assertBusinessFlowAuthority,
  businessFlowOptions,
  nativeFlowActions,
} from "./channel-flow-options"
import {
  NATIVE_FLOW_KIND,
  NATIVE_FLOW_TTL_MS,
  nativeFlowCommand,
  nativeFlowDigest,
  nativeFlowOptionsAvailable,
  nativeFlowReturnMatches,
  nativeFlowReturnSchema,
  nativeFlowStateSchema,
} from "./channel-flow-state"
import {
  isLinkedAssistantIdentity,
  lockLinkedAssistantIdentity,
  resolveLinkedAssistantIdentity,
} from "./channel-principal"
import { hasCurrentWhatsAppEdit } from "./channel-proposal-edit"
import type { GeneralContext } from "./general-context"
import { requireGeneralScope } from "./general-context"
import {
  draftGeneralProposalInTransaction,
  inFreshGeneralTransaction,
} from "./general-proposals"
import { simpleExpenseOptions } from "./general-simple-expense"
import { proposalDigest } from "./proposal-security"

type Inbox = { requestId: string; userMessageId: string; content: unknown }
type Part = z.infer<typeof generalStoredPartSchema>
const FLOW_MODEL = {
  provider: "deterministic",
  model: "whatsapp-hybrid-form-v1",
  promptVersion: "whatsapp-hybrid-form-v1",
}
const fallback =
  "The form is unavailable. Type the details here, or open this saved chat in EwaTrade. No business change has been made."
const flowId = (kind: BusinessFlowKind) =>
  process.env[`ASSISTANT_WHATSAPP_FLOW_${kind.toUpperCase()}_ID`]?.trim()

/** Local native forms are deterministic turns, not fabricated model output or approval. */
export async function processAssistantWhatsAppFlowTurn(
  ctx: GeneralContext,
  lease: WhatsAppInboxLease,
  inbox: Inbox,
): Promise<boolean> {
  const content = z
    .object({ type: z.literal("text"), text: z.string() })
    .passthrough()
    .safeParse(inbox.content)
  const command = content.success ? nativeFlowCommand(content.data.text) : null
  const returned = nativeFlowReturnSchema.safeParse(inbox.content)
  const invalid = Boolean(
    inbox.content &&
      typeof inbox.content === "object" &&
      "type" in inbox.content &&
      inbox.content.type === "invalid_native_flow",
  )
  if (!command && !returned.success && !invalid) return false
  if (
    !isLinkedAssistantIdentity(ctx.session) ||
    ctx.session.purpose !== "GENERAL"
  )
    return false
  if (command && (await hasCurrentWhatsAppEdit(ctx))) return false
  let launch:
    | {
        token: string
        kind: BusinessFlowKind
        id: string
        data: Record<string, unknown>
      }
    | undefined
  if (command) {
    try {
      assertBusinessFlowAuthority(ctx, command)
      const id = flowId(command)
      const data =
        id && /^\d{1,64}$/.test(id)
          ? await businessFlowOptions(ctx, command)
          : undefined
      if (
        id &&
        data &&
        nativeFlowOptionsAvailable(data, whatsAppFlowRequiredOptions[command])
      )
        launch = {
          token: randomBytes(32).toString("base64url"),
          kind: command,
          id,
          data,
        }
    } catch {
      /* An unavailable form preserves the ordinary/app route. */
    }
  }
  let reply = fallback
  if (launch) {
    // Claim once before provider I/O. Uncertain acceptance must never duplicate a form.
    const prepared = await inFreshGeneralTransaction(ctx, async (fresh) => {
      if (!isLinkedAssistantIdentity(fresh.session))
        throw Error("Linked identity required.")
      const current = await lockLinkedAssistantIdentity(fresh.db, fresh.session)
      await stampAssistantWhatsAppExecution(fresh.db, lease, current)
      const sessionId = `wa-flow_native_${nativeFlowDigest(inbox.requestId)}`
      const prior = await fresh.db.onboardingSession.findUnique({
        where: { id: sessionId },
      })
      if (prior) return { send: false, sessionId }
      assertBusinessFlowAuthority(fresh, launch.kind)
      // A replacement launch supersedes earlier unsubmitted forms for this sender.
      // The identity lock is shared with return consumption and scope switching.
      await fresh.db.onboardingSession.deleteMany({
        where: {
          token: { startsWith: "wa-flow_native_" },
          completed: false,
          AND: [
            { formData: { path: ["kind"], equals: NATIVE_FLOW_KIND } },
            {
              formData: {
                path: ["phoneNumberId"],
                equals: fresh.session.principal.phoneNumberId,
              },
            },
            {
              formData: {
                path: ["senderId"],
                equals: fresh.session.principal.senderId,
              },
            },
          ],
        },
      })
      await fresh.db.onboardingSession.create({
        data: {
          id: sessionId,
          token: `wa-flow_native_${nativeFlowDigest(launch.token)}`,
          tenantId: current.scope.tenantId,
          userId: current.scope.userId,
          expiresAt: new Date(Date.now() + NATIVE_FLOW_TTL_MS),
          formData: {
            kind: NATIVE_FLOW_KIND,
            formKind: launch.kind,
            phoneNumberId: current.principal.phoneNumberId,
            senderId: current.principal.senderId,
            bindingId: current.binding.id,
            scopeDigest: await assistantWhatsAppAuthorityDigest(
              fresh.db,
              current,
            ),
            delivery: "SENDING",
          },
        },
      })
      return { send: true, sessionId }
    })
    if (prepared.send) {
      const config = readAssistantWhatsAppConfig()
      try {
        if (!config) throw Error("Assistant disabled.")
        // Fresh authority immediately before send; the provider never receives a user-selected scope.
        const latest = await resolveLinkedAssistantIdentity(
          ctx.db,
          ctx.session.principal,
          lease,
        )
        const liveContext = {
          ...ctx,
          session: latest.identity,
          tenantContext: latest.tenantContext,
        }
        assertBusinessFlowAuthority(liveContext, launch.kind)
        if (
          !evaluateQaProviderPolicy({
            operation: "whatsapp",
            adapter: "live",
            tenantDataClassification:
              latest.tenantContext.tenant.dataClassification,
          }).allowed
        )
          throw Error("QA live provider blocked.")
        const launchRecord = await ctx.db.onboardingSession.findUniqueOrThrow({
          where: { id: prepared.sessionId },
        })
        const issued = nativeFlowStateSchema.parse(launchRecord.formData)
        if (
          issued.scopeDigest !==
            (await assistantWhatsAppAuthorityDigest(ctx.db, latest)) ||
          issued.bindingId !== latest.binding.id ||
          launchRecord.expiresAt <= new Date()
        )
          throw Error("Form scope changed.")
        const provider = new DirectMetaWhatsAppProvider({
          fetch: Object.assign(
            (
              url: Parameters<typeof fetch>[0],
              init?: Parameters<typeof fetch>[1],
            ) =>
              fetch(url, {
                ...init,
                redirect: "error",
                signal: AbortSignal.timeout(WHATSAPP_DELIVERY_REQUEST_MS),
              }),
            { preconnect: fetch.preconnect },
          ),
        })
        await provider.sendFlow({
          ...config,
          to: ctx.session.principal.senderId,
          flowId: launch.id,
          flowToken: launch.token,
          screen: whatsAppFlowFirstScreen[launch.kind],
          data: launch.data,
          body: presentWhatsAppMessage(
            `${String(launch.data.scope_label)}\n\nComplete the form to prepare a draft. Submission never saves a business change.`,
            { family: "form", maxUnits: 1024 },
          ),
          cta: "Open form",
        })
        const row = await ctx.db.onboardingSession.findUniqueOrThrow({
          where: { id: prepared.sessionId },
        })
        const state = nativeFlowStateSchema.parse(row.formData)
        await ctx.db.onboardingSession.update({
          where: { id: row.id },
          data: { formData: { ...state, delivery: "SENT" } },
        })
        reply =
          "Open the form above. Review the resulting draft before confirming. You can also type the details here."
      } catch {
        const row = await ctx.db.onboardingSession.findUnique({
          where: { id: prepared.sessionId },
        })
        const state = nativeFlowStateSchema.safeParse(row?.formData)
        if (row && state.success)
          await ctx.db.onboardingSession.update({
            where: { id: row.id },
            data: { formData: { ...state.data, delivery: "UNKNOWN" } },
          })
        reply =
          "The form delivery could not be confirmed. I won’t send it again automatically. If it arrived, start a new form before submitting; otherwise type the details here. No business change has been made."
      }
    } else
      reply =
        "This form request was already handled. Use the form that arrived, or type the details here. No duplicate form was sent."
  }
  try {
    await inFreshGeneralTransaction(ctx, async (fresh) => {
      if (!isLinkedAssistantIdentity(fresh.session))
        throw Error("Linked identity required.")
      const current = await lockLinkedAssistantIdentity(fresh.db, fresh.session)
      await stampAssistantWhatsAppExecution(fresh.db, lease, current)
      await fresh.db
        .$queryRaw`SELECT id FROM "AssistantConversation" WHERE id=${current.conversation.id} FOR UPDATE`
      const activeRun = await readGeneralActiveRun(
        fresh.db,
        current.scope,
        current.conversation.id,
      )
      if (activeRun)
        throw new TRPCError({
          code: "CONFLICT",
          message: "A reply is running.",
        })
      const begun = await beginAssistantRunInTransaction(fresh.db, {
        ...FLOW_MODEL,
        actorUserId: current.scope.userId,
        conversationId: current.conversation.id,
        requestId: inbox.requestId,
        userMessage: {
          id: inbox.userMessageId,
          role: "user",
          parts: [
            {
              type: "text",
              text: content.success
                ? content.data.text
                : "Submitted a WhatsApp form for review.",
            },
          ],
        },
      })
      if (begun.replay) return
      const parts: Part[] = [{ type: "text", text: reply }]
      if (returned.success) {
        const row = await fresh.db.onboardingSession.findUnique({
          where: { token: `wa-flow_native_${returned.data.tokenDigest}` },
        })
        const saved = nativeFlowStateSchema.safeParse(row?.formData)
        const scopeDigest = await assistantWhatsAppAuthorityDigest(
          fresh.db,
          current,
        )
        if (
          !row ||
          row.completed ||
          !saved.success ||
          !nativeFlowReturnMatches(
            saved.data,
            { ...fresh.session.principal, scopeDigest },
            row.expiresAt,
          )
        )
          throw Error("Form expired, changed or already used.")
        const kind = saved.data.formKind
        assertBusinessFlowAuthority(fresh, kind)
        const parsed = parseWhatsAppFlowSubmission(kind, returned.data.data)
        if (!parsed.success || !("action" in parsed.data))
          throw Error("Review the form fields and submit a new form.")
        let action: GeneralAction = parsed.data
        if (action.action === "expense_record_simple" && action.effectiveAt) {
          const options = await simpleExpenseOptions(fresh)
          if (!options.book || options.book.id !== action.bookId)
            throw Error("Finance Book changed.")
          action = {
            ...action,
            effectiveAt: financePostingDayStart(
              action.effectiveAt.slice(0, 10),
              options.book.startsAt,
            ).toISOString(),
          }
        }
        if (action.action !== nativeFlowActions[kind])
          throw Error("Form purpose changed.")
        if (action.action === "stock_receive") {
          const preview = await previewOrdinaryStockReceipt(fresh.db, {
            ...requireGeneralScope(fresh),
            ...action,
          })
          const handoff = classifyCapabilityAction(
            capabilityForAction("stock_receive"),
          )
          if (handoff.kind !== "app_review") throw Error("App review required.")
          const summary = `Receive ${preview.enteredQuantity} ${preview.enteredUnitName} of ${preview.productName} · ${preview.variantName}. Source: ${action.source}. Reason: ${action.reason}.${action.supplierName ? ` Supplier: ${action.supplierName}.` : ""}${action.unitCostMinor !== undefined ? ` Unit cost (minor units): ${action.unitCostMinor}.` : ""}`
          // This is a saved request, not a proposal or a credential-bearing app URL.
          await fresh.db.assistantMessage.update({
            where: { id: inbox.userMessageId },
            data: { parts: [{ type: "text", text: summary }] },
          })
          parts.splice(0, parts.length, {
            type: "data-general-answer",
            data: {
              id: `flow-handoff-${inbox.requestId}`,
              title: "Receive stock",
              value: "Continue in EwaTrade",
              scope: fresh.tenantContext.activeStore?.name ?? "Store",
              asOf: new Date().toISOString(),
              detail: capabilityActionHandoffInstruction,
              handoff: {
                kind: "action_app_handoff",
                version: 1,
                capabilityId: capabilityForAction("stock_receive").id,
                action: "stock_receive",
                reason: handoff.reason,
                conversation: {
                  conversationId: current.conversation.id,
                  purpose: "GENERAL",
                  origin: {
                    tenantId: current.scope.tenantId,
                    storeId: current.scope.storeId,
                  },
                },
              },
            },
          })
        } else {
          const draft = await draftGeneralProposalInTransaction(
            fresh,
            current.conversation.id,
            action,
          )
          parts.splice(
            0,
            parts.length,
            {
              type: "text",
              text: "Form received. Review the exact draft below. Nothing has been saved to your business yet.",
            },
            {
              type: "data-general-proposal-reference",
              data: {
                proposalId: draft.proposalId,
                revision: draft.revision,
                payloadHash: proposalDigest(draft.payload),
              },
            },
          )
        }
        await fresh.db.onboardingSession.update({
          where: { id: row.id },
          data: {
            completed: true,
            formData: { ...saved.data, consumedBy: inbox.requestId },
          },
        })
      }
      await completeAssistantRunInTransaction(fresh.db, {
        ...FLOW_MODEL,
        runId: begun.run.id,
        tenantId: current.scope.tenantId,
        actorUserId: current.scope.userId,
        status: "COMPLETED",
        assistantMessage: {
          id: `${inbox.requestId}-form-answer`,
          role: "assistant",
          parts: parts as AssistantStoredMessage["parts"],
        },
      })
    })
  } catch (error) {
    if (!returned.success) throw error
    // Invalid structured returns never reach a model or create a proposal. Record a safe recovery reply.
    await inFreshGeneralTransaction(ctx, async (fresh) => {
      if (!isLinkedAssistantIdentity(fresh.session))
        throw Error("Linked identity required.")
      const current = await lockLinkedAssistantIdentity(fresh.db, fresh.session)
      await stampAssistantWhatsAppExecution(fresh.db, lease, current)
      await fresh.db
        .$queryRaw`SELECT id FROM "AssistantConversation" WHERE id=${current.conversation.id} FOR UPDATE`
      const activeRun = await readGeneralActiveRun(
        fresh.db,
        current.scope,
        current.conversation.id,
      )
      if (activeRun)
        throw new TRPCError({
          code: "CONFLICT",
          message: "A reply is running.",
        })
      const begun = await beginAssistantRunInTransaction(fresh.db, {
        ...FLOW_MODEL,
        actorUserId: current.scope.userId,
        conversationId: current.conversation.id,
        requestId: inbox.requestId,
        userMessage: {
          id: inbox.userMessageId,
          role: "user",
          parts: [
            { type: "text", text: "A WhatsApp form could not be accepted." },
          ],
        },
      })
      if (begun.replay) return
      await completeAssistantRunInTransaction(fresh.db, {
        ...FLOW_MODEL,
        runId: begun.run.id,
        tenantId: current.scope.tenantId,
        actorUserId: current.scope.userId,
        status: "COMPLETED",
        assistantMessage: {
          id: `${inbox.requestId}-form-answer`,
          role: "assistant",
          parts: [
            {
              type: "text",
              text: "That form is expired, already used, invalid, or your access changed. Start a new form or type the details here. Nothing was saved.",
            },
          ],
        },
      })
    })
  }
  return true
}
