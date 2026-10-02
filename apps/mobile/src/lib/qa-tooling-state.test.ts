import { expect, test } from "bun:test"
import { currentQaToolingFacts } from "./qa-tooling-state"

const now = Date.now()
const base = {
  active: true,
  businessId: "business",
  failed: false,
  fetching: false,
  now,
  sessionMatches: true,
  storeId: "store",
  userId: "tester",
  data: {
    expiresAt: new Date(now + 60_000),
    principalId: "tester",
    storeId: "store",
    tenantId: "business",
  },
}

test("retains only fresh facts from the current authenticated QA scope", () => {
  expect(currentQaToolingFacts(base)).toEqual(base.data)
})
test.each([
  { ...base, active: false },
  { ...base, sessionMatches: false },
  { ...base, failed: true },
  { ...base, fetching: true },
  { ...base, data: null },
  { ...base, now: now + 60_000 },
  { ...base, userId: "another-account" },
  { ...base, businessId: "another-business" },
  { ...base, storeId: "another-store" },
])(
  "hides stale or unavailable QA tools across resume, logout and scope changes %#",
  (input) => {
    expect(currentQaToolingFacts(input)).toBeNull()
  },
)
