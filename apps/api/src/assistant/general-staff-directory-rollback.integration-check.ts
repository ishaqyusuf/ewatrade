import { randomUUID } from "node:crypto"
import {
  listStaffDirectoryPageInTransaction,
  getStaffDirectoryMemberInTransaction,
} from "@ewatrade/db/queries"
import type { GeneralContext } from "./general-context"

/** No usable staff access is created; all synthetic records and actor suspension roll back. */
export async function verifyStaffDirectoryRollback(ctx: GeneralContext) {
  const db = ctx.db,
    tenantId = ctx.tenantContext.tenant.id,
    actorUserId = ctx.session.user.id
  const actor = await db.membership.findFirstOrThrow({
    where: {
      tenantId,
      userId: actorUserId,
      status: "ACTIVE",
      role: "OWNER",
      tenant: { dataClassification: "QA" },
    },
    select: { id: true },
  })
  const foreign = await db.membership.findFirstOrThrow({
    where: {
      tenantId: { not: tenantId },
      tenant: { dataClassification: "QA" },
    },
    select: { id: true, tenantId: true },
  })
  const foreignStore = await db.store.findFirstOrThrow({
    where: { tenantId: foreign.tenantId },
    select: { id: true },
  })
  const nonce = randomUUID(),
    prefix = `${nonce}-`,
    name = `QA same-name staff ${nonce}`
  const facts = async () =>
    (
      await db.$queryRaw<Array<{ hash: string }>>`SELECT md5(jsonb_build_object(
    'memberships',(SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM "Membership" m WHERE m."tenantId"=${tenantId}),
    'profiles',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM "RetailOpsStaffProfile" p WHERE p."tenantId"=${tenantId}),
    'assignments',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM "StaffStoreAssignment" a WHERE a."tenantId"=${tenantId}),
    'invites',(SELECT jsonb_agg(to_jsonb(i) ORDER BY i.id) FROM "RetailOpsStaffInviteToken" i WHERE i."tenantId"=${tenantId}),
    'lifecycle',(SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM "RetailOpsStaffLifecycleEvent" e WHERE e."tenantId"=${tenantId}),
    'access',(SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM "StaffAccessAuditEvent" e WHERE e."tenantId"=${tenantId}),
    'users',(SELECT jsonb_agg(to_jsonb(u) ORDER BY u.id) FROM "User" u WHERE u.id=${actorUserId} OR u.id LIKE ${prefix + "%"}),
    'sessions',(SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM "Session" s WHERE s."userId"=${actorUserId} OR s."userId" LIKE ${prefix + "%"}),
    'accounts',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM "Account" a WHERE a."userId"=${actorUserId} OR a."userId" LIKE ${prefix + "%"})
  )::text) AS hash`
    )[0]!.hash
  const before = await facts(),
    started = performance.now()
  const check = (condition: boolean, message: string) => {
    if (!condition) throw Error(message)
  }
  let report: unknown = null,
    rolledBack = false
  try {
    await db.$transaction(
      async (tx) => {
        await tx.user.createMany({
          data: [1, 2, 3].map((n) => ({
            id: `${prefix}user-${n}`,
            name,
            email: `staff-read.${nonce}.${n}@ishaq.qa.test`,
            emailVerified: false,
            metadata: { qaPrivate: "STAFF_READ_PRIVATE_SENTINEL" },
          })),
        })
        await tx.membership.createMany({
          data: [1, 2, 3].map((n) => ({
            id: `${prefix}member-${n}`,
            tenantId,
            userId: `${prefix}user-${n}`,
            role: n === 3 ? "OPERATOR" : "CASHIER",
            status: "INVITED",
            invitedAt: null,
            acceptedAt: null,
          })),
        })
        await tx.retailOpsStaffProfile.createMany({
          data: [1, 2].map((n) => ({
            id: `${prefix}profile-${n}`,
            tenantId,
            userId: `${prefix}user-${n}`,
            membershipId: `${prefix}member-${n}`,
            displayName: name,
            roleSnapshot: "ADMIN",
            statusSnapshot: "SUSPENDED",
            metadata: { qaPrivate: "STAFF_READ_PRIVATE_SENTINEL" },
          })),
        })
        const input = {
          tenantId,
          actorUserId,
          search: name,
          status: "INVITED" as const,
          limit: 1,
        }
        const first = await listStaffDirectoryPageInTransaction(tx, input)
        const second = await listStaffDirectoryPageInTransaction(tx, {
          ...input,
          cursor: first.nextCursor!,
        })
        const third = await listStaffDirectoryPageInTransaction(tx, {
          ...input,
          cursor: second.nextCursor!,
        })
        check(
          [first, second, third].every(
            (p) => p.total === 3 && p.data.length === 1,
          ),
          "Exact full matching total differs from page",
        )
        const members = [...first.data, ...second.data, ...third.data]
        check(
          members.map((m) => m.membershipId).join(",") ===
            [1, 2, 3].map((n) => `${prefix}member-${n}`).join(","),
          "Stable database page order or continuation failed",
        )
        check(
          new Set(members.map((m) => m.email)).size === 3 &&
            members.every((m) => m.name === name),
          "Same-name identities were merged",
        )
        check(
          third.nextCursor === null && third.coverage.profile === "partial",
          "Last page/profile gap missing",
        )
        check(
          first.data[0]?.role === "CASHIER" &&
            first.data[0]?.status === "INVITED",
          "Profile snapshots overrode current membership",
        )
        const detail = await getStaffDirectoryMemberInTransaction(tx, {
          tenantId,
          actorUserId,
          membershipId: second.data[0]!.membershipId,
        })
        check(
          detail.email === second.data[0]!.email &&
            detail.invitedAt === null &&
            detail.acceptedAt === null &&
            detail.historyCoverage === "not_read",
          "Exact selection or missing original dates inferred",
        )
        const cashiers = await listStaffDirectoryPageInTransaction(tx, {
          ...input,
          role: "CASHIER",
          limit: 10,
        })
        check(
          cashiers.total === 2 && cashiers.data.length === 2,
          "Role filter applied after page/count",
        )
        const store = await listStaffDirectoryPageInTransaction(tx, {
          ...input,
          assignmentStoreId: ctx.tenantContext.activeStore!.id,
          limit: 10,
        })
        check(
          store.total === 0 && store.data.length === 0,
          "Legacy or invited Store assignment inferred",
        )
        const refuses = async (
          operation: () => Promise<unknown>,
          code: string,
        ) => {
          try {
            await operation()
          } catch (error) {
            if (
              error instanceof Error &&
              "code" in error &&
              error.code === code
            )
              return
            throw error
          }
          throw Error(`Expected ${code} refusal`)
        }
        await refuses(
          () =>
            listStaffDirectoryPageInTransaction(tx, {
              ...input,
              cursor: first.nextCursor!,
              role: "CASHIER",
            }),
          "BAD_REQUEST",
        )
        await refuses(
          () =>
            getStaffDirectoryMemberInTransaction(tx, {
              tenantId,
              actorUserId,
              membershipId: foreign.id,
            }),
          "NOT_FOUND",
        )
        await refuses(
          () =>
            listStaffDirectoryPageInTransaction(tx, {
              ...input,
              assignmentStoreId: foreignStore.id,
            }),
          "NOT_FOUND",
        )
        check(
          !JSON.stringify([
            first,
            second,
            third,
            detail,
            cashiers,
            store,
          ]).includes("STAFF_READ_PRIVATE_SENTINEL"),
          "Private User/profile fields leaked",
        )
        await tx.membership.update({
          where: { id: actor.id },
          data: { status: "SUSPENDED" },
        })
        await refuses(
          () => listStaffDirectoryPageInTransaction(tx, input),
          "FORBIDDEN",
        )
        await refuses(
          () =>
            getStaffDirectoryMemberInTransaction(tx, {
              tenantId,
              actorUserId,
              membershipId: detail.membershipId,
            }),
          "FORBIDDEN",
        )
        report = {
          first,
          second,
          third,
          detail,
          cashiers,
          store,
          changedFilterRefused: true,
          foreignMemberAndStoreRefused: true,
          revokedActorRefused: true,
          syntheticInvitedOnly: true,
        }
        throw Error("STAFF_DIRECTORY_ROLLBACK")
      },
      { isolationLevel: "RepeatableRead", maxWait: 10000, timeout: 30000 },
    )
  } catch (error) {
    if (error instanceof Error && error.message === "STAFF_DIRECTORY_ROLLBACK")
      rolledBack = true
    else throw error
  }
  check(rolledBack, "Directory fixture did not reach rollback")
  check(
    (await facts()) === before,
    "Saved staff/auth facts changed after rollback",
  )
  return {
    verified: true,
    report,
    elapsedMs: performance.now() - started,
    savedStaffAndAuthFactsUnchanged: true,
    noUsableStaffAccess: true,
  }
}
