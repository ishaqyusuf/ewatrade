import { expect, test } from "bun:test"
import {
  type QaProfile,
  filterQaProfiles,
  formatQaCount,
  groupQaProfiles,
  qaProfileDisplayName,
  qaProfileKey,
  qaProfileLabel,
} from "./qa-profiles"

const profile: QaProfile = {
  business: { id: "b1", name: "Same name", slug: "business-one" },
  identity: { id: "u1", name: "Amina", email: "amina@qa.example.test" },
  store: { id: "s1", name: "Main Store" },
  membership: { role: "OWNER" },
  profileReference: "one",
  counts: { catalogItems: 4, services: 2, orders: 10 },
}
const branch = {
  ...profile,
  store: { id: "s2", name: "Branch" },
  profileReference: "two",
  counts: { catalogItems: 4, services: 2, orders: 3 },
}
const another = {
  ...profile,
  business: { id: "b2", name: "Same name" },
  profileReference: "three",
}

test("business IDs group profiles without merging names or summing shared counts", () => {
  const groups = groupQaProfiles([profile, branch, another])
  expect(groups.map((g) => g.profiles.map((p) => p.profileReference))).toEqual([
    ["one", "two"],
    ["three"],
  ])
  expect(groups[0]?.profiles[0]?.counts?.catalogItems).toBe(4)
  expect(groups[0]?.profiles.map((p) => p.counts?.orders)).toEqual([10, 3])
})
test("search covers identity, Store, slug and role and keeps only matching profiles", () => {
  for (const query of [" AMINA ", "qa.example", "business-one", "owner"])
    expect(filterQaProfiles([profile, branch], query)).toHaveLength(2)
  expect(filterQaProfiles([profile, branch], "branch")).toEqual([branch])
  expect(filterQaProfiles([profile], "absent")).toEqual([])
})
test("refreshing an opaque reference preserves selected identity, Store and role", () => {
  expect(qaProfileKey({ ...profile, profileReference: "renewed" })).toBe(
    qaProfileKey(profile),
  )
  expect(qaProfileKey(branch)).not.toBe(qaProfileKey(profile))
  expect(
    qaProfileKey({ ...profile, identity: { ...profile.identity, id: "u2" } }),
  ).not.toBe(qaProfileKey(profile))
  expect(qaProfileLabel(profile)).toBe(
    "amina@qa.example.test · Same name · Main Store · OWNER",
  )
})
test("zero stays zero; missing, failed and invalid counts never become zero", () => {
  expect(formatQaCount(0)).toBe("0")
  expect(formatQaCount(1234)).toBe("1,234")
  for (const value of [null, undefined, -1, Number.NaN, 1.5])
    expect(formatQaCount(value)).toBe("—")
})

test("visible person fallback does not show QA emails", () => {
  expect(qaProfileDisplayName(profile)).toBe("Amina")
  expect(
    qaProfileDisplayName({
      ...profile,
      identity: { ...profile.identity, name: profile.identity.email },
    }),
  ).toBe("Tester u1")
})
