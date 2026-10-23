import { createHash, randomUUID } from "node:crypto"
import {
  WHATSAPP_CONTROL_LIFETIME_MS,
  WHATSAPP_CONTROL_PAGE_SIZE,
  WHATSAPP_CONTROL_RENDER_VERSION,
  type WhatsAppControlAction,
  type WhatsAppControlCapability,
  type WhatsAppControlCategory,
  type WhatsAppControlMenu,
  parseWhatsAppControl,
  parseWhatsAppControlButton,
  renderWhatsAppControl,
  whatsAppControlContentSchema,
  whatsAppControlLabel,
  whatsAppControlTaskStarter,
} from "@ewatrade/assistant/channels/controls"
import type { WhatsAppIngressInput } from "@ewatrade/assistant/channels/ingress"
import { assistantWhatsAppUserAllowed } from "@ewatrade/assistant/channels/policy"
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
import { enqueueAssistantWhatsAppControlTaskInTransaction } from "./control-task"
import {
  disconnectAssistantWhatsAppInTransaction,
  resolveAssistantWhatsAppConversation,
} from "./conversations"
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
    event.type === "interactive"
      ? parseWhatsAppControlButton(event.quickActionId, event.replyToMessageId)
      : event.type === "text"
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
      !assistantWhatsAppUserAllowed(identity.userId, permittedUserIds)
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

export type WhatsAppControlOptions = {
  cancelDraft?: (
    selected: NonNullable<Awaited<ReturnType<typeof selectedScope>>>,
    db: Prisma.TransactionClient,
    requestId: string,
  ) => Promise<string>
  /** API-owned domain assertions avoid a second permission matrix in the channel. */
  helpExamples?: (
    selected: NonNullable<Awaited<ReturnType<typeof selectedScope>>>,
    db: Prisma.TransactionClient,
  ) => readonly string[] | Promise<readonly string[]>
  menuCapabilities?: (
    selected: NonNullable<Awaited<ReturnType<typeof selectedScope>>>,
    db: Prisma.TransactionClient,
  ) =>
    | readonly WhatsAppControlCapability[]
    | Promise<readonly WhatsAppControlCapability[]>
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
  options: WhatsAppControlOptions = {},
  requestId = "",
): Promise<WhatsAppControlMenu> {
  if (action.kind === "disconnect_confirm")
    throw new AssistantWhatsAppError("CONFLICT")
  if (action.kind === "cancel") {
    const selected = await selectedScope(tx, identity, now)
    const menu = await buildControlMenu(
      tx,
      identity,
      primary,
      { kind: "help" },
      now,
      options,
    )
    menu.detail =
      selected && options.cancelDraft
        ? await options.cancelDraft(selected, tx, requestId)
        : "There is no current accessible draft to cancel here. Your WhatsApp connection stays active. Choose the draft's original business, Store and chat to cancel it."
    return menu
  }
  if (action.kind === "privacy") {
    const menu = menuBase(
      identity,
      primary,
      "WhatsApp assistant privacy",
      "I use messages you send to this EwaTrade number and business records your current access allows. I cannot read your other WhatsApp chats, contacts or email inbox. Verification codes are handled separately from ordinary assistant requests. Review assistant data in EwaTrade. Send DISCONNECT for confirmation or STOP to disconnect immediately; phone sign-in codes keep working.",
    )
    menu.choices = [
      { label: "Help", action: { kind: "help" } },
      { label: "Disconnect", action: { kind: "disconnect" } },
    ]
    return menu
  }
  if (action.kind === "disconnect") {
    const menu = menuBase(
      identity,
      primary,
      "Disconnect WhatsApp?",
      "This disconnects this WhatsApp number from all connected businesses. Your EwaTrade account, business records and saved chats stay in EwaTrade. STOP disconnects immediately at any time.",
    )
    menu.choices = [
      { label: "Disconnect", action: { kind: "disconnect_confirm" } },
      { label: "Stay connected", action: { kind: "help" } },
    ]
    return menu
  }
  if (action.kind === "help") {
    const selected = await selectedScope(tx, identity, now)
    const menu = menuBase(
      identity,
      primary,
      "EwaTrade assistant",
      "Send Menu for operations, Business, Store, New chat or Continue chat. Chats and drafts keep their original business and Store. Send Disconnect for confirmation, or STOP to disconnect immediately.",
    )
    menu.support = true
    if (selected) {
      const examples = ((await options.helpExamples?.(selected, tx)) ?? [])
        .slice(0, 6)
        .map((example) => label(example, 75))
      menu.detail = [
        `Current access: ${selected.tenantContext.membership.role}.`,
        examples.length
          ? `Try: ${examples.join("; ")}.`
          : "Ask about the records available with your current access. Some operations continue in EwaTrade.",
        menu.detail,
      ].join("\n")
      menu.choices = [
        {
          label: "Main menu",
          action: {
            kind: "menu",
            grantId: selected.grant.id,
            grantGeneration: selected.grant.generation,
            storeId: selected.scope.storeId,
          },
        },
        {
          label: "Switch Store",
          action: {
            kind: "stores",
            grantId: selected.grant.id,
            grantGeneration: selected.grant.generation,
          },
        },
        {
          label: "Saved chats",
          action: {
            kind: "chats",
            grantId: selected.grant.id,
            grantGeneration: selected.grant.generation,
            storeId: selected.scope.storeId,
          },
        },
      ]
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
  if (
    action.kind === "menu" ||
    action.kind === "category" ||
    action.kind === "capability_hint"
  ) {
    const selected = await selectedScope(tx, identity, now)
    if (
      !selected ||
      selected.scope.tenantId !== resolved.scope.tenantId ||
      selected.scope.storeId !== resolved.scope.storeId
    )
      throw new AssistantWhatsAppError("CONFLICT")
    const capabilities = (await options.menuCapabilities?.(selected, tx)) ?? []
    const proof = resolved.proof
    const main = { kind: "menu" as const, ...proof }
    if (selected.conversation.purpose === "GENERAL")
      menu.conversationTarget = {
        conversationId: selected.conversation.id,
        purpose: "GENERAL",
        origin: {
          tenantId: selected.scope.tenantId,
          storeId: selected.scope.storeId,
        },
      }
    const matchesCategory = (
      capability: WhatsAppControlCapability,
      category: WhatsAppControlCategory,
    ) =>
      category === "reports"
        ? /report|summary/.test(capability.id)
        : capability.domain === category
    if (action.kind === "capability_hint") {
      const capability = capabilities.find(
        (capability) => capability.id === action.capabilityId,
      )
      menu.title = label(capability?.title ?? "Option unavailable", 500)
      const starter = capability
        ? whatsAppControlTaskStarter(capability)
        : undefined
      if (starter) {
        menu.taskStarter = starter
        menu.detail =
          "Preparing the entry form for this business and Store. If forms are unavailable, I will show the supported typed or app path. No business change has been made; the completed draft still needs a separate review and confirmation."
        menu.choices = [{ label: "Main menu", action: main }]
        return menu
      }
      menu.detail = capability
        ? capability.availability === "native"
          ? `Send: ${label(capability.example, 300)}\nThis opens the normal assistant request or structured entry. Nothing has been changed. Any write still needs its complete review and explicit confirmation.`
          : `Send: ${label(capability.example, 300)}\nOr continue this saved chat in EwaTrade for ${label(capability.title, 160)}. Final review happens in the app. No draft or business change was created by choosing this option.`
        : "This option is unavailable with your current access or channel release. Open a fresh Menu to see current choices."
      menu.choices = [{ label: "Main menu", action: main }]
      return menu
    }
    if (action.kind === "category" && action.category === "settings") {
      menu.title = "Help & settings"
      menu.detail =
        "Your connection controls. Account and business settings continue in EwaTrade."
      const settingsChoices: WhatsAppControlMenu["choices"] = [
        { label: "Help", action: { kind: "help" } },
        { label: "Privacy", action: { kind: "privacy" } },
        { label: "Contact support", action: { kind: "help" } },
        { label: "Disconnect", action: { kind: "disconnect" } },
      ]
      const offset = (action.page ?? 0) * 2
      menu.choices = settingsChoices.slice(offset, offset + 2)
      menu.choices.push(
        offset + 2 < settingsChoices.length
          ? {
              label: "More options",
              action: { ...action, page: (action.page ?? 0) + 1 },
            }
          : { label: "Main menu", action: main },
      )
      return menu
    }
    if (action.kind === "menu") {
      const categories: Array<[WhatsAppControlCategory, string]> = [
        ["sales", "Sales"],
        ["inventory", "Stock"],
        ["customers", "Customers & suppliers"],
        ["finance", "Money"],
        ["catalog", "Products & prices"],
        ["services", "Services"],
        ["reports", "Reports"],
        ["scope", "Business & Store"],
        ["chats", "Chats"],
        ["settings", "Help & settings"],
      ]
      const choices = categories.filter(
        ([category]) =>
          ["scope", "chats", "settings"].includes(category) ||
          capabilities.some((capability) =>
            matchesCategory(capability, category),
          ),
      )
      const offset = (action.page ?? 0) * 2
      menu.title = label(
        `Main menu · ${resolved.context.tenant.name} · ${resolved.context.activeStore?.name}`,
        500,
      )
      menu.detail =
        "Only current operations your access allows are shown. Some require a complete review in EwaTrade. Choose a category; nothing is saved by opening a menu."
      menu.choices = choices
        .slice(offset, offset + 2)
        .map<WhatsAppControlMenu["choices"][number]>(([category, title]) => ({
          label: title,
          action:
            category === "scope"
              ? { kind: "businesses" }
              : category === "chats"
                ? { kind: "chats", ...proof }
                : { kind: "category", ...proof, category },
        }))
      if (offset + 2 < choices.length)
        menu.choices.push({
          label: "More categories",
          action: { ...main, page: (action.page ?? 0) + 1 },
        })
      else if (offset > 0)
        menu.choices.push({ label: "First categories", action: main })
      return menu
    }
    const available = capabilities.filter((capability) =>
      matchesCategory(capability, action.category),
    )
    const offset = (action.page ?? 0) * 2
    menu.title = label(
      `${action.category} · ${resolved.context.tenant.name} · ${resolved.context.activeStore?.name}`,
      500,
    )
    menu.detail = available.length
      ? "Choose an operation for instructions. App review is labelled; a menu never grants permission or confirms a write."
      : "No operation in this category is currently available with your access and channel release. Continue in EwaTrade for other features."
    menu.choices = available
      .slice(offset, offset + 2)
      .map<WhatsAppControlMenu["choices"][number]>((capability) => ({
        label: label(
          `${capability.title}${capability.availability === "app_review" ? " · app review" : ""}`,
        ),
        action: {
          kind: "capability_hint",
          ...proof,
          capabilityId: capability.id,
        },
      }))
    if (offset + 2 < available.length)
      menu.choices.push({
        label: "More operations",
        action: { ...action, page: (action.page ?? 0) + 1 },
      })
    else menu.choices.push({ label: "Main menu", action: main })
    return menu
  }
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
          kind: "select_review",
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
  if (action.kind === "select_review") {
    const current = await selectedScope(tx, identity, now)
    if (current)
      addScope(menu, {
        grantId: current.grant.id,
        grantGeneration: current.grant.generation,
        storeId: current.scope.storeId,
      })
    menu.title = label(
      `Use ${resolved.context.tenant.name} · ${resolved.context.activeStore?.name}?`,
      500,
    )
    menu.detail = `${current ? `You are currently using ${label(current.tenantContext.tenant.name, 160)} · ${label(current.tenantContext.activeStore?.name ?? "Store", 160)}. ` : ""}Switching starts a new chat here. Earlier chats and drafts stay in their original business and Store. Nothing is moved or saved by switching.`
    menu.choices = [
      { label: "Use this Store", action: { kind: "new", ...resolved.proof } },
      { label: "Keep current scope", action: { kind: "help" } },
    ]
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
  options: WhatsAppControlOptions = {},
): Promise<WhatsAppTurnResult | null> {
  const execute = (refusal: boolean) =>
    runInOwnSerializableTransaction(db, async (tx) => {
      // Match STOP/linking's sender-before-identity lock order before any revocation.
      const address = await tx.assistantWhatsAppInbox.findUnique({
        where: { id: inboxId },
        select: {
          identity: { select: { phoneNumberId: true, senderId: true } },
        },
      })
      if (address?.identity)
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`whatsapp-sender:${address.identity.phoneNumberId}:${address.identity.senderId}`}))`
      await tx.$queryRaw`SELECT i.id FROM "AssistantWhatsAppIdentity" i JOIN "AssistantWhatsAppInbox" q ON q."identityId"=i.id WHERE q.id=${inboxId} FOR UPDATE OF i`
      const row = await tx.assistantWhatsAppInbox.findUnique({
        where: { id: inboxId },
        include: { identity: true },
      })
      if (!row || row.kind !== "CONTROL") return null
      const identity = row.identity
      const next = async () => {
        const task = await tx.assistantWhatsAppInbox.findUnique({
          where: {
            phoneNumberId_providerMessageId: {
              phoneNumberId: row.phoneNumberId,
              providerMessageId: `control-task:${row.id}`,
            },
          },
          select: { id: true, kind: true, state: true },
        })
        if (
          task?.kind === "TURN" &&
          ["PENDING", "PROCESSING"].includes(task.state)
        )
          return { nextIngressId: task.id }
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
          ...(row.state === "COMPLETED" &&
          row.errorCode === "CHANNEL_DISCONNECTED"
            ? { disconnectedControlId: row.id }
            : {}),
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
        !assistantWhatsAppUserAllowed(identity.userId, permittedUserIds) ||
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
          (command.menuId !== undefined &&
            command.menuId !== menuOutput.inbox.id) ||
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
      } else if (
        command.kind === "businesses" ||
        command.kind === "help" ||
        command.kind === "privacy" ||
        command.kind === "cancel" ||
        command.kind === "disconnect"
      )
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
      if (action.kind === "disconnect_confirm") {
        if (!consumed) throw new AssistantWhatsAppError("CONFLICT")
        await tx.assistantWhatsAppInbox.update({
          where: { id: consumed.id },
          data: { content: { ...consumed.content, consumedBy: row.id } },
        })
        await disconnectAssistantWhatsAppInTransaction(
          tx,
          {
            phoneNumberId: identity.phoneNumberId,
            senderId: identity.senderId,
          },
          now,
        )
        // Revocation deliberately cancels all queued replies; it cannot authorize a
        // merchant outbox after disconnect. No model, business command or saved draft runs.
        await tx.assistantWhatsAppInbox.update({
          where: { id: row.id },
          data: {
            state: "COMPLETED",
            content: Prisma.DbNull,
            errorCode: "CHANNEL_DISCONNECTED",
            completedAt: now,
          },
        })
        return { status: "completed" as const, disconnectedControlId: row.id }
      }
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
          options,
        )
        menu.detail =
          result.purpose === "GENERAL"
            ? `${action.kind === "new" ? "New chat started" : "Saved chat selected"}. Send your question. Other chats and drafts keep their original scope.`
            : "Saved workflow selected. WhatsApp steps use this saved draft. Continue rich or unavailable steps in the exact EwaTrade workflow. Nothing is added without a complete review and explicit confirmation."
      } else
        menu = await buildControlMenu(
          tx,
          current,
          primary,
          action,
          now,
          options,
          row.requestId,
        )
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
      if (menu.taskStarter) {
        if (!consumed || action.kind !== "capability_hint")
          throw new AssistantWhatsAppError("CONFLICT")
        const selected = await selectedScope(tx, current, now)
        if (
          !selected ||
          selected.scope.storeId !== action.storeId ||
          selected.grant.id !== action.grantId
        )
          throw new AssistantWhatsAppError("CONFLICT")
        const task = await enqueueAssistantWhatsAppControlTaskInTransaction(
          tx,
          selected,
          row,
          menu.taskStarter,
          now,
        )
        if (task.kind === "rate_limited") {
          menu.taskStarter = undefined
          menu.detail =
            "This connection has reached its message limit. No form or business action was started. Try again later or continue in EwaTrade."
        }
      }
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
