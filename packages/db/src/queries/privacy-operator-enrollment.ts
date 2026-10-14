import { Pool, type PoolClient } from "pg"
import {
  type PrivacyProductOperatorPlan,
  privacyProductOperatorPlanSchema,
} from "../privacy-operator-plan"

type OfficeProof = {
  actorId: string
  enrollmentAuditId: string
  ownerId: string
  revision: number
  ownerRevision: number
  observedAt: Date
}

export function createPrivacyOperatorEnrollmentPool(connectionString: string) {
  return new Pool({
    connectionString,
    connectionTimeoutMillis: 30_000,
    query_timeout: 10_000,
    max: 1,
  })
}

/** Current company authority only; credentials and session tokens are never read. */
export async function readPrivacyOperatorOfficeProof(
  pool: Pool,
  input: PrivacyProductOperatorPlan,
) {
  const plan = privacyProductOperatorPlanSchema.parse(input)
  const c = await pool.connect()
  try {
    await c.query("BEGIN READ ONLY")
    const { rows } = await c.query(
      'SELECT u.email,u."emailVerified",e.role,e.status,e.projects,e.revision FROM "user" u JOIN employee e ON e."userId"=u.id WHERE u.id=$1',
      [plan.officeActorId],
    )
    const actor = rows[0]
    if (
      !actor ||
      actor.email !== plan.email ||
      actor.emailVerified !== true ||
      actor.role !== "privacy" ||
      actor.status !== "active" ||
      actor.revision !== plan.expectedOfficeRevision ||
      JSON.stringify(actor.projects) !== '["ewatrade"]'
    )
      throw Error("Approved EwaTrade-only office operator changed")
    const owner = await c.query(
      'SELECT u."emailVerified",e.role,e.status,e.revision FROM "user" u JOIN employee e ON e."userId"=u.id WHERE u.id=$1',
      [plan.officeOwnerId],
    )
    const o = owner.rows[0]
    if (
      !o ||
      o.emailVerified !== true ||
      o.role !== "owner" ||
      o.status !== "active" ||
      o.revision !== plan.expectedOwnerRevision
    )
      throw Error("Reviewed office owner changed")
    const audit = await c.query(
      'SELECT id FROM audit WHERE id=$1 AND "actorId"=$2 AND "targetId"=$3 AND action=$4 AND status=$5',
      [
        plan.officeEnrollmentAuditId,
        plan.officeOwnerId,
        plan.officeActorId,
        "employee.privacy-enrollment",
        "completed",
      ],
    )
    if (audit.rowCount !== 1) throw Error("Office enrollment evidence changed")
    await c.query("ROLLBACK")
    return {
      actorId: plan.officeActorId,
      enrollmentAuditId: plan.officeEnrollmentAuditId,
      ownerId: plan.officeOwnerId,
      revision: actor.revision,
      ownerRevision: o.revision,
      observedAt: new Date(),
    } satisfies OfficeProof
  } catch (error) {
    await c.query("ROLLBACK")
    throw error
  } finally {
    c.release()
  }
}

function assertProof(
  plan: PrivacyProductOperatorPlan,
  proof: OfficeProof,
  now: Date,
) {
  const age = now.getTime() - proof.observedAt.getTime()
  if (
    !Number.isFinite(age) ||
    age < 0 ||
    age > 60_000 ||
    proof.actorId !== plan.officeActorId ||
    proof.ownerId !== plan.officeOwnerId ||
    proof.enrollmentAuditId !== plan.officeEnrollmentAuditId ||
    proof.revision !== plan.expectedOfficeRevision ||
    proof.ownerRevision !== plan.expectedOwnerRevision ||
    new Date(plan.expiresAt) <= now
  )
    throw Error("Current reviewed office authority required")
}

async function checkIdentity(c: PoolClient, plan: PrivacyProductOperatorPlan) {
  const existing = await c.query(
    'SELECT id FROM "User" WHERE id=$1 OR lower(email)=lower($2) LIMIT 1',
    [plan.userId, plan.email],
  )
  if (existing.rowCount)
    throw Error("Existing identity refused; no reset, merge or escalation")
  const admins = await c.query(
    'SELECT count(*)::int AS count FROM "User" WHERE "isPlatformAdmin"=true',
  )
  if (admins.rows[0]?.count !== plan.expectedPlatformAdminCount)
    throw Error("Reviewed product privilege inventory changed")
}

export async function previewPrivacyProductOperator(
  pool: Pool,
  input: PrivacyProductOperatorPlan,
  proof: OfficeProof,
) {
  const plan = privacyProductOperatorPlanSchema.parse(input)
  assertProof(plan, proof, new Date())
  const c = await pool.connect()
  try {
    await c.query("BEGIN READ ONLY")
    await checkIdentity(c, plan)
    await c.query("ROLLBACK")
    return { userId: plan.userId, email: plan.email, platformAdmin: true }
  } catch (error) {
    await c.query("ROLLBACK")
    throw error
  } finally {
    c.release()
  }
}

/** Internal reviewed CLI only. No caller/API gets this grant by signup or domain. */
export async function enrollPrivacyProductOperator(
  pool: Pool,
  input: PrivacyProductOperatorPlan,
  proof: OfficeProof,
  approvedPlanSha256: string,
) {
  const plan = privacyProductOperatorPlanSchema.parse(input)
  if (!/^[a-f0-9]{64}$/.test(approvedPlanSha256))
    throw Error("Exact approved plan digest required")
  const c = await pool.connect()
  try {
    await c.query("BEGIN ISOLATION LEVEL SERIALIZABLE")
    await c.query("SELECT pg_advisory_xact_lock(72401902)")
    const now = new Date()
    assertProof(plan, proof, now)
    await checkIdentity(c, plan)
    const metadata = {
      privacyOperatorEnrollment: {
        version: 1,
        planSha256: approvedPlanSha256,
        officeActorId: plan.officeActorId,
        officeEnrollmentAuditId: plan.officeEnrollmentAuditId,
        officeOwnerId: plan.officeOwnerId,
        officeRevision: proof.revision,
        officeOwnerRevision: proof.ownerRevision,
        scope: plan.scope,
        mappingExpiresAt: plan.expiresAt,
        grantedAt: now.toISOString(),
        privilege: "isPlatformAdmin",
        reason: plan.reason,
        mailboxVerification: plan.mailboxVerification,
      },
    }
    await c.query(
      'INSERT INTO "User"(id,name,email,"emailVerified","emailVerifiedAt","isPlatformAdmin",metadata,"updatedAt") VALUES($1,$2,$3,true,$4,true,$5,$4)',
      // Prisma timestamps are UTC without a time zone. An explicit ISO string
      // avoids pg serializing Date through the terminal's local TZ.
      [
        plan.userId,
        plan.name,
        plan.email,
        now.toISOString(),
        JSON.stringify(metadata),
      ],
    )
    await c.query("COMMIT")
    return { userId: plan.userId, email: plan.email, platformAdmin: true }
  } catch (error) {
    // Never retry a connection/commit ambiguity or overwrite an existing principal.
    await c.query("ROLLBACK")
    throw error
  } finally {
    c.release()
  }
}
