import { resolve } from "node:path"
import type { RouterProcedure } from "@ewatrade/assistant/capabilities/coverage"

export const coverageDocumentPath = resolve(
  import.meta.dir,
  "../../../../packages/assistant/src/capabilities/COVERAGE.md",
)

type ProcedureDef = { _def: { type: string; middlewares: unknown[] } }

/**
 * Lists every app procedure. A merchant procedure carries all of the
 * tenant-scoped protected middlewares, so new merchant endpoints are detected
 * without a hand-maintained list.
 */
export async function listRouterProcedures(): Promise<RouterProcedure[]> {
  // Importing the router builds a Prisma client but never connects.
  process.env.EWATRADE_DATABASE_URL ??=
    "postgresql://coverage@localhost:1/unused"
  const [{ appRouter }, { protectedProcedure }] = await Promise.all([
    import("../trpc/routers/_app"),
    import("../trpc/init"),
  ])
  const tenant = (protectedProcedure as unknown as ProcedureDef)._def
    .middlewares
  const procedures = appRouter._def.procedures as unknown as Record<
    string,
    ProcedureDef
  >
  return Object.entries(procedures).map(([path, procedure]) => ({
    path,
    type: procedure._def.type,
    merchant: tenant.every((middleware) =>
      procedure._def.middlewares.includes(middleware),
    ),
  }))
}
