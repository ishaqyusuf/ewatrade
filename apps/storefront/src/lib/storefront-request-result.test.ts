import { expect, test } from "bun:test"
import { storefrontRequestResult } from "./storefront-request-result"

test("a failed or uncertain request returns safe retry state without claiming it was unsent", async () => {
  const state = await storefrontRequestResult(
    async () => {
      throw new Error("private DB/credential detail")
    },
    () => false,
  )
  expect(state.kind).toBe("error")
  expect(state.message).toContain("couldn’t confirm")
  expect(state.message).toContain("details are still here")
  expect(JSON.stringify(state)).not.toContain("private")
  expect(JSON.stringify(state)).not.toContain("received")
})

test("retry invokes only the supplied canonical command and reuses its request identity", async () => {
  const id = "same-client-request"
  const attempts: string[] = []
  const submit = async () => {
    attempts.push(id)
    if (attempts.length === 1) throw new Error("response lost")
    return { reference: "REQ-01" }
  }
  expect((await storefrontRequestResult(submit, () => false)).kind).toBe(
    "error",
  )
  expect(await storefrontRequestResult(submit, () => false)).toEqual({
    kind: "received",
    receipt: { reference: "REQ-01" },
  })
  expect(attempts).toEqual([id, id])
  const changed = await storefrontRequestResult(
    async () => {
      throw new Error("changed")
    },
    () => true,
  )
  expect(changed.message).toContain("service may have changed")
})
