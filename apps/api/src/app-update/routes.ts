import {
  APP_UPDATE_SCOPE,
  parseBuildNumber,
  parseMobileBuild,
} from "@ewatrade/utils/app-update"
import type {
  MobileBuild,
  PublishedMobileBuild,
} from "@ewatrade/utils/app-update"
import type { OpenAPIHono } from "@hono/zod-openapi"
import { bodyLimit } from "hono/body-limit"
import { safeCompare } from "../utils/safe-compare"

export type AppUpdateDependencies = {
  token: () => string | undefined
  backend: () => string | undefined
  read: () => Promise<PublishedMobileBuild | null>
  publish: (
    build: MobileBuild,
    revision: number,
  ) => Promise<PublishedMobileBuild>
  withdraw: (revision: number) => Promise<PublishedMobileBuild>
}
export function registerAppUpdateRoutes(
  app: OpenAPIHono,
  deps: AppUpdateDependencies,
) {
  app.use("/api/internal/mobile/builds*", bodyLimit({ maxSize: 8192 }))
  app.use("/api/internal/mobile/builds*", async (c, next) => {
    c.header("Cache-Control", "no-store")
    const secret = deps.token()
    if (
      !secret ||
      secret.length < 32 ||
      !["local", "preview", "production"].includes(deps.backend() ?? "")
    )
      return c.json({ error: "App updates are not configured." }, 503)
    if (!safeCompare(c.req.header("authorization"), `Bearer ${secret}`))
      return c.json({ error: "Unauthorized" }, 401)
    if (c.req.header("x-app-update-backend") !== deps.backend())
      return c.json({ error: "Wrong backend target" }, 409)
    await next()
  })
  app.get("/api/internal/mobile/builds", async (c) =>
    c.json({ build: await deps.read(), backend: deps.backend() }),
  )
  app.post("/api/internal/mobile/builds", async (c) => {
    let build: MobileBuild
    let revision: number
    try {
      const input = await c.req.json()
      build = parseMobileBuild(input.build)
      revision = input.expectedRevision
      if (!Number.isSafeInteger(revision) || revision < 0)
        throw new Error("Invalid revision")
    } catch {
      return c.json({ error: "Invalid build registration" }, 400)
    }
    const result = await deps.publish(build, revision)
    return c.json({ build: result, backend: deps.backend() })
  })
  app.post("/api/internal/mobile/builds/withdraw", async (c) => {
    let revision: number
    try {
      const input = await c.req.json()
      revision = input.expectedRevision
      if (!Number.isSafeInteger(revision) || revision < 1)
        throw new Error("Invalid revision")
    } catch {
      return c.json({ error: "Invalid revision" }, 400)
    }
    return c.json({
      build: await deps.withdraw(revision),
      backend: deps.backend(),
    })
  })
  // Only public, already shareable EAS APKs are supported. No account or tenant data is exposed.
  app.get("/api/mobile/builds/check", async (c) => {
    c.header("Cache-Control", "no-store")
    const query = c.req.query()
    if (
      Object.entries(APP_UPDATE_SCOPE).some(
        ([key, value]) => query[key] !== value,
      )
    )
      return c.json({ build: null })
    let installed: number
    try {
      installed = parseBuildNumber(query.buildNumber)
    } catch {
      return c.json({ error: "Invalid installed build" }, 400)
    }
    const build = await deps.read()
    return c.json({
      build: build?.active && build.buildNumber > installed ? build : null,
    })
  })
}
