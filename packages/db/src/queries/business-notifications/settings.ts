import {
  type BusinessEventType,
  type BusinessNotificationPreferenceView,
  type BusinessNotificationSubscriptionView,
  businessEventTypes,
  businessNotificationPolicyInput,
  businessNotificationPreferenceInput,
  businessNotificationScopeSchema,
  businessNotificationSubscriptionInput,
  businessNotificationSubscriptionsInput,
} from "@ewatrade/notifications/business-events"
import { z } from "zod"
import { Prisma, type PrismaClient } from "../../../generated/prisma/client"
import { BusinessActivityError } from "../business-activity/errors"
import type {
  BusinessActivityScope,
  BusinessActivityViewer,
} from "../business-activity/scope"
import {
  notificationAdminScope,
  notificationCatalog,
  notificationMember,
  notificationScope,
  notificationTypeSupported,
  policyView,
  preferenceValue,
} from "./state"

const roles = new Set(["OWNER", "ADMIN", "MANAGER", "CASHIER", "OPERATOR"])
const subscriptionInclude = {
  stores: true,
  membership: { select: { userId: true, status: true, role: true } },
} satisfies Prisma.BusinessNotificationSubscriptionInclude
type SubscriptionRow = Prisma.BusinessNotificationSubscriptionGetPayload<{
  include: typeof subscriptionInclude
}>
type Tx = Prisma.TransactionClient
export async function withNotifications<T>(
  db: PrismaClient,
  run: (tx: Tx) => Promise<T>,
) {
  try {
    return await db.$transaction(run, {
      isolationLevel: "RepeatableRead",
      maxWait: 10_000,
      timeout: 30_000,
    })
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ["P2002", "P2034"].includes(error.code)
    )
      throw new BusinessActivityError(
        "CONFLICT",
        "Alert settings changed during this request. Refresh before saving.",
      )
    throw error
  }
}
async function lockConfig(tx: Tx, tenantId: string, type: string) {
  // Serialize absent-row creation as well as revision-checked updates, consistently before member locks.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify(["business-notifications", tenantId, type])},0))`
}
function assertMethods(
  type: BusinessEventType,
  inApp: boolean,
  email: boolean,
) {
  if (email || (inApp && !notificationTypeSupported(type)))
    throw new BusinessActivityError(
      "BAD_REQUEST",
      "This alert method is not available for this activity type yet.",
    )
}
async function subscriptionContext(
  tx: Tx,
  viewer: BusinessActivityViewer,
  rows: SubscriptionRow[],
  scope: BusinessActivityScope,
) {
  const ids = [...new Set(rows.map((row) => row.membershipId))].sort()
  if (ids.length)
    await tx.$queryRaw`SELECT id FROM "Membership" WHERE "tenantId"=${viewer.tenantId} AND id IN (${Prisma.join(ids)}) ORDER BY id FOR SHARE`
  const members = ids.length
    ? await tx.membership.findMany({
        where: { tenantId: viewer.tenantId, id: { in: ids } },
        select: {
          id: true,
          role: true,
          status: true,
          staffAccessMode: true,
          staffStoreAssignments: {
            where: {
              tenantId: viewer.tenantId,
              status: "ACTIVE",
              store: { tenantId: viewer.tenantId, status: "ACTIVE" },
            },
            select: { storeId: true },
          },
        },
      })
    : []
  const stores = await tx.store.findMany({
    where: { tenantId: viewer.tenantId },
    select: { id: true, status: true },
  })
  const policies = await tx.businessNotificationPolicy.findMany({
    where: { tenantId: viewer.tenantId },
  })
  const prefs = ids.length
    ? await tx.businessNotificationPreference.findMany({
        where: { tenantId: viewer.tenantId, membershipId: { in: ids } },
      })
    : []
  return { members, stores, policies, prefs, scope }
}
type SubscriptionContext = Awaited<ReturnType<typeof subscriptionContext>>
function subscriptionView(
  context: SubscriptionContext,
  row: SubscriptionRow,
): BusinessNotificationSubscriptionView {
  const type = row.type as BusinessEventType
  const parsedScope = businessNotificationScopeSchema.parse(
    row.scopeKind === "stores"
      ? { kind: "stores", storeIds: row.stores.map((store) => store.storeId) }
      : { kind: row.scopeKind },
  )
  const member = context.members.find(
    (member) => member.id === row.membershipId,
  )
  const manages = member?.role === "OWNER" || member?.role === "ADMIN"
  const active = member?.status === "ACTIVE" && roles.has(member.role)
  const storeIds = active
    ? context.stores
        .filter(
          (store) =>
            manages ||
            (store.status === "ACTIVE" &&
              (member.staffAccessMode !== "SCOPED" ||
                member.staffStoreAssignments.some(
                  (grant) => grant.storeId === store.id,
                ))),
        )
        .map((store) => store.id)
    : []
  const recipientScope = active && (manages || storeIds.length > 0)
  const policy = context.policies.find((row) => row.type === type)
  const pref = context.prefs.find(
    (pref) => pref.type === type && pref.membershipId === row.membershipId,
  )
  const effectiveStoreIds =
    parsedScope.kind === "stores"
      ? parsedScope.storeIds.filter((id) => storeIds.includes(id))
      : storeIds
  const category = notificationCatalog().find(
    (entry) => entry.type === type,
  )?.category
  const domain =
    recipientScope &&
    (category === "finance"
      ? manages && context.scope.finance
      : category === "staff" || category === "settings"
        ? manages
        : manages || category === "orders" || category === "payments")
  const enabled =
    preferenceValue(pref?.inApp) === "on" ||
    (preferenceValue(pref?.inApp) === "inherit" && policy?.inAppDefault)
  const blockedReason: BusinessNotificationSubscriptionView["blockedReason"] =
    member?.status !== "ACTIVE"
      ? "inactive_membership"
      : !recipientScope || !domain
        ? category === "finance"
          ? "needs_finance_access"
          : category === "staff" || category === "settings"
            ? "needs_staff_management"
            : "outside_store_scope"
        : parsedScope.kind === "stores" && effectiveStoreIds.length === 0
          ? "outside_store_scope"
          : !notificationTypeSupported(type)
            ? "unsupported_type"
            : !policy?.inAppAllowed
              ? "policy_disabled"
              : !row.enabled || !row.inAppAllowed
                ? "subscription_disabled"
                : !enabled
                  ? "preference_disabled"
                  : null
  return {
    id: row.id,
    membershipId: row.membershipId,
    type,
    enabled: row.enabled,
    scope: parsedScope,
    allowed: { inApp: row.inAppAllowed, email: false },
    effective: { inApp: blockedReason === null, email: false },
    effectiveStoreIds,
    blockedReason,
    revision: row.revision,
  }
}

export async function readNotificationPolicy(
  tx: Tx,
  viewer: BusinessActivityViewer,
) {
  await notificationAdminScope(tx, viewer)
  const rows = await tx.businessNotificationPolicy.findMany({
    where: { tenantId: viewer.tenantId },
  })
  return {
    catalog: notificationCatalog(),
    items: businessEventTypes.map((type) =>
      policyView(
        type,
        rows.find((row) => row.type === type),
      ),
    ),
  }
}
export async function updateNotificationPolicy(
  tx: Tx,
  viewer: BusinessActivityViewer,
  raw: z.input<typeof businessNotificationPolicyInput>,
) {
  const input = businessNotificationPolicyInput.parse(raw)
  await lockConfig(tx, viewer.tenantId, input.type)
  await notificationAdminScope(tx, viewer)
  assertMethods(input.type, input.allowed.inApp, input.allowed.email)
  if (input.recipientRoles.some((role) => !roles.has(role)))
    throw new BusinessActivityError(
      "BAD_REQUEST",
      "Choose an eligible business operations role.",
    )
  const old = await tx.businessNotificationPolicy.findUnique({
    where: { tenantId_type: { tenantId: viewer.tenantId, type: input.type } },
  })
  if ((old?.revision ?? 0) !== input.expectedRevision)
    throw new BusinessActivityError(
      "CONFLICT",
      "Alert policy changed. Refresh before saving.",
    )
  const data = {
    inAppAllowed: input.allowed.inApp,
    emailAllowed: false,
    inAppDefault: input.defaults.inApp,
    emailDefault: false,
    recipientRoles: [...new Set(input.recipientRoles)].sort(),
    updatedByUserId: viewer.viewerUserId,
  }
  const row = old
    ? await tx.businessNotificationPolicy.update({
        where: { id: old.id },
        data: { ...data, revision: { increment: 1 } },
      })
    : await tx.businessNotificationPolicy.create({
        data: { ...data, tenantId: viewer.tenantId, type: input.type },
      })
  return policyView(input.type, row)
}
export async function readNotificationSubscriptions(
  tx: Tx,
  viewer: BusinessActivityViewer,
  raw: z.input<typeof businessNotificationSubscriptionsInput>,
) {
  const input = businessNotificationSubscriptionsInput.parse(raw)
  const scope = await notificationAdminScope(tx, viewer)
  // Cursor is bound to the current admin and member filter; no foreign resume.
  const binding = JSON.stringify([
    viewer.tenantId,
    viewer.viewerUserId,
    input.membershipId ?? null,
  ])
  let after: string | undefined
  if (input.cursor) {
    try {
      const position = z
        .object({ id: z.string().min(1), binding: z.string() })
        .strict()
        .parse(
          JSON.parse(Buffer.from(input.cursor, "base64url").toString("utf8")),
        )
      if (position.binding !== binding) throw Error("Changed recipient query")
      after = position.id
    } catch {
      throw new BusinessActivityError(
        "BAD_REQUEST",
        "Restart recipient search after changing business or member.",
      )
    }
  }
  const rows = await tx.businessNotificationSubscription.findMany({
    where: {
      tenantId: viewer.tenantId,
      membershipId: input.membershipId,
      ...(after ? { id: { gt: after } } : {}),
    },
    include: subscriptionInclude,
    orderBy: { id: "asc" },
    take: input.limit + 1,
  })
  const visible = rows.slice(0, input.limit)
  const last = visible.at(-1)
  const context = await subscriptionContext(tx, viewer, visible, scope)
  const items = visible.map((row) => subscriptionView(context, row))
  return {
    items,
    nextCursor:
      rows.length > input.limit && last
        ? Buffer.from(JSON.stringify({ id: last.id, binding })).toString(
            "base64url",
          )
        : null,
  }
}
export async function updateNotificationSubscription(
  tx: Tx,
  viewer: BusinessActivityViewer,
  raw: z.input<typeof businessNotificationSubscriptionInput>,
) {
  const input = businessNotificationSubscriptionInput.parse(raw)
  await lockConfig(tx, viewer.tenantId, input.type)
  const admin = await notificationAdminScope(tx, viewer)
  assertMethods(input.type, input.allowed.inApp, input.allowed.email)
  await tx.$queryRaw`SELECT id FROM "Membership" WHERE id=${input.membershipId} AND "tenantId"=${viewer.tenantId} FOR SHARE`
  const member = await tx.membership.findFirst({
    where: { id: input.membershipId, tenantId: viewer.tenantId },
  })
  if (
    !member ||
    (input.enabled && (member.status !== "ACTIVE" || !roles.has(member.role)))
  )
    throw new BusinessActivityError(
      "FORBIDDEN",
      "Choose an active eligible member of this business.",
    )
  const ids =
    input.scope.kind === "stores"
      ? [...new Set(input.scope.storeIds)].sort()
      : []
  if (ids.some((id) => !admin.stores.some((store) => store.id === id)))
    throw new BusinessActivityError(
      "FORBIDDEN",
      "A selected Store is outside this business.",
    )
  const old = await tx.businessNotificationSubscription.findUnique({
    where: {
      tenantId_membershipId_type: {
        tenantId: viewer.tenantId,
        membershipId: member.id,
        type: input.type,
      },
    },
  })
  if ((old?.revision ?? 0) !== input.expectedRevision)
    throw new BusinessActivityError(
      "CONFLICT",
      "Member alerts changed. Refresh before saving.",
    )
  const data = {
    enabled: input.enabled,
    scopeKind: input.scope.kind,
    inAppAllowed: input.allowed.inApp,
    emailAllowed: false,
    updatedByUserId: viewer.viewerUserId,
  }
  const saved = old
    ? await tx.businessNotificationSubscription.update({
        where: { id: old.id },
        data: { ...data, revision: { increment: 1 } },
      })
    : await tx.businessNotificationSubscription.create({
        data: {
          ...data,
          tenantId: viewer.tenantId,
          membershipId: member.id,
          type: input.type,
        },
      })
  await tx.businessNotificationSubscriptionStore.deleteMany({
    where: { tenantId: viewer.tenantId, subscriptionId: saved.id },
  })
  if (ids.length)
    await tx.businessNotificationSubscriptionStore.createMany({
      data: ids.map((storeId) => ({
        tenantId: viewer.tenantId,
        subscriptionId: saved.id,
        storeId,
      })),
    })
  const row = await tx.businessNotificationSubscription.findUniqueOrThrow({
    where: { id: saved.id },
    include: subscriptionInclude,
  })
  return subscriptionView(
    await subscriptionContext(tx, viewer, [row], admin),
    row,
  )
}
export async function readMyNotificationPreferences(
  tx: Tx,
  viewer: BusinessActivityViewer,
) {
  const { member, scope } = await notificationScope(tx, viewer)
  const catalog = notificationCatalog()
  if (!scope)
    return { items: [] as BusinessNotificationPreferenceView[], catalog: [] }
  const policies = await tx.businessNotificationPolicy.findMany({
    where: { tenantId: viewer.tenantId },
  })
  const subscriptions = await tx.businessNotificationSubscription.findMany({
    where: { tenantId: viewer.tenantId, membershipId: member.id },
    include: subscriptionInclude,
  })
  const preferences = await tx.businessNotificationPreference.findMany({
    where: { tenantId: viewer.tenantId, membershipId: member.id },
  })
  const context = await subscriptionContext(tx, viewer, subscriptions, scope)
  const items: BusinessNotificationPreferenceView[] = []
  for (const entry of catalog) {
    const policy = policies.find((row) => row.type === entry.type)
    const subscription = subscriptions.find((row) => row.type === entry.type)
    const roleAssigned = policyView(entry.type, policy).recipientRoles.includes(
      member.role,
    )
    if (!subscription && !roleAssigned) continue
    const pref = preferences.find((row) => row.type === entry.type)
    const preference = {
      inApp: preferenceValue(pref?.inApp),
      email: preferenceValue(pref?.email),
    }
    const domain =
      entry.category === "finance"
        ? scope.finance
        : entry.category === "staff" || entry.category === "settings"
          ? scope.manages
          : scope.manages ||
            entry.category === "orders" ||
            entry.category === "payments"
    const assigned = subscription
      ? subscriptionView(context, subscription).effective.inApp
      : domain &&
        (preference.inApp === "on" ||
          (preference.inApp === "inherit" && policy?.inAppDefault))
    const allowed = {
      inApp: Boolean(
        domain &&
          policy?.inAppAllowed &&
          (subscription
            ? subscription.enabled && subscription.inAppAllowed
            : roleAssigned),
      ),
      email: false,
    }
    items.push({
      type: entry.type,
      supports: entry.supports,
      allowed,
      preference,
      effective: {
        inApp: entry.supports.inApp && allowed.inApp && Boolean(assigned),
        email: false,
      },
    })
  }
  return {
    items,
    catalog: catalog.filter((entry) =>
      items.some((item) => item.type === entry.type),
    ),
  }
}
export async function updateMyNotificationPreferences(
  tx: Tx,
  viewer: BusinessActivityViewer,
  raw: z.input<typeof businessNotificationPreferenceInput>,
) {
  const input = businessNotificationPreferenceInput.parse(raw)
  const member = await notificationMember(tx, viewer)
  if (input.preference.email === "on")
    throw new BusinessActivityError(
      "BAD_REQUEST",
      "Optional email alerts are not available yet.",
    )
  const current = await readMyNotificationPreferences(tx, viewer)
  const entry = current.items.find((item) => item.type === input.type)
  if (
    !entry ||
    (input.preference.inApp === "on" &&
      (!entry.supports.inApp || !entry.allowed.inApp))
  )
    throw new BusinessActivityError(
      "FORBIDDEN",
      "This alert type is not assigned within your current business access.",
    )
  await tx.businessNotificationPreference.upsert({
    where: {
      tenantId_membershipId_type: {
        tenantId: viewer.tenantId,
        membershipId: member.id,
        type: input.type,
      },
    },
    create: {
      tenantId: viewer.tenantId,
      membershipId: member.id,
      type: input.type,
      ...input.preference,
    },
    update: input.preference,
  })
  const updated = (await readMyNotificationPreferences(tx, viewer)).items.find(
    (item) => item.type === input.type,
  )
  if (!updated)
    throw new BusinessActivityError(
      "CONFLICT",
      "Your alert assignment changed. Refresh preferences.",
    )
  return updated
}
