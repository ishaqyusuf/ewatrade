import { prisma } from "@ewatrade/db"
import {
  AppUpdateConflict,
  getMobileBuild,
  publishMobileBuild,
  withdrawMobileBuild,
} from "@ewatrade/db/app-update"
import { HTTPException } from "hono/http-exception"
import type { AppUpdateDependencies } from "./routes"

async function conflicts<T>(operation: () => Promise<T>) {
  try {
    return await operation()
  } catch (error) {
    if (error instanceof AppUpdateConflict)
      throw new HTTPException(409, { message: error.message })
    throw error
  }
}
export const appUpdateDependencies: AppUpdateDependencies = {
  token: () => process.env.APP_UPDATE_PUBLISH_TOKEN,
  backend: () => process.env.APP_UPDATE_BACKEND,
  read: () => getMobileBuild(prisma),
  publish: (build, revision) =>
    conflicts(() => publishMobileBuild(prisma, build, revision)),
  withdraw: (revision) =>
    conflicts(() => withdrawMobileBuild(prisma, revision)),
}
