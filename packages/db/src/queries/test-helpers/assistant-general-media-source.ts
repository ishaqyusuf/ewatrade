import type { Prisma } from "../../../generated/prisma/client"
import { fixture as decisionFixture } from "./commerce-quote-decision"

export const mediaSourceScope = {
  userId: "actor-1",
  tenantId: "tenant-1",
  storeId: "store-1",
}
function json(value: Prisma.JsonValue): Prisma.JsonValue {
  return value
}
function nullableText(value: string | null): string | null {
  return value
}
function nullableDate(value: Date | null): Date | null {
  return value
}
function field(value: unknown, key: string): unknown {
  return value !== null && typeof value === "object"
    ? Reflect.get(value, key)
    : undefined
}
function matches(value: unknown, where: unknown): boolean {
  if (where === null || typeof where !== "object") return value === where
  if (where instanceof Date)
    return value instanceof Date && value.getTime() === where.getTime()
  return Object.entries(where).every(([key, expected]) => {
    if (expected === undefined) return true
    if (key === "not") return !matches(value, expected)
    if (key === "in") return Array.isArray(expected) && expected.includes(value)
    if (key === "none")
      return (
        Array.isArray(value) && value.every((row) => !matches(row, expected))
      )
    if (key === "gt")
      return (
        value instanceof Date && expected instanceof Date && value > expected
      )
    return matches(field(value, key), expected)
  })
}
function project(value: unknown, args: unknown): unknown {
  if (value === null) return null
  if (Array.isArray(value)) {
    return value
      .filter((entry) => matches(entry, field(args, "where") ?? {}))
      .map((entry) => project(entry, args))
  }
  const select = field(args, "select")
  if (!select || typeof select !== "object") return structuredClone(value)
  const result: Record<string, unknown> = {}
  for (const [key, choice] of Object.entries(select)) {
    if (choice === true) result[key] = structuredClone(field(value, key))
    else if (choice) result[key] = project(field(value, key), choice)
  }
  return result
}
/** Actual query/permission composition over predicate/projection-aware inert
 * delegates. No canonical module is mocked. Every write, transaction, unlisted
 * delegate and raw query fails, including anything on the typed scaffold.
 * This does not establish a Session, actual SQL isolation or persisted authority.
 */
export function assistantGeneralMediaSourceFixture() {
  const scope = { ...mediaSourceScope }
  const user: {
    id: string
    accountPrivacyRequests: Array<{ status: string }>
  } = { id: scope.userId, accountPrivacyRequests: [] }
  const tenant = {
    id: scope.tenantId,
    isActive: true,
    qaPurgeStartedAt: nullableDate(null),
  }
  const store = {
    id: scope.storeId,
    tenantId: scope.tenantId,
    status: "ACTIVE",
  }
  const member = {
    id: "member-1",
    userId: scope.userId,
    tenantId: scope.tenantId,
    status: "ACTIVE",
    role: "OWNER",
    acceptedAt: nullableDate(new Date("2026-01-01T00:00:00Z")),
    staffAccessMode: "LEGACY",
    staffAccessRevision: 1,
    catalogEditor: false,
    tenant,
    retailOpsStaffProfile: { defaultStoreId: scope.storeId },
    staffStoreAssignments: [
      {
        tenantId: scope.tenantId,
        storeId: scope.storeId,
        status: "ACTIVE",
        role: "CASHIER",
        revision: 1,
        store,
      },
    ],
  }
  const conversation = {
    id: "chat-1",
    tenantId: scope.tenantId,
    storeId: scope.storeId,
    ownerUserId: scope.userId,
    purpose: "GENERAL",
    status: "ACTIVE",
    owner: user,
  }
  const message = {
    id: "message-1",
    conversationId: conversation.id,
    role: "user",
    parts: json([
      { type: "text", text: "Original saved text 😀" },
      {
        type: "data-setup-attachment",
        data: {
          attachmentId: "attachment-1",
          kind: "PDF",
          fileName: "PRIVATE_NAME.pdf",
          summary: "Short display excerpt",
        },
      },
    ]),
    conversation,
  }
  const attachment = {
    id: "attachment-1",
    actorUserId: scope.userId,
    tenantId: scope.tenantId,
    storeId: scope.storeId,
    conversationId: conversation.id,
    messageId: message.id,
    kind: "PDF",
    status: "READY",
    processingAttempts: 2,
    contentDigest: "a".repeat(64),
    transcript: nullableText(null),
    extraction: json({
      type: "pages",
      pages: [{ page: 1, text: "Exact original PDF page" }],
      totalPages: 1,
      truncated: false,
    }),
    retentionUntil: new Date("2099-01-01T00:00:00Z"),
    storageProvider: "PRIVATE_PROVIDER",
    storagePath: "PRIVATE_PATH",
    storageStoreId: "PRIVATE_BUCKET",
    fileName: "PRIVATE_NAME.pdf",
    contentType: "application/pdf",
    conversation,
  }
  const reads: Array<{ table: string; args: unknown }> = []
  const denied: string[] = []
  const tables: Record<string, () => unknown[]> = {
    user: () => [user],
    tenant: () => [tenant],
    store: () => [store],
    membership: () => [member],
    assistantConversation: () => [conversation],
    assistantMessage: () => [message],
    assistantAttachment: () => [attachment],
  }
  const tx = new Proxy(decisionFixture().tx, {
    get(_target, table: string) {
      if (table.startsWith("$"))
        return () => {
          denied.push(table)
          throw Error(`Forbidden ${table}`)
        }
      return new Proxy(
        {},
        {
          get(_delegate, method: string) {
            return async (args: unknown) => {
              if (method !== "findFirst" || !tables[table]) {
                denied.push(`${table}.${method}`)
                throw Error(`Forbidden ${table}.${method}`)
              }
              reads.push({ table, args })
              const row = tables[table]().find((row) =>
                matches(row, field(args, "where") ?? {}),
              )
              return project(row ?? null, args)
            }
          },
        },
      )
    },
  })
  return {
    tx,
    scope,
    user,
    tenant,
    store,
    member,
    conversation,
    message,
    attachment,
    reads,
    denied,
  }
}
