import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import { PGlite } from "@electric-sql/pglite"
import { PGLiteSocketServer } from "@electric-sql/pglite-socket"
import { Pool } from "pg"
import type { PrivacyProductOperatorPlan } from "../privacy-operator-plan"
import {
  enrollPrivacyProductOperator,
  previewPrivacyProductOperator,
  readPrivacyOperatorOfficeProof,
} from "./privacy-operator-enrollment"

test("actual disposable SQL enrollment refuses changed authority, races and existing identities", async () => {
  const memory = await PGlite.create()
  const server = new PGLiteSocketServer({
    db: memory,
    host: "127.0.0.1",
    port: 0,
    maxConnections: 10,
  })
  let pool: Pool | undefined
  const plan: PrivacyProductOperatorPlan = {
    version: 1,
    databaseHost: "product-fixture.neon.tech",
    databaseName: "postgres",
    officeDatabaseHost: "office-fixture.neon.tech",
    officeDatabaseName: "postgres",
    officeActorId: randomUUID(),
    officeOwnerId: randomUUID(),
    officeEnrollmentAuditId: randomUUID(),
    expectedOfficeRevision: 1,
    expectedOwnerRevision: 1,
    expectedPlatformAdminCount: 0,
    userId: randomUUID(),
    email: "privacy@ewatrade.com",
    name: "EwaTrade Privacy Operations",
    platformAdmin: true,
    scope: "process",
    expiresAt: new Date(Date.now() + 86400_000).toISOString(),
    reason: "Explicitly approved disposable fixture grant, no hosted product",
    mailboxVerification:
      "Synthetic fixture authority only; no external mailbox action",
  }
  const digest = "a".repeat(64)
  try {
    for (const name of ["0001_initial.sql", "0002_employees.sql"])
      await memory.exec(
        await readFile(
          `/Users/M1PRO/Documents/code/oversight/packages/db/migrations/${name}`,
          "utf8",
        ),
      )
    // Relevant existing Prisma User columns only, isolated from every EwaTrade profile.
    await memory.exec(`CREATE TABLE "User"(
      id TEXT PRIMARY KEY,name TEXT NOT NULL DEFAULT '',email TEXT UNIQUE NOT NULL,
      "emailVerified" BOOLEAN NOT NULL DEFAULT false,"emailVerifiedAt" TIMESTAMP,
      "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false,metadata JSONB,
      "createdAt" TIMESTAMP NOT NULL DEFAULT now(),"updatedAt" TIMESTAMP NOT NULL);
      CREATE TABLE "Account"(id TEXT PRIMARY KEY);
      CREATE TABLE "Session"(id TEXT PRIMARY KEY);
      CREATE TABLE "Membership"(id TEXT PRIMARY KEY);`)
    await memory.query(
      'INSERT INTO "User"(id,email,"updatedAt",metadata) VALUES($1,$2,now(),$3)',
      ["preserved-user", "preserved@example.test", '{"preserved":true}'],
    )
    for (const [id, role, email] of [
      [plan.officeOwnerId, "owner", "owner@example.test"],
      [plan.officeActorId, "privacy", plan.email],
    ]) {
      await memory.query(
        'INSERT INTO "user"(id,email,name,"emailVerified") VALUES($1,$2,$3,true)',
        [id, email, "Synthetic office fixture"],
      )
      await memory.query(
        'INSERT INTO employee("userId",role,projects,status) VALUES($1,$2,$3,$4)',
        [id, role, '["ewatrade"]', "active"],
      )
    }
    await memory.query(
      'INSERT INTO audit(id,"actorId","projectId",action,"targetId",reason,status,payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
      [
        plan.officeEnrollmentAuditId,
        plan.officeOwnerId,
        "office",
        "employee.privacy-enrollment",
        plan.officeActorId,
        "Fixture approval",
        "completed",
        "{}",
      ],
    )
    await server.start()
    const connectionString = `postgresql://postgres:qa@${server.getServerConn()}/postgres`
    if (new URL(connectionString).hostname !== "127.0.0.1")
      throw Error("Disposable memory socket required")
    pool = new Pool({ connectionString, max: 2, query_timeout: 5000 })
    let proof = await readPrivacyOperatorOfficeProof(pool, plan)
    expect(
      (await previewPrivacyProductOperator(pool, plan, proof)).platformAdmin,
    ).toBe(true)
    expect(
      (
        await memory.query<{ n: number }>(
          'SELECT count(*)::int AS n FROM "User"',
        )
      ).rows[0]?.n,
    ).toBe(1)
    for (const patch of [
      { actorId: randomUUID() },
      { enrollmentAuditId: randomUUID() },
      { revision: 2 },
      { ownerRevision: 2 },
      { observedAt: new Date(Date.now() - 61000) },
      { observedAt: new Date(Date.now() + 10000) },
    ])
      await expect(
        enrollPrivacyProductOperator(
          pool,
          plan,
          { ...proof, ...patch },
          digest,
        ),
      ).rejects.toThrow("office authority")
    for (const change of [
      { column: "status", value: "suspended", original: "active" },
      { column: "role", value: "support", original: "privacy" },
      {
        column: "projects",
        value: '["ewatrade","afterservice"]',
        original: '["ewatrade"]',
      },
    ]) {
      // Identifiers come from this fixed test list, never caller input.
      await memory.query(
        `UPDATE employee SET ${change.column}=$1 WHERE "userId"=$2`,
        [change.value, plan.officeActorId],
      )
      await expect(readPrivacyOperatorOfficeProof(pool, plan)).rejects.toThrow(
        "office operator changed",
      )
      await memory.query(
        `UPDATE employee SET ${change.column}=$1 WHERE "userId"=$2`,
        [change.original, plan.officeActorId],
      )
    }
    await memory.query('UPDATE employee SET status=$1 WHERE "userId"=$2', [
      "suspended",
      plan.officeOwnerId,
    ])
    await expect(readPrivacyOperatorOfficeProof(pool, plan)).rejects.toThrow(
      "office owner changed",
    )
    await memory.query('UPDATE employee SET status=$1 WHERE "userId"=$2', [
      "active",
      plan.officeOwnerId,
    ])
    await memory.query("UPDATE audit SET status=$1 WHERE id=$2", [
      "unconfirmed",
      plan.officeEnrollmentAuditId,
    ])
    await expect(readPrivacyOperatorOfficeProof(pool, plan)).rejects.toThrow(
      "enrollment evidence changed",
    )
    await memory.query("UPDATE audit SET status=$1 WHERE id=$2", [
      "completed",
      plan.officeEnrollmentAuditId,
    ])
    await memory.query(
      'INSERT INTO "User"(id,email,"isPlatformAdmin","updatedAt") VALUES($1,$2,true,now())',
      ["changed-admin", "changed@example.test"],
    )
    await expect(
      previewPrivacyProductOperator(pool, plan, proof),
    ).rejects.toThrow("privilege inventory changed")
    await memory.query('DELETE FROM "User" WHERE id=$1', ["changed-admin"])
    await expect(
      enrollPrivacyProductOperator(
        pool,
        { ...plan, expiresAt: new Date(0).toISOString() },
        proof,
        digest,
      ),
    ).rejects.toThrow("office authority")
    await expect(
      enrollPrivacyProductOperator(pool, plan, proof, "not-approved"),
    ).rejects.toThrow("plan digest")
    // A failed evidence write must roll back the entire new principal.
    await memory.exec(
      'ALTER TABLE "User" ADD CONSTRAINT refuse_fixture_grant CHECK (NOT "isPlatformAdmin")',
    )
    await expect(
      enrollPrivacyProductOperator(pool, plan, proof, digest),
    ).rejects.toThrow()
    expect(
      (
        await memory.query<{ n: number }>(
          'SELECT count(*)::int AS n FROM "User"',
        )
      ).rows[0]?.n,
    ).toBe(1)
    await memory.exec('ALTER TABLE "User" DROP CONSTRAINT refuse_fixture_grant')
    proof = await readPrivacyOperatorOfficeProof(pool, plan)
    const race = await Promise.allSettled([
      enrollPrivacyProductOperator(pool, plan, proof, digest),
      enrollPrivacyProductOperator(pool, plan, proof, digest),
    ])
    expect(race.filter((r) => r.status === "fulfilled")).toHaveLength(1)
    expect(race.filter((r) => r.status === "rejected")).toHaveLength(1)
    const result = await memory.query<{
      emailVerified: boolean
      isPlatformAdmin: boolean
      metadata: {
        privacyOperatorEnrollment: { planSha256: string; officeActorId: string }
      }
    }>(
      'SELECT "emailVerified","isPlatformAdmin",metadata FROM "User" WHERE id=$1',
      [plan.userId],
    )
    const timestamps = await memory.query<{
      verifiedUtc: boolean
      updatedUtc: boolean
    }>(
      `SELECT
        to_char("emailVerifiedAt",'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') = metadata->'privacyOperatorEnrollment'->>'grantedAt' AS "verifiedUtc",
        to_char("updatedAt",'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') = metadata->'privacyOperatorEnrollment'->>'grantedAt' AS "updatedUtc"
        FROM "User" WHERE id=$1`,
      [plan.userId],
    )
    expect(timestamps.rows[0]?.verifiedUtc).toBe(true)
    expect(timestamps.rows[0]?.updatedUtc).toBe(true)
    expect(result.rows[0]?.emailVerified).toBe(true)
    expect(result.rows[0]?.isPlatformAdmin).toBe(true)
    expect(result.rows[0]?.metadata.privacyOperatorEnrollment.planSha256).toBe(
      digest,
    )
    expect(
      result.rows[0]?.metadata.privacyOperatorEnrollment.officeActorId,
    ).toBe(plan.officeActorId)
    expect(
      (
        await memory.query<{ metadata: unknown }>(
          'SELECT metadata FROM "User" WHERE id=$1',
          ["preserved-user"],
        )
      ).rows[0]?.metadata,
    ).toEqual({ preserved: true })
    for (const table of ["Account", "Session", "Membership"])
      expect(
        (
          await memory.query<{ n: number }>(
            `SELECT count(*)::int AS n FROM "${table}"`,
          )
        ).rows[0]?.n,
      ).toBe(0)
    await expect(
      enrollPrivacyProductOperator(pool, plan, proof, digest),
    ).rejects.toThrow("Existing identity")
    await expect(
      enrollPrivacyProductOperator(
        pool,
        { ...plan, userId: randomUUID() },
        proof,
        digest,
      ),
    ).rejects.toThrow("Existing identity")
    await memory.query('UPDATE "User" SET email=$1 WHERE id=$2', [
      "PRIVACY@EWATRADE.COM",
      plan.userId,
    ])
    await expect(
      previewPrivacyProductOperator(
        pool,
        { ...plan, userId: randomUUID(), expectedPlatformAdminCount: 1 },
        proof,
      ),
    ).rejects.toThrow("Existing identity")
  } finally {
    await pool?.end()
    await server.stop()
    await memory.close()
  }
}, 30000)
