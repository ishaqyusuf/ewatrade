import { createHash, randomUUID } from "node:crypto"
import {
  WHATSAPP_CONTROL_LIFETIME_MS,
  WHATSAPP_CONTROL_PAGE_SIZE,
  WHATSAPP_CONTROL_RENDER_VERSION,
  type WhatsAppControlAction,
  type WhatsAppControlMenu,
  parseWhatsAppControl,
  renderWhatsAppControl,
  whatsAppControlContentSchema,
  whatsAppControlLabel,
} from "@ewatrade/assistant/channels/controls"
import type { WhatsAppIngressInput } from "@ewatrade/assistant/channels/ingress"
import type { WhatsAppTurnResult } from "@ewatrade/assistant/channels/worker"
import {
  type AssistantWhatsAppIdentity,
  Prisma,
  type PrismaClient,
} from "../../../generated/prisma/client"
import { runInOwnSerializableTransaction } from "../own-transaction"
import type { DbClient } from "../types"
import { AssistantWhatsAppError } from "./authority"
import {
  assistantWhatsAppControlAuthorityDigest,
  assistantWhatsAppControlRenderOptions,
  liveControlGrant,
  primaryControlScope,
  readControlScope,
} from "./control-authority"
import { resolveAssistantWhatsAppConversation } from "./conversations"
import { touchAssistantWhatsAppActivity } from "./grants"
import type { WhatsAppInboxReceipt } from "./inbox"
import { selectAssistantWhatsAppScopeForIdentityInTransaction } from "./scope-controls"
import { reserveAssistantWhatsAppTransportInTransaction } from "./usage"
const hash = (value: string) => createHash("sha256").update(value).digest("hex")

/** A control uses the same endpoint/message dedupe key as a model turn, never a parallel ingress table. */
export async function acceptAssistantWhatsAppControlIngress(
  db: PrismaClient,
  event: WhatsAppIngressInput,
  permittedUserIds: readonly string[],
  now: Date,
): Promise<WhatsAppInboxReceipt | null> {
  const command =
    event.type === "text"
      ? parseWhatsAppControl(event.text, event.replyToMessageId)
      : null
  if (!command) return null
  const providerOccurredAt = new Date(Number(event.timestamp) * 1000)
  if (
    providerOccurredAt.getTime() <
    now.getTime() - WHATSAPP_CONTROL_LIFETIME_MS
  )
    return { kind: "ignored", reason: "stale" }
  const content = { type: "control" as const, command }
  const contentDigest = hash(JSON.stringify(content))
  return runInOwnSerializableTransaction(db, async (tx) => {
    await tx.$queryRaw`SELECT id FROM "AssistantWhatsAppIdentity" WHERE "phoneNumberId"=${event.phoneNumberId} AND "senderId"=${event.senderId} FOR UPDATE`
    const prior = await tx.assistantWhatsAppInbox.findUnique({
      where: {
        phoneNumberId_providerMessageId: {
          phoneNumberId: event.phoneNumberId,
          providerMessageId: event.providerMessageId,
        },
      },
      include: { identity: { select: { senderId: true } } },
    })
    if (prior)
      return prior.kind === "CONTROL" &&
        !prior.bindingId &&
        prior.identity?.senderId === event.senderId &&
        prior.contentDigest === contentDigest
        ? {
            kind: "control_duplicate" as const,
            bindingId: null,
            id: prior.id,
            identityId: prior.identityId ?? "",
            requestId: prior.requestId,
          }
        : { kind: "ignored", reason: "collision" }
    const identity = await tx.assistantWhatsAppIdentity.findUnique({
      where: {
        phoneNumberId_senderId: {
          phoneNumberId: event.phoneNumberId,
          senderId: event.senderId,
        },
      },
    })
    if (
      !identity ||
      identity.revokedAt ||
      !permittedUserIds.includes(identity.userId)
    )
      return { kind: "ignored", reason: "unlinked" }
    let primary: Awaited<ReturnType<typeof primaryControlScope>>
    try {
      primary = await primaryControlScope(tx, identity, now)
    } catch (error) {
      if (error instanceof AssistantWhatsAppError)
        return { kind: "ignored", reason: "unavailable" }
      throw error
    }
    if (
      providerOccurredAt.getTime() <
      Math.floor(primary.grant.consentedAt.getTime() / 1000) * 1000
    )
      return { kind: "ignored", reason: "stale" }
    const usage = await reserveAssistantWhatsAppTransportInTransaction(
      tx,
      primary.scope,
      "ingress",
      now,
    )
    if (!usage.allowed) return { kind: "ignored", reason: "rate_limited" }
    await touchAssistantWhatsAppActivity(
      tx,
      primary.grant,
      identity.generation,
      now,
    )
    const superseded = await tx.assistantWhatsAppInbox.findMany({
      where: { kind: "CONTROL", identityId: identity.id, state: "PENDING" },
      select: { id: true },
    })
    if (superseded.length)
      await tx.assistantWhatsAppInbox.updateMany({
        where: { id: { in: superseded.map((row) => row.id) } },
        data: {
          state: "CANCELLED",
          content: Prisma.DbNull,
          errorCode: "CONTROL_SUPERSEDED",
          completedAt: now,
        },
      })
    const updated = await tx.assistantWhatsAppIdentity.update({
      where: { id: identity.id },
      data: { controlSequence: { increment: 1 } },
    })
    const row = await tx.assistantWhatsAppInbox.create({
      data: {
        id: `wa-control_${randomUUID()}`,
        kind: "CONTROL",
        identityId: identity.id,
        identityGeneration: identity.generation,
        selectionGeneration: identity.selectionGeneration,
        phoneNumberId: event.phoneNumberId,
        providerMessageId: event.providerMessageId,
        contentDigest,
        sequence: updated.controlSequence,
        requestId: randomUUID(),
        userMessageId: randomUUID(),
        content,
        receivedAt: now,
        providerOccurredAt,
        expiresAt: new Date(
          Math.min(now.getTime(), providerOccurredAt.getTime()) +
            WHATSAPP_CONTROL_LIFETIME_MS,
        ),
      },
    })
    return {
      kind: "control_accepted",
      bindingId: null,
      id: row.id,
      identityId: identity.id,
      requestId: row.requestId,
    }
  })
}

type Scope = Awaited<ReturnType<typeof readControlScope>>
async function selectedScope(
  db: DbClient,
  identity: AssistantWhatsAppIdentity,
  now: Date,
) {
  const binding = identity.activeBindingId
    ? await db.assistantWhatsAppBinding.findFirst({
        where: { id: identity.activeBindingId, identityId: identity.id },
      })
    : null
  if (!binding) return null
  try {
    return await resolveAssistantWhatsAppConversation(
      db,
      {
        kind: "linked_whatsapp",
        phoneNumberId: identity.phoneNumberId,
        senderId: identity.senderId,
        grantId: binding.grantId,
        grantGeneration: binding.grantGeneration,
        identityGeneration: binding.identityGeneration,
        bindingId: binding.id,
        selectionGeneration: binding.selectionGeneration,
      },
      now,
    )
  } catch (error) {
    if (error instanceof AssistantWhatsAppError) return null
    throw error
  }
}
function menuBase(
  identity: AssistantWhatsAppIdentity,
  primary: Scope,
  title: string,
  detail: string,
): WhatsAppControlMenu {
  return {
    version: WHATSAPP_CONTROL_RENDER_VERSION,
    identityGeneration: identity.generation,
    selectionGeneration: identity.selectionGeneration,
    quotaScope: primary.proof,
    scopes: [primary.proof],
    title,
    detail,
    choices: [],
  }
}
function addScope(
  menu: WhatsAppControlMenu,
  scope: WhatsAppControlMenu["scopes"][number],
) {
  if (
    !menu.scopes.some(
      (s) =>
        s.grantId === scope.grantId &&
        s.storeId === scope.storeId &&
        s.grantGeneration === scope.grantGeneration,
    )
  )
    menu.scopes.push(scope)
}
const label = whatsAppControlLabel

async function buildControlMenu(
  tx: Prisma.TransactionClient,
  identity: AssistantWhatsAppIdentity,
  primary: Scope,
  action: WhatsAppControlAction | { kind: "help" },
  now: Date,
): Promise<WhatsAppControlMenu> {
  if (action.kind === "help") {
    const selected = await selectedScope(tx, identity, now)
    const menu = menuBase(
      identity,
      primary,
      "EwaTrade assistant",
      "Send Business to choose a business, Store to change Store, New chat, or Continue chat. Business records keep their original scope. Send Disconnect to revoke this channel.",
    )
    menu.support = true
    if (selected) {
      menu.title = label(
        `${selected.tenantContext.tenant.name} · ${selected.tenantContext.activeStore?.name ?? "Store"}`,
        500,
      )
      addScope(menu, {
        grantId: selected.grant.id,
        grantGeneration: selected.grant.generation,
        storeId: selected.scope.storeId,
      })
      if (selected.conversation.purpose === "GENERAL")
        menu.conversationTarget = {
          conversationId: selected.conversation.id,
          purpose: "GENERAL",
          origin: {
            tenantId: selected.scope.tenantId,
            storeId: selected.scope.storeId,
          },
        }
    } else
      menu.detail =
        "Choose an accessible business and Store before continuing. Send Business. You can also reconnect in EwaTrade."
    return menu
  }
  if (action.kind === "businesses") {
    const menu = menuBase(
      identity,
      primary,
      "Choose a business",
      "Only businesses you explicitly connected are listed. Choosing a business opens its Store menu.",
    )
    const grants = await tx.assistantWhatsAppGrant.findMany({
      where: {
        identityId: identity.id,
        ...liveControlGrant(now),
        ...(action.cursor ? { id: { gt: action.cursor } } : {}),
      },
      orderBy: { id: "asc" },
      take: WHATSAPP_CONTROL_PAGE_SIZE + 1,
    })
    for (const grant of grants.slice(0, WHATSAPP_CONTROL_PAGE_SIZE)) {
      try {
        const resolved = await readControlScope(
          tx,
          identity,
          grant.id,
          undefined,
          now,
          grant.generation,
        )
        menu.choices.push({
          label: label(resolved.context.tenant.name),
          action: {
            kind: "stores",
            grantId: grant.id,
            grantGeneration: grant.generation,
          },
        })
        addScope(menu, resolved.proof)
      } catch (error) {
        if (!(error instanceof AssistantWhatsAppError)) throw error
      }
    }
    const cursor = grants[WHATSAPP_CONTROL_PAGE_SIZE - 1]?.id
    if (grants.length > WHATSAPP_CONTROL_PAGE_SIZE && cursor)
      menu.choices.push({
        label: "More businesses",
        action: { kind: "businesses", cursor },
      })
    if (!menu.choices.length)
      menu.detail =
        "No accessible businesses on this page. Reconnect the business in EwaTrade."
    return menu
  }
  const resolved = await readControlScope(
    tx,
    identity,
    action.grantId,
    action.kind === "stores" ? undefined : action.storeId,
    now,
    action.grantGeneration,
  )
  const menu = menuBase(
    identity,
    primary,
    label(
      `${resolved.context.tenant.name} · ${resolved.context.activeStore?.name ?? "Store"}`,
      500,
    ),
    "",
  )
  addScope(menu, resolved.proof)
  if (action.kind === "stores") {
    menu.title = label(`Choose a Store · ${resolved.context.tenant.name}`, 500)
    menu.detail =
      "Choose a Store to start a separate General chat. Existing chats and drafts stay in their original Store."
    const stores = resolved.context.stores
      .filter(
        (s) =>
          s.status === "ACTIVE" && (!action.cursor || s.id > action.cursor),
      )
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .slice(0, WHATSAPP_CONTROL_PAGE_SIZE + 1)
    for (const store of stores.slice(0, WHATSAPP_CONTROL_PAGE_SIZE)) {
      menu.choices.push({
        label: label(store.name),
        action: {
          kind: "new",
          grantId: resolved.grant.id,
          grantGeneration: resolved.grant.generation,
          storeId: store.id,
        },
      })
      addScope(menu, {
        grantId: resolved.grant.id,
        grantGeneration: resolved.grant.generation,
        storeId: store.id,
      })
    }
    const cursor = stores[WHATSAPP_CONTROL_PAGE_SIZE - 1]?.id
    if (stores.length > WHATSAPP_CONTROL_PAGE_SIZE && cursor)
      menu.choices.push({
        label: "More Stores",
        action: {
          kind: "stores",
          grantId: resolved.grant.id,
          grantGeneration: resolved.grant.generation,
          cursor,
        },
      })
    return menu
  }
  if (action.kind !== "chats") throw new AssistantWhatsAppError("UNAUTHORIZED")
  menu.detail =
    "Choose a saved chat. Its drafts keep their original business and Store. Rich or unavailable workflow steps continue in EwaTrade."
  const chats = await tx.assistantConversation.findMany({
    where: {
      ownerUserId: identity.userId,
      tenantId: resolved.grant.tenantId,
      storeId: action.storeId,
      status: "ACTIVE",
      ...(!["OWNER", "ADMIN"].includes(resolved.context.membership.role)
        ? { purpose: "GENERAL" as const }
        : {}),
      ...(action.cursor ? { id: { gt: action.cursor } } : {}),
    },
    orderBy: { id: "asc" },
    take: WHATSAPP_CONTROL_PAGE_SIZE + 1,
    select: { id: true, purpose: true, updatedAt: true },
  })
  for (const chat of chats.slice(0, WHATSAPP_CONTROL_PAGE_SIZE))
    menu.choices.push({
      label: label(
        `${chat.purpose === "GENERAL" ? "General" : chat.purpose === "SETUP" ? "Setup" : "Product"} · ${chat.updatedAt.toISOString().slice(0, 19).replace("T", " ")} UTC`,
      ),
      action: {
        kind: "resume",
        grantId: resolved.grant.id,
        grantGeneration: resolved.grant.generation,
        storeId: action.storeId,
        conversationId: chat.id,
        purpose: chat.purpose,
      },
    })
  const cursor = chats[WHATSAPP_CONTROL_PAGE_SIZE - 1]?.id
  if (chats.length > WHATSAPP_CONTROL_PAGE_SIZE && cursor)
    menu.choices.push({
      label: "More chats",
      action: {
        kind: "chats",
        grantId: resolved.grant.id,
        grantGeneration: resolved.grant.generation,
        storeId: action.storeId,
        cursor,
      },
    })
  if (!menu.choices.length)
    menu.detail =
      "No saved active chats in this Store. Send New chat to start one."
  return menu
}

/** One atomic model-free transaction: exact selection, consumed menu, reply proof and durable outbox. */
export async function processAssistantWhatsAppControl(
  db: PrismaClient,
  inboxId: string,
  permittedUserIds: readonly string[],
  now = new Date(),
): Promise<WhatsAppTurnResult | null> {
  const execute = (refusal: boolean) =>
    runInOwnSerializableTransaction(db, async (tx) => {
      await tx.$queryRaw`SELECT i.id FROM "AssistantWhatsAppIdentity" i JOIN "AssistantWhatsAppInbox" q ON q."identityId"=i.id WHERE q.id=${inboxId} FOR UPDATE OF i`
      const row = await tx.assistantWhatsAppInbox.findUnique({
        where: { id: inboxId },
        include: { identity: true },
      })
      if (!row || row.kind !== "CONTROL") return null
      const identity = row.identity
      const next = async () => {
        const next = identity
          ? await tx.assistantWhatsAppInbox.findFirst({
              where: {
                kind: "CONTROL",
                identityId: identity.id,
                state: "PENDING",
                id: { not: row.id },
              },
              orderBy: { sequence: "asc" },
              select: { id: true },
            })
          : null
        return next ? { nextIngressId: next.id } : {}
      }
      if (row.state !== "PENDING")
        return {
          status:
            row.state === "COMPLETED"
              ? ("completed" as const)
              : ("idle" as const),
          ...(await next()),
        }
      const cancel = async (state: "CANCELLED" | "EXPIRED") => {
        await tx.assistantWhatsAppInbox.update({
          where: { id: row.id },
          data: {
            state,
            content: Prisma.DbNull,
            errorCode:
              state === "EXPIRED" ? "CONTROL_EXPIRED" : "AUTHORITY_CHANGED",
            completedAt: now,
          },
        })
        return {
          status:
            state === "EXPIRED" ? ("expired" as const) : ("cancelled" as const),
          ...(await next()),
        }
      }
      if (row.expiresAt <= now) return cancel("EXPIRED")
      if (
        !identity ||
        row.bindingId ||
        identity.revokedAt ||
        !permittedUserIds.includes(identity.userId) ||
        identity.generation !== row.identityGeneration ||
        identity.selectionGeneration !== row.selectionGeneration ||
        identity.controlSequence !== row.sequence
      )
        return cancel("CANCELLED")
      const first = await tx.assistantWhatsAppInbox.findFirst({
        where: { kind: "CONTROL", identityId: identity.id, state: "PENDING" },
        orderBy: { sequence: "asc" },
        select: { id: true },
      })
      if (first?.id !== row.id) return { status: "busy" as const }
      const parsed = whatsAppControlContentSchema.safeParse(row.content)
      if (!parsed.success || parsed.data.menu) return cancel("CANCELLED")
      let primary: Scope
      try {
        primary = await primaryControlScope(tx, identity, now)
      } catch (error) {
        if (error instanceof AssistantWhatsAppError) return cancel("CANCELLED")
        throw error
      }
      const command = parsed.data.command
      let action: WhatsAppControlAction | { kind: "help" }
      let consumed: { id: string; content: ControlContent } | undefined
      if (refusal || command.kind === "invalid_choice")
        action = { kind: "help" }
      else if (command.kind === "choose") {
        const menuOutput = await tx.assistantWhatsAppOutbox.findUnique({
          where: {
            phoneNumberId_providerMessageId: {
              phoneNumberId: row.phoneNumberId,
              providerMessageId: command.replyToMessageId,
            },
          },
          include: { inbox: true },
        })
        const content = whatsAppControlContentSchema.safeParse(
          menuOutput?.inbox.content,
        )
        if (
          !menuOutput ||
          !["SENT", "DELIVERED", "READ"].includes(menuOutput.state) ||
          menuOutput.inbox.kind !== "CONTROL" ||
          menuOutput.inbox.identityId !== identity.id ||
          menuOutput.inbox.bindingId ||
          menuOutput.inbox.state !== "COMPLETED" ||
          menuOutput.inbox.sequence !== row.sequence - 1 ||
          menuOutput.inbox.expiresAt <= now ||
          !content.success ||
          !content.data.menu ||
          content.data.consumedBy ||
          content.data.menu.identityGeneration !== identity.generation ||
          content.data.menu.selectionGeneration !==
            identity.selectionGeneration ||
          !menuOutput.sentAt ||
          row.providerOccurredAt.getTime() <
            Math.floor(menuOutput.sentAt.getTime() / 1000) * 1000
        )
          throw new AssistantWhatsAppError("CONFLICT")
        const currentMenuDigest = await assistantWhatsAppControlAuthorityDigest(
          tx,
          identity,
          content.data.menu,
          now,
        )
        if (
          menuOutput.renderKind !== "control" ||
          menuOutput.rendererVersion !== WHATSAPP_CONTROL_RENDER_VERSION ||
          currentMenuDigest !== menuOutput.authorityDigest ||
          currentMenuDigest !== menuOutput.inbox.executionAuthorityDigest
        )
          throw new AssistantWhatsAppError("CONFLICT")
        const choice = content.data.menu.choices[command.index - 1]
        if (!choice) throw new AssistantWhatsAppError("CONFLICT")
        action = choice.action
        consumed = { id: menuOutput.inbox.id, content: content.data }
      } else if (command.kind === "businesses" || command.kind === "help")
        action = { kind: command.kind }
      else {
        const selected = await selectedScope(tx, identity, now)
        action = selected
          ? {
              kind: command.kind,
              grantId: selected.grant.id,
              grantGeneration: selected.grant.generation,
              storeId: selected.scope.storeId,
            }
          : { kind: "businesses" }
      }
      let current = identity
      let menu: WhatsAppControlMenu
      if (action.kind === "new" || action.kind === "resume") {
        const result =
          await selectAssistantWhatsAppScopeForIdentityInTransaction(
            tx,
            identity,
            {
              identityId: identity.id,
              grantId: action.grantId,
              storeId: action.storeId,
              requestId: row.requestId,
              expectedIdentityGeneration: identity.generation,
              expectedSelectionGeneration: identity.selectionGeneration,
              expectedGrantGeneration: action.grantGeneration,
              action:
                action.kind === "new"
                  ? { kind: "new" }
                  : {
                      kind: "resume",
                      conversationId: action.conversationId,
                      purpose: action.purpose,
                    },
            },
            now,
          )
        if (result.state !== "selected")
          throw new AssistantWhatsAppError("CONFLICT")
        current = await tx.assistantWhatsAppIdentity.findUniqueOrThrow({
          where: { id: identity.id },
        })
        primary = await primaryControlScope(tx, current, now)
        menu = await buildControlMenu(
          tx,
          current,
          primary,
          { kind: "help" },
          now,
        )
        menu.detail =
          result.purpose === "GENERAL"
            ? `${action.kind === "new" ? "New chat started" : "Saved chat selected"}. Send your question. Other chats and drafts keep their original scope.`
            : "Saved workflow selected. WhatsApp steps use this saved draft. Continue rich or unavailable steps in the exact EwaTrade workflow. Nothing is added without a complete review and explicit confirmation."
      } else menu = await buildControlMenu(tx, current, primary, action, now)
      if (!refusal && command.kind !== "invalid_choice") {
        const touched =
          "grantId" in action
            ? await readControlScope(
                tx,
                current,
                action.grantId,
                "storeId" in action ? action.storeId : undefined,
                now,
              )
            : command.kind === "help"
              ? await selectedScope(tx, current, now)
              : null
        if (touched)
          await touchAssistantWhatsAppActivity(
            tx,
            touched.grant,
            current.generation,
            now,
            row.receivedAt,
          )
      }
      if (refusal || command.kind === "invalid_choice")
        menu.detail =
          "That menu changed, expired or was not quoted. Send Business, Store or Continue chat for a fresh menu, then reply to that exact message with Choose 1 (or another listed number)."
      const authorityDigest = await assistantWhatsAppControlAuthorityDigest(
        tx,
        current,
        menu,
        now,
      )
      const body = renderWhatsAppControl(
        menu,
        assistantWhatsAppControlRenderOptions(menu),
      )
      if (consumed)
        await tx.assistantWhatsAppInbox.update({
          where: { id: consumed.id },
          data: { content: { ...consumed.content, consumedBy: row.id } },
        })
      await tx.assistantWhatsAppOutbox.create({
        data: {
          inboxId: row.id,
          phoneNumberId: row.phoneNumberId,
          chunkIndex: 0,
          chunkCount: 1,
          rendererVersion: WHATSAPP_CONTROL_RENDER_VERSION,
          renderKind: "control",
          authorityDigest,
          content: body,
          contentDigest: hash(body),
          expiresAt: row.expiresAt,
        },
      })
      await tx.assistantWhatsAppInbox.update({
        where: { id: row.id },
        data: {
          state: "COMPLETED",
          executionAuthorityDigest: authorityDigest,
          content: { ...parsed.data, menu },
          completedAt: now,
        },
      })
      return { status: "completed" as const, ...(await next()) }
    })
  try {
    return await execute(false)
  } catch (error) {
    if (!(error instanceof AssistantWhatsAppError)) throw error
    return execute(true)
  }
}
type ControlContent = Extract<
  ReturnType<typeof whatsAppControlContentSchema.parse>,
  { type: "control" }
>
