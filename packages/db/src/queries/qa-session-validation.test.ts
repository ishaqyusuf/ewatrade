import { expect, mock, test } from "bun:test"
import * as policy from "@ewatrade/utils/qa-policy-server"
import type { Prisma } from "../../generated/prisma/client"
import {
  type QaProofCase,
  qaMembershipMatches,
  qaProofCases,
} from "./fixtures/qa-session-validation.fixture"
import type { DbClient } from "./types"

let current: QaProofCase
let domainError: Error | undefined
const domains: string[] = []
const policyExports = { ...policy }
mock.module("@ewatrade/utils/qa-policy-server", () => ({
  ...policyExports,
  managedQaDomainEnabled: async (domain: string) => {
    domains.push(domain)
    if (domainError) throw domainError
    return current.domainEnabled
  },
}))
const { validateQaDerivedSession } = await import("./qa-access")

function caseNamed(name = "valid") {
  const value = qaProofCases().find((item) => item.name === name)
  if (!value) throw new Error(`Unknown inert case ${name}`)
  return value
}

function fixture(value: QaProofCase) {
  current = structuredClone(value)
  domainError = undefined
  domains.length = 0
  const calls: string[] = []
  const deletes: unknown[] = []
  const statements: Prisma.Sql[] = []
  let readError: Error | undefined
  let deleteError: Error | undefined
  const db = {
    session: {
      findUnique: async () => {
        calls.push("session")
        if (readError) throw readError
        if (!current.session) return null
        return {
          ...current.session,
          qaAuthorization:
            current.authorization && current.grant
              ? { ...current.authorization, grant: current.grant }
              : null,
        }
      },
      deleteMany: async (input: unknown) => {
        deletes.push(input)
        if (deleteError) throw deleteError
        return { count: 1 }
      },
    },
    membership: {
      findFirst: async () => {
        calls.push("membership")
        return qaMembershipMatches(current)
          ? { id: current.membership?.id }
          : null
      },
    },
    $queryRaw: async (query: Prisma.Sql) => {
      calls.push("facts")
      statements.push(query)
      if (readError) throw readError
      const s = current.session
      if (!s) return []
      const a =
        current.authorization?.id === s.qaAuthorizationId
          ? current.authorization
          : null
      const g = current.grant?.id === a?.grantId ? current.grant : null
      return [
        {
          ...s,
          authorizationId: a?.id ?? null,
          authorizationStatus: a?.status ?? null,
          authorizationRevokedAt: a?.revokedAt ?? null,
          authorizationExpiresAt: a?.expiresAt ?? null,
          grantStatus: g?.status ?? null,
          grantRevokedAt: g?.revokedAt ?? null,
          grantExpiresAt: g?.expiresAt ?? null,
          qaDomain: g?.qaDomain ?? null,
          membershipMatches: qaMembershipMatches(current),
        },
      ]
    },
  } as unknown as DbClient
  return {
    db,
    calls,
    deletes,
    statements,
    failRead: (error: Error) => {
      readError = error
    },
    failDelete: (error: Error) => {
      deleteError = error
    },
  }
}

for (const value of qaProofCases()) {
  test(`current QA proof preserves ${value.name} admission, scope and revocation`, async () => {
    const f = fixture(value)
    const id = value.session?.id ?? "missing-session"
    const result = await validateQaDerivedSession(f.db, id)
    const scope = value.active && value.scoped ? value.session : null
    if (
      value.active &&
      value.scoped &&
      (!scope?.qaMembershipId || !scope.qaTenantId || !scope.qaStoreId)
    )
      throw new Error("Invalid inert scoped case")
    expect(result).toEqual({
      active: value.active,
      scope:
        scope?.qaMembershipId && scope.qaTenantId && scope.qaStoreId
          ? {
              membershipId: scope.qaMembershipId,
              tenantId: scope.qaTenantId,
              storeId: scope.qaStoreId,
            }
          : null,
    })
    expect(f.deletes).toEqual(
      value.session?.qaAuthorizationId && !value.active
        ? [{ where: { id } }]
        : [],
    )
    expect(domains).toEqual(
      value.session?.qaAuthorizationId && value.binding && value.grant?.qaDomain
        ? [value.grant.qaDomain]
        : [],
    )
  })
}

test("a valid proof uses one bounded statement instead of sequential session and membership reads", async () => {
  const f = fixture(caseNamed())
  await validateQaDerivedSession(f.db, current.session?.id ?? "")
  expect(f.calls).toEqual(["facts"])
  const query = f.statements[0]
  expect(query).toBeDefined()
  expect(query?.values).toEqual([current.session?.id])
  expect(query?.text).toContain('"QaClientAuthorization"')
  expect(query?.text).toContain('"QaTesterGrant"')
  expect(query?.text).not.toMatch(
    /tokenDigest|credentialDigest|userAgent|metadata|SELECT\s+\*/i,
  )
})

test("fresh rereads cannot reuse a formerly valid authorization or managed domain", async () => {
  const f = fixture(caseNamed())
  const id = current.session?.id ?? ""
  expect((await validateQaDerivedSession(f.db, id)).active).toBe(true)
  current.domainEnabled = false
  expect((await validateQaDerivedSession(f.db, id)).active).toBe(false)
  current.domainEnabled = true
  if (current.authorization)
    current.authorization.revokedAt = new Date("2000-01-01")
  expect((await validateQaDerivedSession(f.db, id)).active).toBe(false)
  expect(f.calls).toHaveLength(3)
  expect(domains).toHaveLength(2)
  expect(f.deletes).toEqual([{ where: { id } }, { where: { id } }])
})

test("read, managed-policy and invalid-session deletion failures preserve their identity", async () => {
  const source = new Error("inert read failure")
  const first = fixture(caseNamed())
  first.failRead(source)
  await expect(validateQaDerivedSession(first.db, "inert")).rejects.toBe(source)
  expect(first.deletes).toEqual([])
  const second = fixture(caseNamed())
  domainError = source
  await expect(validateQaDerivedSession(second.db, "inert")).rejects.toBe(
    source,
  )
  expect(second.deletes).toEqual([])
  const third = fixture(caseNamed("domain-disabled"))
  third.failDelete(source)
  await expect(validateQaDerivedSession(third.db, "inert")).rejects.toBe(source)
})
