import { expect } from "bun:test"
import { randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import { PGlite } from "@electric-sql/pglite"
import { PGLiteSocketServer } from "@electric-sql/pglite-socket"
import type { PrismaClient } from "@ewatrade/db"
import type { advanceAccountPrivacyWorkflow } from "@ewatrade/db/queries"
import { createOfficePrivacyRoutes } from "../apps/api/src/account-privacy/office-routes"

/** Fresh in-memory office DB only; the caller must independently guard EwaTrade Development. */
export async function createOfficePrivacyQa(
  db: PrismaClient,
  operatorUserId: string,
  requestId: string,
) {
  const root = process.env.OVERSIGHT_QA_REPOSITORY
  if (
    !root?.startsWith("/") ||
    process.env.RUN_DATABASE_INTEGRATION_TESTS !== "1" ||
    process.env.DATABASE_PROFILE_VERIFIED !== "1"
  )
    throw Error("Explicit guarded QA repository required")
  const memory = await PGlite.create()
  const server = new PGLiteSocketServer({
    db: memory,
    host: "127.0.0.1",
    port: 0,
    maxConnections: 1,
  })
  const keys = [
    "DATABASE_URL",
    "EWATRADE_PRIVACY_ENABLED",
    "EWATRADE_PRIVACY_URL",
    "EWATRADE_PRIVACY_KEY",
    "OVERSIGHT_PRIVACY_ENABLED",
    "OVERSIGHT_PRIVACY_KEY",
    "OVERSIGHT_PRIVACY_OPERATORS_JSON",
  ]
  const previous = Object.fromEntries(keys.map((k) => [k, process.env[k]]))
  const originalFetch = globalThis.fetch
  let pool: { end: () => Promise<void> } | undefined
  try {
    for (const name of ["0001_initial.sql", "0002_employees.sql"])
      await memory.exec(
        await readFile(`${root}/packages/db/migrations/${name}`, "utf8"),
      )
    await server.start()
    process.env.DATABASE_URL = `postgresql://postgres:qa@${server.getServerConn()}/postgres`
    const officeId = randomUUID()
    const support = randomUUID()
    const viewer = randomUUID()
    const suspended = randomUUID()
    const unassigned = randomUUID()
    for (const [id, role] of [
      [officeId, "owner"],
      [support, "support"],
      [viewer, "viewer"],
      [suspended, "privacy"],
      [unassigned, ""],
    ]) {
      await memory.query(
        'INSERT INTO "user"(id,name,email,"emailVerified") VALUES($1,$2,$3,true)',
        [id, "Synthetic office employee", `${id}@example.test`],
      )
      if (role)
        await memory.query(
          'INSERT INTO employee("userId",role,projects,status) VALUES($1,$2,$3,$4)',
          [
            id,
            role,
            JSON.stringify(["ewatrade"]),
            id === suspended ? "suspended" : "active",
          ],
        )
    }
    // Load the actual Oversight repository modules and actual PostgreSQL queries.
    const queries = await import(`${root}/packages/db/src/queries/index.ts`)
    const ops = await import(`${root}/packages/operations/src/privacy.ts`)
    const officeDb = await import(`${root}/packages/db/src/client.ts`)
    pool = officeDb.getPool()
    expect(await queries.getEmployee(unassigned)).toBeNull()
    const input = {
      userId: support,
      role: "privacy",
      projects: ["ewatrade"],
      status: "active",
      expectedRevision: 1,
      reason: "Disposable office QA access change",
    }
    await expect(queries.setEmployee(viewer, input)).rejects.toThrow(
      "active owner",
    )
    await expect(
      queries.setEmployee(officeId, { ...input, expectedRevision: 9 }),
    ).rejects.toThrow("Refresh")
    await expect(
      queries.setEmployee(officeId, {
        ...input,
        userId: officeId,
        role: "viewer",
      }),
    ).rejects.toThrow("active owner")
    await memory.query(
      'INSERT INTO session(id,"expiresAt",token,"userId") VALUES($1,now()+interval \'1 day\',$2,$3)',
      [randomUUID(), randomUUID(), support],
    )
    await queries.setEmployee(officeId, input)
    expect((await queries.getEmployee(support)).revision).toBe(2)
    expect(
      (
        await memory.query(
          'SELECT count(*)::int AS count FROM session WHERE "userId"=$1',
          [support],
        )
      ).rows[0].count,
    ).toBe(0)
    expect(
      (
        await memory.query(
          "SELECT count(*)::int AS count FROM audit WHERE action='employee.access'",
        )
      ).rows[0].count,
    ).toBe(1)
    await queries.setEmployee(officeId, {
      ...input,
      role: "support",
      expectedRevision: 2,
    })
    const key = "synthetic-office-bridge-key-for-disposable-fixture"
    process.env.EWATRADE_PRIVACY_ENABLED = "true"
    process.env.EWATRADE_PRIVACY_URL = "https://office-privacy.example.test/"
    process.env.EWATRADE_PRIVACY_KEY = key
    process.env.OVERSIGHT_PRIVACY_ENABLED = "true"
    process.env.OVERSIGHT_PRIVACY_KEY = key
    process.env.OVERSIGHT_PRIVACY_OPERATORS_JSON = JSON.stringify({
      [officeId]: {
        userId: operatorUserId,
        scope: "process",
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      },
      [support]: {
        userId: operatorUserId,
        scope: "read",
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      },
    })
    let providers: Parameters<typeof advanceAccountPrivacyWorkflow>[2] = {
      revokeApple: async () => {
        throw Error("No provider in office fixture")
      },
      revokeAppleAccess: async () => {
        throw Error("No provider in office fixture")
      },
      revokeGoogle: async () => {
        throw Error("No provider in office fixture")
      },
    }
    let dropNextResult = false
    let capturedResult: unknown
    globalThis.fetch = async (url, init) => {
      if (String(url) !== "https://office-privacy.example.test/")
        throw Error("Unexpected network call in office bridge fixture")
      const response = await createOfficePrivacyRoutes(
        () => db,
        providers,
      ).request(String(url), init)
      if (dropNextResult) {
        dropNextResult = false
        capturedResult = await response.clone().json()
        throw new Error(
          "Injected dropped response after genuine stage execution",
        )
      }
      return response
    }
    await expect(ops.privacyQueue(viewer, {})).rejects.toThrow("unavailable")
    await expect(ops.privacyQueue(suspended, {})).rejects.toThrow("unavailable")
    await expect(ops.privacyQueue(unassigned, {})).rejects.toThrow(
      "unavailable",
    )
    await expect(ops.privacyWorkflow(support, { requestId })).rejects.toThrow(
      "unavailable",
    )
    const q = await ops.privacyQueue(support, {})
    expect(q.items.some((r: { id: string }) => r.id === requestId)).toBe(true)
    expect(
      q.items.every(
        (r: Record<string, unknown>) =>
          !("contactEmail" in r) && !("userId" in r),
      ),
    ).toBe(true)
    expect((await ops.privacyWorkflow(officeId, { requestId })).nextStep).toBe(
      "BEGIN_REVIEW",
    )
    return {
      async advance(
        input: Parameters<typeof advanceAccountPrivacyWorkflow>[1],
        adapter: Parameters<typeof advanceAccountPrivacyWorkflow>[2],
      ) {
        providers = adapter
        const command = {
          requestId: input.requestId,
          expectedStep: input.expectedStep,
          commandId: randomUUID(),
          reason: "Synthetic verified deletion acceptance stage",
        }
        if (input.expectedStep === "BEGIN_REVIEW") {
          dropNextResult = true
          await expect(ops.privacyAdvance(officeId, command)).rejects.toThrow(
            "Injected dropped response",
          )
          expect(
            (
              await memory.query("SELECT status FROM audit WHERE id=$1", [
                command.commandId,
              ])
            ).rows[0].status,
          ).toBe("unconfirmed")
          await expect(
            ops.privacyAdvance(officeId, {
              ...command,
              commandId: randomUUID(),
            }),
          ).rejects.toThrow("unresolved")
          await ops.reconcilePrivacy(officeId, {
            commandId: command.commandId,
            requestId: command.requestId,
            reason: "Reviewed genuine stage progress after a dropped result",
          })
          expect(
            (
              await memory.query("SELECT status FROM audit WHERE id=$1", [
                command.commandId,
              ])
            ).rows[0].status,
          ).toBe("reconciled")
          return capturedResult
        }
        const result = await ops.privacyAdvance(officeId, command)
        await expect(ops.privacyAdvance(officeId, command)).rejects.toThrow(
          "already recorded",
        )
        expect(
          (
            await memory.query("SELECT status FROM audit WHERE id=$1", [
              command.commandId,
            ])
          ).rows[0].status,
        ).toBe("completed")
        return result
      },
      async close() {
        globalThis.fetch = originalFetch
        await pool?.end()
        await server.stop()
        await memory.close()
        for (const k of keys) {
          if (previous[k] === undefined) delete process.env[k]
          else process.env[k] = previous[k]
        }
      },
    }
  } catch (e) {
    globalThis.fetch = originalFetch
    await pool?.end()
    await server.stop().catch(() => undefined)
    await memory.close()
    for (const k of keys) {
      if (previous[k] === undefined) delete process.env[k]
      else process.env[k] = previous[k]
    }
    throw e
  }
}
