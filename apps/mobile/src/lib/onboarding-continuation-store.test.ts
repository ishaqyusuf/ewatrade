import { beforeEach, expect, mock, test } from "bun:test"

const values = new Map<string, string>()
const extra = {
  appVariant: "preview",
  onboardingDashboardUrl: "https://preview.example.com",
}
mock.module("expo-constants", () => ({ default: { expoConfig: { extra } } }))
mock.module("expo-secure-store", () => ({
  getItemAsync: async (key: string) => values.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    values.set(key, value)
  },
  deleteItemAsync: async (key: string) => {
    values.delete(key)
  },
}))
const { clearPendingOnboarding, readPendingOnboarding, savePendingOnboarding } =
  await import("./onboarding-continuation-store")
const first = `ea_${"a".repeat(43)}`
const second = `ea_${"b".repeat(43)}`

beforeEach(async () => {
  await clearPendingOnboarding()
  extra.appVariant = "preview"
  process.env.EXPO_PUBLIC_API_URL = "https://api-preview.example.com"
})

test("secure pending context resumes after reload and is bound to environment/API", async () => {
  await savePendingOnboarding({ kind: "setup", token: first })
  expect((await readPendingOnboarding())?.token).toBe(first)
  process.env.EXPO_PUBLIC_API_URL = "https://api-production.example.com"
  expect(await readPendingOnboarding()).toBeNull()
  expect(values.size).toBe(0)
})

test("expired pending context is cleared", async () => {
  await savePendingOnboarding({
    kind: "setup",
    token: first,
    expiresAt: Date.now() - 1,
  })
  expect(await readPendingOnboarding()).toBeNull()
})

test("an older response cannot overwrite a newly opened email or clear it after completion", async () => {
  await savePendingOnboarding({ kind: "setup", token: first })
  await savePendingOnboarding({ kind: "setup", token: second })
  await expect(
    savePendingOnboarding({ kind: "setup", token: first }, first),
  ).rejects.toThrow("different setup")
  await clearPendingOnboarding(first)
  expect((await readPendingOnboarding())?.token).toBe(second)
})

test("verification upgrades only its own currently pending link", async () => {
  const verification = `ear_${"v".repeat(43)}`
  await savePendingOnboarding({ kind: "verification", token: verification })
  await savePendingOnboarding({ kind: "setup", token: first }, verification)
  expect((await readPendingOnboarding())?.kind).toBe("setup")
  extra.appVariant = "production"
  expect(await readPendingOnboarding()).toBeNull()
})
