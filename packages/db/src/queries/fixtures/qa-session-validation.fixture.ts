// Inert rows only. The connected SQL probe shadows all six relations with CTEs;
// no Session, authorization, grant, membership, business or Store is inserted.
export type QaProofCase = {
  name: string
  binding: boolean
  active: boolean
  scoped: boolean
  domainEnabled: boolean
  session: {
    id: string
    qaAuthorizationId: string | null
    qaMembershipId: string | null
    qaTenantId: string | null
    qaStoreId: string | null
  } | null
  authorization: {
    id: string
    grantId: string
    status: string
    revokedAt: Date | null
    expiresAt: Date
  } | null
  grant: {
    id: string
    qaDomain: string
    status: string
    revokedAt: Date | null
    expiresAt: Date
  } | null
  membership: { id: string; tenantId: string; status: string } | null
  tenant: {
    id: string
    isActive: boolean
    dataClassification: string
    qaPurgeStartedAt: Date | null
    qaSourceDomain: string
  } | null
  store: { id: string; tenantId: string; status: string } | null
}
const past = new Date("2000-01-01T00:00:00Z")
const future = new Date("2100-01-01T00:00:00Z")
function proof(
  name: string,
  binding = true,
  change: (value: QaProofCase) => void = () => {},
) {
  const value: QaProofCase = {
    name,
    binding,
    active: binding,
    scoped: binding,
    domainEnabled: true,
    session: {
      id: `session-${name}`,
      qaAuthorizationId: `authorization-${name}`,
      qaMembershipId: `member-${name}`,
      qaTenantId: `tenant-${name}`,
      qaStoreId: `store-${name}`,
    },
    authorization: {
      id: `authorization-${name}`,
      grantId: `grant-${name}`,
      status: "ACTIVE",
      revokedAt: null,
      expiresAt: future,
    },
    grant: {
      id: `grant-${name}`,
      qaDomain: "inert.qa.test",
      status: "ACTIVE",
      revokedAt: null,
      expiresAt: future,
    },
    membership: {
      id: `member-${name}`,
      tenantId: `tenant-${name}`,
      status: "ACTIVE",
    },
    tenant: {
      id: `tenant-${name}`,
      isActive: true,
      dataClassification: "QA",
      qaPurgeStartedAt: null,
      qaSourceDomain: "inert.qa.test",
    },
    store: {
      id: `store-${name}`,
      tenantId: `tenant-${name}`,
      status: "ACTIVE",
    },
  }
  change(value)
  return value
}

export function qaProofCases() {
  return [
    proof("valid"),
    proof("missing-session", false, (v) => {
      v.session = null
    }),
    proof("legacy", true, (v) => {
      if (v.session) v.session.qaAuthorizationId = null
      v.scoped = false
    }),
    proof("empty-authorization", true, (v) => {
      if (v.session) v.session.qaAuthorizationId = ""
      v.scoped = false
    }),
    proof("missing-authorization", false, (v) => {
      v.authorization = null
    }),
    proof("authorization-revoked", false, (v) => {
      if (v.authorization) v.authorization.revokedAt = past
    }),
    proof("authorization-status", false, (v) => {
      if (v.authorization) v.authorization.status = "REVOKED"
    }),
    proof("authorization-expired", false, (v) => {
      if (v.authorization) v.authorization.expiresAt = past
    }),
    proof("missing-grant", false, (v) => {
      v.grant = null
    }),
    proof("grant-revoked", false, (v) => {
      if (v.grant) v.grant.revokedAt = past
    }),
    proof("grant-status", false, (v) => {
      if (v.grant) v.grant.status = "REVOKED"
    }),
    proof("grant-expired", false, (v) => {
      if (v.grant) v.grant.expiresAt = past
    }),
    proof("missing-membership", false, (v) => {
      v.membership = null
    }),
    proof("membership-status", false, (v) => {
      if (v.membership) v.membership.status = "REVOKED"
    }),
    proof("membership-id", false, (v) => {
      if (v.membership) v.membership.id = "other-member"
    }),
    proof("membership-tenant", false, (v) => {
      if (v.membership) v.membership.tenantId = "other-tenant"
    }),
    proof("missing-tenant", false, (v) => {
      v.tenant = null
    }),
    proof("tenant-inactive", false, (v) => {
      if (v.tenant) v.tenant.isActive = false
    }),
    proof("tenant-id", false, (v) => {
      if (v.tenant) v.tenant.id = "other-tenant"
    }),
    proof("tenant-live", false, (v) => {
      if (v.tenant) v.tenant.dataClassification = "LIVE"
    }),
    proof("tenant-purging", false, (v) => {
      if (v.tenant) v.tenant.qaPurgeStartedAt = past
    }),
    proof("tenant-domain", false, (v) => {
      if (v.tenant) v.tenant.qaSourceDomain = "other.qa.test"
    }),
    proof("missing-store", false, (v) => {
      v.store = null
    }),
    proof("store-status", false, (v) => {
      if (v.store) v.store.status = "DRAFT"
    }),
    proof("store-id", false, (v) => {
      if (v.store) v.store.id = "other-store"
    }),
    proof("store-tenant", false, (v) => {
      if (v.store) v.store.tenantId = "other-tenant"
    }),
    proof("null-membership", false, (v) => {
      if (v.session) v.session.qaMembershipId = null
    }),
    proof("null-tenant", false, (v) => {
      if (v.session) v.session.qaTenantId = null
    }),
    proof("null-store", false, (v) => {
      if (v.session) v.session.qaStoreId = null
    }),
    proof("empty-membership", false, (v) => {
      if (v.session) v.session.qaMembershipId = ""
    }),
    proof("empty-tenant", false, (v) => {
      if (v.session) v.session.qaTenantId = ""
    }),
    proof("empty-store", false, (v) => {
      if (v.session) v.session.qaStoreId = ""
    }),
    proof("domain-disabled", true, (v) => {
      v.domainEnabled = false
      v.active = false
      v.scoped = false
    }),
  ]
}

export function qaMembershipMatches(value: QaProofCase) {
  const { session: s, membership: m, tenant: t, store: st } = value
  return Boolean(
    s?.qaMembershipId &&
      m?.id === s.qaMembershipId &&
      m?.status === "ACTIVE" &&
      t?.id === m?.tenantId &&
      t?.id === (s?.qaTenantId ?? "") &&
      t?.isActive &&
      t?.dataClassification === "QA" &&
      t?.qaPurgeStartedAt === null &&
      t?.qaSourceDomain === value.grant?.qaDomain &&
      st?.id === (s?.qaStoreId ?? "") &&
      st?.tenantId === t?.id &&
      st?.status === "ACTIVE",
  )
}
