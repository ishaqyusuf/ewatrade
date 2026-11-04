import { expect, mock, test } from "bun:test"

const stored = new Map<string, string>()
let reads = 0
mock.module("expo-secure-store", () => ({
  getItem: (key: string) => {
    reads++
    return stored.get(key) ?? null
  },
  setItem: (key: string, value: string) => {
    stored.set(key, value)
  },
  deleteItemAsync: async (key: string) => {
    stored.delete(key)
  },
}))

const { SESSION_KEY, deleteSession, getSession, setSession } = await import(
  "./session-store"
)
const session = {
  token: "token-1",
  profile: { id: "user-1", name: "Bola", email: "bola@example.com" },
}

test("reads the Keystore once, then serves fresh copies from memory", () => {
  stored.set(SESSION_KEY, JSON.stringify(session))
  const first = getSession()
  const second = getSession()
  expect(reads).toBe(1)
  expect(first).toEqual(session)
  expect(second).not.toBe(first)
})

test("writes and deletes keep the in-memory session in step", async () => {
  setSession({ ...session, token: "token-2" })
  expect(getSession()?.token).toBe("token-2")
  expect(stored.get(SESSION_KEY)).toContain("token-2")
  await deleteSession()
  expect(getSession()).toBeNull()
  expect(stored.has(SESSION_KEY)).toBe(false)
  expect(reads).toBe(1)
})
