import { afterEach, describe, expect, test } from "bun:test"
import {
  blockMarketingIntakeInPreview,
  isPreviewIntakeBlocked,
} from "./preview-intake-guard"

const saved = {
  VERCEL_ENV: process.env.VERCEL_ENV,
  APP_ENV: process.env.APP_ENV,
  PREVIEW_INTAKE_ENABLED: process.env.PREVIEW_INTAKE_ENABLED,
}

afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

function set(env: Partial<Record<keyof typeof saved, string>>) {
  for (const key of Object.keys(saved)) delete process.env[key]
  Object.assign(process.env, env)
}

describe("preview intake guard", () => {
  test("development and production are never blocked", () => {
    set({ APP_ENV: "dev" })
    expect(isPreviewIntakeBlocked()).toBe(false)
    set({ VERCEL_ENV: "production" })
    expect(blockMarketingIntakeInPreview()).toBeNull()
  })

  test("preview is blocked unless intake is explicitly enabled", async () => {
    set({ VERCEL_ENV: "preview" })
    const blocked = blockMarketingIntakeInPreview()
    expect(blocked?.status).toBe(503)
    set({ APP_ENV: "preview", PREVIEW_INTAKE_ENABLED: "true" })
    expect(blockMarketingIntakeInPreview()).toBeNull()
    set({ APP_ENV: "preview", PREVIEW_INTAKE_ENABLED: "yes" })
    expect(isPreviewIntakeBlocked()).toBe(true)
  })
})
