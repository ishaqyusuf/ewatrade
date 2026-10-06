import {
  APP_UPDATE_KEY,
  type MobileBuild,
  parseMobileBuild,
  parsePublishedBuild,
  sameBuild,
} from "@ewatrade/utils/app-update"
import type { PrismaClient } from "../../generated/prisma/client"

export class AppUpdateConflict extends Error {}
export async function getMobileBuild(db: PrismaClient) {
  const row = await db.systemConfiguration.findUnique({
    where: { key: APP_UPDATE_KEY },
  })
  return row
    ? parsePublishedBuild({
        ...parsePublishedBuild(row.value),
        revision: row.revision,
      })
    : null
}

/** A dedicated configuration key and optimistic revision prevent cross-feature writes. */
export async function publishMobileBuild(
  db: PrismaClient,
  input: MobileBuild,
  expectedRevision: number,
) {
  const build = parseMobileBuild(input)
  return db.$transaction(
    async (tx) => {
      // Transaction-scoped lock also serializes creation of the initially absent row.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${APP_UPDATE_KEY}))`
      const row = await tx.systemConfiguration.findUnique({
        where: { key: APP_UPDATE_KEY },
      })
      const current = row ? parsePublishedBuild(row.value) : null
      if (current?.active && sameBuild(current, build)) return current
      if ((row?.revision ?? 0) !== expectedRevision)
        throw new AppUpdateConflict(
          "Build record changed. Check status and retry.",
        )
      if (current && build.buildNumber <= current.buildNumber)
        throw new AppUpdateConflict("Publish a higher native build number.")
      const next = {
        ...build,
        revision: (row?.revision ?? 0) + 1,
        active: true,
        publishedAt: new Date().toISOString(),
      }
      await tx.systemConfiguration.upsert({
        where: { key: APP_UPDATE_KEY },
        create: { key: APP_UPDATE_KEY, value: next, revision: next.revision },
        update: { value: next, revision: next.revision },
      })
      return next
    },
    { maxWait: 10_000, timeout: 30_000 },
  )
}
export async function withdrawMobileBuild(
  db: PrismaClient,
  expectedRevision: number,
) {
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${APP_UPDATE_KEY}))`
      const row = await tx.systemConfiguration.findUnique({
        where: { key: APP_UPDATE_KEY },
      })
      if (!row || row.revision !== expectedRevision)
        throw new AppUpdateConflict(
          "Build record changed. Check status and retry.",
        )
      const current = parsePublishedBuild(row.value)
      if (!current.active) return current
      const next = { ...current, active: false, revision: row.revision + 1 }
      await tx.systemConfiguration.update({
        where: { key: APP_UPDATE_KEY },
        data: { value: next, revision: next.revision },
      })
      return next
    },
    { maxWait: 10_000, timeout: 30_000 },
  )
}
