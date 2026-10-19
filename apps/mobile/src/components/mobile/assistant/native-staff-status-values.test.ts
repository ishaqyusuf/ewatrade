import { expect, test } from "bun:test"
import type { GeneralStaffStatusAction } from "@ewatrade/assistant/general/staff-status"
import {
  type NativeStaffStatusReview,
  createNativeStaffStatusSave,
  nativeStaffStatusCandidate,
  nativeStaffStatusInput,
} from "./native-staff-status-values"

const initial: GeneralStaffStatusAction = {
  action: "staff_status",
  membershipId: "fixed-membership",
  status: "suspended",
  expectedRevision: 2,
  reason: "Access review",
}
const fields = { status: "active", reason: " Onboarding completed " }
const review: NativeStaffStatusReview = {
  membershipId: initial.membershipId,
  nextStatus: "ACTIVE",
  reason: "Onboarding completed",
  expectedRevision: 19,
}

test("only status and normalized reason change; membership remains the selected original", () => {
  expect(nativeStaffStatusInput(initial, fields)).toEqual({
    membershipId: initial.membershipId,
    status: "active",
    reason: "Onboarding completed",
  })
  for (const injected of [
    { membershipId: "someone-else" },
    { expectedRevision: 8 },
    { tenantId: "foreign" },
    { action: "updateStaffStatus" },
    { role: "OWNER" },
    { storeId: "foreign" },
  ])
    expect(() =>
      nativeStaffStatusInput(initial, { ...fields, ...injected }),
    ).toThrow()
})

test("status, reason and initial action use strict canonical constraints", () => {
  for (const invalid of [
    { status: "ACTIVE", reason: "Valid" },
    { status: "removed", reason: "Valid" },
    { status: "active", reason: " " },
    { status: "active", reason: "a".repeat(501) },
    { status: "active" },
  ])
    expect(() => nativeStaffStatusInput(initial, invalid)).toThrow()
  expect(() =>
    nativeStaffStatusInput({ ...initial, expectedRevision: 0 }, fields),
  ).toThrow()
})

test("fresh returned expectedRevision replaces the old revision without inventing identity", () => {
  expect(
    nativeStaffStatusCandidate(nativeStaffStatusInput(initial, fields), review),
  ).toEqual({
    action: "staff_status",
    membershipId: initial.membershipId,
    status: "active",
    reason: "Onboarding completed",
    expectedRevision: 19,
  })
  for (const changed of [
    { membershipId: "other" },
    { nextStatus: "SUSPENDED" },
    { reason: "Other reason" },
    { reason: null },
    { expectedRevision: 0 },
    { expectedRevision: 1.5 },
    { expectedRevision: Number.NaN },
  ])
    expect(() =>
      nativeStaffStatusCandidate(nativeStaffStatusInput(initial, fields), {
        ...review,
        ...changed,
      }),
    ).toThrow()
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

test("Save issues a fresh read for current fields; concurrent taps cannot edit twice", async () => {
  const read = deferred<NativeStaffStatusReview>()
  const inputs: unknown[] = []
  const saves: GeneralStaffStatusAction[] = []
  const owner = createNativeStaffStatusSave({
    initial,
    isCurrent: () => true,
    fetchReview: (input) => {
      inputs.push(input)
      return read.promise
    },
    onSave: (value) => {
      saves.push(value)
    },
  })
  const first = owner.save(fields)
  expect(await owner.save(fields)).toEqual({ state: "ignored" })
  expect(inputs).toEqual([nativeStaffStatusInput(initial, fields)])
  expect(saves).toEqual([])
  read.resolve(review)
  expect(await first).toEqual({ state: "saved" })
  expect(saves).toHaveLength(1)
  expect(saves[0]?.expectedRevision).toBe(19)
})

test("bad fields never send a review request or update the draft", async () => {
  let reads = 0
  let saves = 0
  const owner = createNativeStaffStatusSave({
    initial,
    isCurrent: () => true,
    fetchReview: async () => {
      reads++
      return review
    },
    onSave: () => {
      saves++
    },
  })
  expect((await owner.save({ ...fields, reason: "" })).state).toBe("error")
  expect(reads).toBe(0)
  expect(saves).toBe(0)
})

test("an unmounted draft cannot apply late success or late error", async () => {
  for (const reject of [false, true]) {
    const read = deferred<NativeStaffStatusReview>()
    let saves = 0
    const owner = createNativeStaffStatusSave({
      initial,
      isCurrent: () => true,
      fetchReview: () => read.promise,
      onSave: () => {
        saves++
      },
    })
    const request = owner.save(fields)
    owner.invalidate()
    if (reject) read.reject(Error("Denied"))
    else read.resolve(review)
    expect(await request).toEqual({ state: "ignored" })
    expect(saves).toBe(0)
    expect(await owner.save(fields)).toEqual({ state: "ignored" })
  }
})

test("scope or permission changes suppress a late callback even before unmount cleanup", async () => {
  const read = deferred<NativeStaffStatusReview>()
  let current = true
  let saves = 0
  const owner = createNativeStaffStatusSave({
    initial,
    isCurrent: () => current,
    fetchReview: () => read.promise,
    onSave: () => {
      saves++
    },
  })
  const request = owner.save(fields)
  current = false
  read.resolve(review)
  expect(await request).toEqual({ state: "ignored" })
  expect(saves).toBe(0)
})

test("cleanup plus reactivation cannot admit an earlier request into a new lifetime", async () => {
  const old = deferred<NativeStaffStatusReview>()
  const next = deferred<NativeStaffStatusReview>()
  let reads = 0
  const saves: GeneralStaffStatusAction[] = []
  const owner = createNativeStaffStatusSave({
    initial,
    isCurrent: () => true,
    fetchReview: () => (++reads === 1 ? old.promise : next.promise),
    onSave: (value) => {
      saves.push(value)
    },
  })
  const stale = owner.save(fields)
  owner.invalidate()
  owner.activate()
  const fresh = owner.save(fields)
  old.resolve(review)
  expect(await stale).toEqual({ state: "ignored" })
  expect(await owner.save(fields)).toEqual({ state: "ignored" })
  next.resolve({ ...review, expectedRevision: 20 })
  expect(await fresh).toEqual({ state: "saved" })
  expect(saves.map((row) => row.expectedRevision)).toEqual([20])
})

test("a refused read or mismatched review cannot save; a later explicit retry rereads", async () => {
  let reads = 0
  let saves = 0
  const owner = createNativeStaffStatusSave({
    initial,
    isCurrent: () => true,
    fetchReview: async () => {
      reads++
      if (reads === 1) throw Error("Current access denied")
      if (reads === 2) return { ...review, membershipId: "other" }
      return review
    },
    onSave: () => {
      saves++
    },
  })
  expect(await owner.save(fields)).toEqual({
    state: "error",
    stage: "review",
    error: "Current access denied",
  })
  expect((await owner.save(fields)).state).toBe("error")
  expect(saves).toBe(0)
  expect((await owner.save(fields)).state).toBe("saved")
  expect(reads).toBe(3)
  expect(saves).toBe(1)
})
