import { expect, test } from "bun:test"
import type { PrismaClient } from "../../generated/prisma/client"
import { APP_UPDATE_SCOPE, parseMobileBuild } from "@ewatrade/utils/app-update"
import {
  getMobileBuild,
  publishMobileBuild,
  withdrawMobileBuild,
} from "./app-update"
const build = parseMobileBuild({
  ...APP_UPDATE_SCOPE,
  schemaVersion: 1,
  buildNumber: 12,
  appVersion: "1.2.0",
  artifactUrl: "https://expo.dev/artifacts/eas/example.apk",
  sha256: "a".repeat(64),
  sizeBytes: 100,
  notes: "",
})
function database() {
  let row: any = null
  const db: any = {
    systemConfiguration: {
      findUnique: async () => row,
      upsert: async ({ create, update }: any) => {
        row = row ? { ...row, ...update } : create
        return row
      },
      update: async ({ data }: any) => {
        row = { ...row, ...data }
        return row
      },
    },
    $executeRaw: async () => 1,
  }
  db.$transaction = (work: any) => work(db)
  return db as PrismaClient
}
test("publication is idempotent, monotonic and revision guarded; withdrawal stops offering it", async () => {
  const db = database()
  expect(await getMobileBuild(db)).toBeNull()
  const first = await publishMobileBuild(db, build, 0)
  expect(first.revision).toBe(1)
  expect(await publishMobileBuild(db, build, 0)).toEqual(first)
  await expect(
    publishMobileBuild(db, { ...build, buildNumber: 13 }, 0),
  ).rejects.toThrow("changed")
  await expect(
    publishMobileBuild(db, { ...build, buildNumber: 11 }, 1),
  ).rejects.toThrow("higher")
  const withdrawn = await withdrawMobileBuild(db, 1)
  expect(withdrawn.active).toBe(false)
  expect((await getMobileBuild(db))?.revision).toBe(2)
  await expect(publishMobileBuild(db, build, 2)).rejects.toThrow("higher")
  expect(
    (await publishMobileBuild(db, { ...build, buildNumber: 13 }, 2)).revision,
  ).toBe(3)
})
