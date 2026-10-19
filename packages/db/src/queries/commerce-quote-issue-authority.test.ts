import {
  afterEach,
  beforeEach,
  describe,
  expect,
  setSystemTime,
  test,
} from "bun:test"
import { currentEffectiveLegalPublication } from "@ewatrade/utils/legal-approval"
import type { Prisma } from "../../generated/prisma/client"
import {
  type CommerceQuoteIssueAuthorityInput,
  readCommerceQuoteIssueAuthorityInTransaction,
  readCommerceQuoteIssueRecoveryAuthorityInTransaction,
} from "./commerce-quote-issue-authority"
import { allowedServiceCommercePolicyDecisionRows } from "./test-helpers/service-commerce-policy"

const scope: CommerceQuoteIssueAuthorityInput = {
  actorUserId: "actor-1",
  tenantId: "tenant-1",
  storeId: "store-1",
  sourceType: "service_request",
  vertical: "SERVICE",
}
const publication = {
  version: "inert-quote-terms",
  documentHash: "a".repeat(64),
  effectiveDate: "2026-10-15",
}
type PolicyRow = Omit<
  ReturnType<typeof allowedServiceCommercePolicyDecisionRows>[number],
  "revokedAt"
> & { revokedAt: Date | null }

const profile = {
  attachmentsEnabled: false,
  attachmentsProviderReady: false,
  bookingEnabled: false,
  catalogAdoptionMode: "PROGRESSIVE",
  deliveryEnabled: false,
  id: "profile-1",
  intakeEnabled: true,
  paymentEnabled: false,
  pickupEnabled: false,
  policyRestrictedCapabilities: [] as string[],
  procureToOrderEnabled: false,
  progressiveCatalogEnabled: false,
  quoteEnabled: true,
  revision: 3,
  serviceCompletionEnabled: false,
  staffEnabled: true,
  status: "ACTIVE",
  webEnabled: false,
  whatsappEnabled: false,
}

/** Actual composed helpers; transport stand-ins refuse every non-read operation. */
function fixture() {
  const policies: PolicyRow[] = allowedServiceCommercePolicyDecisionRows()
  const state = {
    tenantActive: true,
    storeActive: true,
    membershipPresent: true,
    accessPresent: true,
    role: "OWNER",
    mode: "LEGACY",
    accessRevision: 2,
    accessRole: null as string | null,
    profile: { ...profile },
    releasePolicy: {
      mode: "APPROVAL_REQUIRED",
      revision: 4,
      selectedApproverMembershipIds: ["checker-1"],
    } as {
      mode: string
      revision: number
      selectedApproverMembershipIds: string[]
    } | null,
    assignments: [
      { capability: "ATTENDANT", membershipId: "member-1" },
      { capability: "QUOTE_APPROVER", membershipId: "checker-1" },
    ],
    policies,
    acceptances: new Map<string, { documentHash: string; acceptedAt: Date }>(),
  }
  const reads: Array<{ table: string; method: string; args: unknown }> = []
  const forbidden: string[] = []
  const delegates: Record<
    string,
    Record<string, (args: Record<string, unknown>) => unknown>
  > = {
    tenant: {
      findFirst: () =>
        state.tenantActive ? { id: scope.tenantId, isActive: true } : null,
    },
    store: {
      findFirst: (args) => {
        const where = args.where as { status?: string }
        if (where.status === "ACTIVE" && !state.storeActive) return null
        return {
          id: scope.storeId,
          tenantId: scope.tenantId,
          countryCode: "NG",
          currencyCode: "NGN",
          status: state.storeActive ? "ACTIVE" : "DRAFT",
          name: "Current Store",
          serviceCommerceProfile: state.profile,
        }
      },
    },
    membership: {
      findFirst: (args) => {
        if (!state.membershipPresent) return null
        const select = args.select as Record<string, unknown>
        if (select.staffAccessMode)
          return state.accessPresent
            ? {
                role: state.accessRole ?? state.role,
                status: "ACTIVE",
                staffAccessMode: state.mode,
                staffAccessRevision: state.accessRevision,
                catalogEditor: false,
                retailOpsStaffProfile: { defaultStoreId: scope.storeId },
                staffStoreAssignments: [
                  {
                    storeId: scope.storeId,
                    role: "MANAGER",
                    status: "ACTIVE",
                    revision: 2,
                  },
                ],
              }
            : null
        return {
          id: "member-1",
          userId: scope.actorUserId,
          tenantId: scope.tenantId,
          role: state.role,
          status: "ACTIVE",
        }
      },
    },
    stockBalanceSource: { findFirst: () => null },
    serviceCommercePolicyDecision: { findMany: () => state.policies },
    serviceCommerceQuoteReleasePolicy: { findFirst: () => state.releasePolicy },
    serviceCommerceStoreTeamAssignment: { findMany: () => state.assignments },
    legalAcceptance: {
      findUnique: (args) => {
        const where = args.where as { userId_version: { version: string } }
        return state.acceptances.get(where.userId_version.version) ?? null
      },
    },
  }
  const tx = new Proxy(
    {},
    {
      get(_target, table: string) {
        if (table.startsWith("$"))
          return () => {
            forbidden.push(table)
            throw Error(`Forbidden ${table}`)
          }
        return new Proxy(
          {},
          {
            get(_model, method: string) {
              return async (args: Record<string, unknown>) => {
                if (!["findFirst", "findUnique", "findMany"].includes(method)) {
                  forbidden.push(`${table}.${method}`)
                  throw Error(`Forbidden ${table}.${method}`)
                }
                reads.push({ table, method, args })
                const delegate = delegates[table]?.[method]
                if (!delegate) throw Error(`Unexpected read ${table}.${method}`)
                return delegate(args)
              }
            },
          },
        )
      },
    },
  ) as Prisma.TransactionClient
  function accept(terms = publication) {
    state.acceptances.set(terms.version, {
      documentHash: terms.documentHash,
      acceptedAt: new Date("2026-10-16T01:00:00Z"),
    })
  }
  return { tx, state, reads, forbidden, accept }
}

beforeEach(() => setSystemTime(new Date("2026-10-16T12:00:00Z")))
afterEach(() => setSystemTime())

describe("read-only Quote issue authority", () => {
  test("saved-result recovery keeps current source authority without new release readiness, policy or Terms", async () => {
    for (const sourceType of ["service_request", "commerce_inquiry"] as const) {
      const f = fixture()
      const before = await readCommerceQuoteIssueAuthorityInTransaction(
        f.tx,
        { ...scope, sourceType },
        publication,
      )
      f.state.profile.status = "DISABLED"
      f.state.profile.intakeEnabled = false
      f.state.profile.staffEnabled = false
      f.state.policies = []
      f.state.assignments = []
      f.state.acceptances.clear()
      f.state.releasePolicy = {
        mode: "APPROVAL_REQUIRED",
        revision: 99,
        selectedApproverMembershipIds: [],
      }
      f.reads.length = 0
      const recovered =
        await readCommerceQuoteIssueRecoveryAuthorityInTransaction(f.tx, {
          ...scope,
          sourceType,
        })
      expect(recovered).toEqual({ actor: before.actor, store: before.store })
      expect(new Set(f.reads.map((read) => read.table))).toEqual(
        new Set(["tenant", "store", "membership"]),
      )
      expect(f.reads).toHaveLength(4)
      expect(Object.keys(recovered).sort()).toEqual(["actor", "store"])
      await expect(
        readCommerceQuoteIssueAuthorityInTransaction(
          f.tx,
          { ...scope, sourceType },
          publication,
        ),
      ).rejects.toMatchObject({ code: "FORBIDDEN" })
      expect(f.forbidden).toEqual([])
    }
  })

  test("recovery shares every persisted active scope, role, access-revision and assignment ceiling", async () => {
    for (const sourceType of ["service_request", "commerce_inquiry"] as const) {
      for (const role of [
        "OWNER",
        "ADMIN",
        "MANAGER",
        "CASHIER",
        "OPERATOR",
        "SUPPORT",
        "MEMBER",
      ] as const) {
        for (const mode of ["LEGACY", "SCOPED"]) {
          const f = fixture()
          f.state.role = role
          f.state.mode = mode
          const allowed =
            ["OWNER", "ADMIN"].includes(role) ||
            (mode === "LEGACY" &&
              (role === "MANAGER" ||
                (sourceType === "commerce_inquiry" &&
                  ["CASHIER", "OPERATOR"].includes(role))))
          const read = readCommerceQuoteIssueRecoveryAuthorityInTransaction(
            f.tx,
            { ...scope, sourceType },
          )
          if (allowed) expect((await read).actor.role).toBe(role)
          else await expect(read).rejects.toMatchObject({ code: "FORBIDDEN" })
          expect(f.forbidden).toEqual([])
        }
      }
    }
    for (const change of [
      (f: ReturnType<typeof fixture>) => {
        f.state.tenantActive = false
      },
      (f: ReturnType<typeof fixture>) => {
        f.state.storeActive = false
      },
      (f: ReturnType<typeof fixture>) => {
        f.state.membershipPresent = false
      },
      (f: ReturnType<typeof fixture>) => {
        f.state.accessPresent = false
      },
      (f: ReturnType<typeof fixture>) => {
        f.state.accessRole = "MANAGER"
      },
      ...[0, -1, 1.5, Number.NaN].map(
        (revision) => (f: ReturnType<typeof fixture>) => {
          f.state.accessRevision = revision
        },
      ),
    ]) {
      const f = fixture()
      change(f)
      await expect(
        readCommerceQuoteIssueRecoveryAuthorityInTransaction(f.tx, scope),
      ).rejects.toMatchObject({ code: "FORBIDDEN" })
      expect(f.forbidden).toEqual([])
    }
    const f = fixture()
    const mutable = { ...scope }
    const read = readCommerceQuoteIssueRecoveryAuthorityInTransaction(
      f.tx,
      mutable,
    )
    mutable.storeId = "foreign"
    expect((await read).store.id).toBe(scope.storeId)
  })

  test("binds stable fresh authority and all policy revisions without audits or private references", async () => {
    const f = fixture()
    const result = await readCommerceQuoteIssueAuthorityInTransaction(
      f.tx,
      scope,
      publication,
    )
    expect(result.actor).toMatchObject({
      userId: "actor-1",
      membershipId: "member-1",
      role: "OWNER",
      accessRevision: 2,
    })
    expect(result.release).toMatchObject({
      viableAlternateApproverMembershipIds: ["checker-1"],
      policy: { revision: 4 },
    })
    expect(result.legal).toMatchObject({
      requiredForImmediateRelease: false,
      publication,
      acceptance: null,
    })
    expect(result.policy.decisions).toHaveLength(f.state.policies.length)
    expect(result.policy.evaluation.outcome).toBe("allowed")
    expect(Object.keys(result.store).sort()).toEqual([
      "countryCode",
      "currencyCode",
      "id",
      "status",
      "tenantId",
    ])
    expect(
      await readCommerceQuoteIssueAuthorityInTransaction(
        f.tx,
        scope,
        publication,
      ),
    ).toEqual(result)
    expect(f.forbidden).toEqual([])
    expect(JSON.stringify(result)).not.toContain("private-test-evidence")
    expect(JSON.stringify(result)).not.toContain("approved-test-evidence")
    expect(JSON.stringify(result)).not.toContain("reviewer-1")
    for (const { table, args } of f.reads) {
      if (
        [
          "tenant",
          "store",
          "membership",
          "serviceCommercePolicyDecision",
          "serviceCommerceQuoteReleasePolicy",
          "serviceCommerceStoreTeamAssignment",
        ].includes(table)
      )
        expect(args).toMatchObject({ where: expect.any(Object) })
    }
    expect(
      f.reads.find(({ table }) => table === "membership")?.args,
    ).toMatchObject({
      where: {
        userId: scope.actorUserId,
        tenantId: scope.tenantId,
        status: "ACTIVE",
        tenant: { isActive: true },
      },
    })
    expect(
      f.reads.filter(({ table }) => table === "membership")[1]?.args,
    ).toMatchObject({
      where: {
        id: "member-1",
        tenantId: scope.tenantId,
        status: "ACTIVE",
        tenant: { isActive: true },
      },
    })
    const changed = f.state.policies.find(
      (row) =>
        row.subject === "INTAKE" &&
        row.channel === "STAFF" &&
        row.vertical === "SERVICE",
    )
    if (!changed) throw Error("Missing policy")
    changed.revision++
    changed.effectiveAt = new Date("2026-02-01T00:00:00Z")
    const next = await readCommerceQuoteIssueAuthorityInTransaction(
      f.tx,
      scope,
      publication,
    )
    expect(next.policy.evaluation).toEqual(result.policy.evaluation)
    expect(next.policy.decisions).not.toEqual(result.policy.decisions)
  })

  test("preserves separate Service/Inquiry role ceilings and conservatively refuses unsupported scoped nonOwners", async () => {
    for (const sourceType of ["service_request", "commerce_inquiry"] as const) {
      for (const role of [
        "OWNER",
        "ADMIN",
        "MANAGER",
        "CASHIER",
        "OPERATOR",
        "SUPPORT",
        "MEMBER",
      ] as const) {
        for (const mode of ["LEGACY", "SCOPED"]) {
          const f = fixture()
          f.state.role = role
          f.state.mode = mode
          const allowed =
            ["OWNER", "ADMIN"].includes(role) ||
            (mode === "LEGACY" &&
              (role === "MANAGER" ||
                (sourceType === "commerce_inquiry" &&
                  ["CASHIER", "OPERATOR"].includes(role))))
          const read = readCommerceQuoteIssueAuthorityInTransaction(
            f.tx,
            { ...scope, sourceType },
            publication,
          )
          if (allowed) expect((await read).actor.role).toBe(role)
          else await expect(read).rejects.toMatchObject({ code: "FORBIDDEN" })
          expect(f.forbidden).toEqual([])
        }
      }
    }
  })

  test("refuses missing/inactive persisted scope, changed access, and invalid positive revisions", async () => {
    for (const change of [
      (f: ReturnType<typeof fixture>) => {
        f.state.tenantActive = false
      },
      (f: ReturnType<typeof fixture>) => {
        f.state.storeActive = false
      },
      (f: ReturnType<typeof fixture>) => {
        f.state.membershipPresent = false
      },
      (f: ReturnType<typeof fixture>) => {
        f.state.accessPresent = false
      },
      (f: ReturnType<typeof fixture>) => {
        f.state.accessRole = "MANAGER"
      },
      ...[0, -1, 1.5, Number.NaN].map(
        (revision) => (f: ReturnType<typeof fixture>) => {
          f.state.accessRevision = revision
        },
      ),
    ]) {
      const f = fixture()
      change(f)
      await expect(
        readCommerceQuoteIssueAuthorityInTransaction(f.tx, scope, publication),
      ).rejects.toMatchObject({ code: "FORBIDDEN" })
      expect(f.forbidden).toEqual([])
    }
    const f = fixture()
    await expect(
      readCommerceQuoteIssueAuthorityInTransaction(
        f.tx,
        { ...scope, vertical: "PHARMACY" } as never,
        publication,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    await expect(
      readCommerceQuoteIssueAuthorityInTransaction(
        f.tx,
        { ...scope, sourceType: "prescription_request" } as never,
        publication,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(f.reads).toEqual([])
  })

  test("Inquiry retains active workspace requirements while Service does not invent them", async () => {
    for (const change of [
      (f: ReturnType<typeof fixture>) => {
        f.state.profile.status = "DISABLED"
      },
      (f: ReturnType<typeof fixture>) => {
        f.state.profile.intakeEnabled = false
      },
      (f: ReturnType<typeof fixture>) => {
        f.state.profile.staffEnabled = false
      },
      (f: ReturnType<typeof fixture>) => {
        f.state.profile.policyRestrictedCapabilities = ["intake"]
      },
    ]) {
      const f = fixture()
      change(f)
      await expect(
        readCommerceQuoteIssueAuthorityInTransaction(
          f.tx,
          { ...scope, sourceType: "commerce_inquiry" },
          publication,
        ),
      ).rejects.toMatchObject({ code: "FORBIDDEN" })
      await expect(
        readCommerceQuoteIssueAuthorityInTransaction(f.tx, scope, publication),
      ).resolves.toMatchObject({ actor: { role: "OWNER" } })
      expect(f.forbidden).toEqual([])
    }
  })

  test("refuses revoked, expired, future, foreign jurisdiction and missing policy without writes", async () => {
    for (const change of [
      (row: PolicyRow) => {
        row.revokedAt = new Date("2026-10-15")
      },
      (row: PolicyRow) => {
        row.expiresAt = new Date("2026-10-15")
      },
      (row: PolicyRow) => {
        row.effectiveAt = new Date("2027-01-01")
      },
      (row: PolicyRow) => {
        row.jurisdictionCode = "GH"
      },
    ]) {
      const f = fixture()
      const row = f.state.policies.find(
        (row) =>
          row.vertical === "SERVICE" &&
          row.channel === "STAFF" &&
          row.subject === "QUOTE",
      )
      if (!row) throw Error("Missing exact policy")
      change(row)
      await expect(
        readCommerceQuoteIssueAuthorityInTransaction(f.tx, scope, publication),
      ).rejects.toMatchObject({ code: "FORBIDDEN" })
      expect(f.forbidden).toEqual([])
    }
    const f = fixture()
    f.state.policies = []
    await expect(
      readCommerceQuoteIssueAuthorityInTransaction(f.tx, scope, publication),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
  })

  test("requires current attendant and a different selected active approver", async () => {
    for (const assignments of [
      [],
      [{ capability: "QUOTE_APPROVER", membershipId: "checker-1" }],
      [
        { capability: "ATTENDANT", membershipId: "member-1" },
        { capability: "QUOTE_APPROVER", membershipId: "member-1" },
      ],
      [
        { capability: "ATTENDANT", membershipId: "member-1" },
        { capability: "QUOTE_APPROVER", membershipId: "not-selected" },
      ],
    ]) {
      const f = fixture()
      f.state.assignments = assignments
      await expect(
        readCommerceQuoteIssueAuthorityInTransaction(f.tx, scope, publication),
      ).rejects.toMatchObject({ code: "FORBIDDEN" })
      expect(f.forbidden).toEqual([])
    }
  })

  test("immediate release requires both exact publication acceptances; QA does not bypass them", async () => {
    const f = fixture()
    f.state.releasePolicy = null
    f.state.assignments = []
    const linked = currentEffectiveLegalPublication()
    if (!linked) throw Error("Fixed current publication must be effective")
    await expect(
      readCommerceQuoteIssueAuthorityInTransaction(f.tx, scope, publication),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    f.accept()
    await expect(
      readCommerceQuoteIssueAuthorityInTransaction(f.tx, scope, publication),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    f.accept(linked)
    const result = await readCommerceQuoteIssueAuthorityInTransaction(
      f.tx,
      scope,
      publication,
    )
    expect(result.legal).toMatchObject({
      requiredForImmediateRelease: true,
      publication,
      linkedPublication: linked,
    })
    expect(result.release.compatibilityDefault).toBe(true)
    expect(result.legal.acceptance?.documentHash).toBe(publication.documentHash)
    expect(result.legal.linkedAcceptance?.documentHash).toBe(
      linked.documentHash,
    )
    f.state.acceptances.set(linked.version, {
      documentHash: "b".repeat(64),
      acceptedAt: new Date(),
    })
    await expect(
      readCommerceQuoteIssueAuthorityInTransaction(f.tx, scope, publication),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
    expect(f.forbidden).toEqual([])
  })

  test("snapshots server scope and supplied publication before awaiting current facts", async () => {
    const f = fixture()
    const mutableScope = { ...scope }
    const mutablePublication = { ...publication }
    const read = readCommerceQuoteIssueAuthorityInTransaction(
      f.tx,
      mutableScope,
      mutablePublication,
    )
    mutableScope.storeId = "foreign-store"
    mutablePublication.version = "changed-after-start"
    const result = await read
    expect(result.store.id).toBe(scope.storeId)
    expect(result.legal.publication).toEqual(publication)
  })
})
