import { expect, test } from "bun:test"
import { QueryClient } from "@tanstack/react-query"
import { readFreshFinanceCommand } from "./finance-command-read"

const key = ["finance", "commandStatus", "book", "original-command"] as const

test("recovery refreshes an existing cached status rather than acknowledging it", async () => {
  const client = new QueryClient()
  try {
    client.setQueryData(key, "COMMITTED")
    let reads = 0
    const result = await readFreshFinanceCommand(
      client,
      {
        queryKey: key,
        staleTime: Number.POSITIVE_INFINITY,
        queryFn: async () => {
          reads++
          return "NOT_FOUND"
        },
      },
      () => true,
    )
    expect(result).toBe("NOT_FOUND")
    expect(reads).toBe(1)
  } finally {
    client.clear()
  }
})

test("recovery cancels the exact old request and ignores its late status", async () => {
  const client = new QueryClient()
  let finishOld: ((value: string) => void) | undefined
  let oldStarted: (() => void) | undefined
  const started = new Promise<void>((resolve) => {
    oldStarted = resolve
  })
  try {
    const old = client
      .fetchQuery({
        queryKey: key,
        queryFn: async () => {
          oldStarted?.()
          return new Promise<string>((resolve) => {
            finishOld = resolve
          })
        },
      })
      .catch(() => "CANCELED")
    await started
    const unrelated = [...key, "unrelated"]
    client.setQueryData(unrelated, "UNCHANGED")
    const fresh = await readFreshFinanceCommand(
      client,
      { queryKey: key, queryFn: async () => "NOT_FOUND" },
      () => true,
    )
    finishOld?.("COMMITTED")
    expect(await old).toBe("CANCELED")
    expect(fresh).toBe("NOT_FOUND")
    expect(client.getQueryData(key)).toBe("NOT_FOUND")
    expect(client.getQueryData(unrelated)).toBe("UNCHANGED")
  } finally {
    finishOld?.("COMMITTED")
    client.clear()
  }
})

test("authority loss during a real query prevents use of its successful response", async () => {
  const client = new QueryClient()
  let current = true
  try {
    await expect(
      readFreshFinanceCommand(
        client,
        {
          queryKey: key,
          queryFn: async () => {
            current = false
            return "COMMITTED"
          },
        },
        () => current,
      ),
    ).rejects.toThrow("original account")
  } finally {
    client.clear()
  }
})

test("failed status is not substituted with the previous committed cache or retried", async () => {
  const client = new QueryClient()
  try {
    client.setQueryData(key, "COMMITTED")
    let reads = 0
    await expect(
      readFreshFinanceCommand(
        client,
        {
          queryKey: key,
          retry: 3,
          queryFn: async () => {
            reads++
            throw new Error("Server unavailable")
          },
        },
        () => true,
      ),
    ).rejects.toThrow("Server unavailable")
    expect(reads).toBe(1)
  } finally {
    client.clear()
  }
})
