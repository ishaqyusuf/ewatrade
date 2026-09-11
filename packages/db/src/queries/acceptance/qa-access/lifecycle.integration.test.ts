import { expect, setDefaultTimeout, test } from "bun:test"
import {
  QaAccessError,
  exchangeQaTesterCredential,
  issueQaTesterCredential,
  listQaAccessProfiles,
  revalidateQaClientAuthorization,
  revokeQaClientAuthorization,
  revokeQaTesterGrant,
  selectQaAccessProfile,
  validateQaDerivedSession,
} from "../../qa-access"
import { describeWithQaAccessDatabase } from "./database"
import {
  type QaAccessAcceptanceFixture,
  createQaAccessAcceptanceFixture,
  disposeQaAccessAcceptanceFixture,
  trackQaAccessExchangeClient,
} from "./fixture"

setDefaultTimeout(120_000)

const zeroResidue = {
  auditEvents: 0,
  authorizations: 0,
  grants: 0,
  memberships: 0,
  profileSelections: 0,
  sessions: 0,
  stores: 0,
  tenants: 0,
  throttleBuckets: 0,
  users: 0,
}

describeWithQaAccessDatabase("QA accelerator access on Neon", () => {
  test("authorizes exact-domain mobile and web profiles, revokes them, and removes all run-owned residue", async () => {
    const fixture = await createQaAccessAcceptanceFixture()
    let lifecycleError: unknown

    try {
      await exerciseQaAccessLifecycle(fixture)
    } catch (error) {
      lifecycleError = error
    }

    const residue = await disposeQaAccessAcceptanceFixture(fixture)
    expect(residue).toEqual(zeroResidue)
    if (lifecycleError) throw lifecycleError
  })
})

async function exerciseQaAccessLifecycle(fixture: QaAccessAcceptanceFixture) {
  const expiresAt = new Date(Date.now() + 60 * 60_000)
  const issued = await issueQaTesterCredential(fixture.db, {
    expiresAt,
    qaDomain: fixture.domain,
    secret: fixture.secret,
    testerIdentity: `acceptance-${fixture.fixtureId}`,
  })
  fixture.grantIds.add(issued.grant.id)
  expect(issued.credential.startsWith("ewa_qa_")).toBe(true)

  const expired = await issueQaTesterCredential(fixture.db, {
    expiresAt,
    qaDomain: fixture.domain,
    secret: fixture.secret,
    testerIdentity: `expired-${fixture.fixtureId}`,
  })
  fixture.grantIds.add(expired.grant.id)
  await fixture.db.qaTesterGrant.update({
    data: { expiresAt: new Date(Date.now() - 1_000) },
    where: { id: expired.grant.id },
  })
  const expiredClientId = `expired-${fixture.fixtureId}`
  trackQaAccessExchangeClient(fixture, { clientId: expiredClientId })
  await expect(
    exchangeQaTesterCredential(fixture.db, {
      clientId: expiredClientId,
      clientPlatform: "mobile",
      credential: expired.credential,
      qaDomain: fixture.domain,
      secret: fixture.secret,
    }),
  ).rejects.toMatchObject({ category: "authorization_required" })

  const mismatchedDomain = `mismatch-${fixture.fixtureId}.qa.test`
  const mismatchClientId = `mismatch-${fixture.fixtureId}`
  trackQaAccessExchangeClient(fixture, {
    clientId: mismatchClientId,
    domain: mismatchedDomain,
  })
  await expect(
    exchangeQaTesterCredential(fixture.db, {
      clientId: mismatchClientId,
      clientPlatform: "web",
      credential: issued.credential,
      qaDomain: mismatchedDomain,
      secret: fixture.secret,
    }),
  ).rejects.toMatchObject({ category: "authorization_required" })

  const lockedClientId = `locked-${fixture.fixtureId}`
  trackQaAccessExchangeClient(fixture, { clientId: lockedClientId })
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await expect(
      exchangeQaTesterCredential(fixture.db, {
        clientId: lockedClientId,
        clientPlatform: "mobile",
        credential: `invalid-${fixture.fixtureId}`,
        qaDomain: fixture.domain,
        secret: fixture.secret,
      }),
    ).rejects.toMatchObject({ category: "authorization_required" })
  }
  await expect(
    exchangeQaTesterCredential(fixture.db, {
      clientId: lockedClientId,
      clientPlatform: "mobile",
      credential: issued.credential,
      qaDomain: fixture.domain,
      secret: fixture.secret,
    }),
  ).rejects.toMatchObject({ category: "locked" })

  const mobileClientId = `mobile-${fixture.fixtureId}`
  const mobile = await exchangeQaTesterCredential(fixture.db, {
    clientId: mobileClientId,
    clientPlatform: "mobile",
    credential: issued.credential,
    qaDomain: fixture.domain,
    secret: fixture.secret,
  })
  expect(mobile.authorization.qaDomain).toBe(fixture.domain)
  expect(mobile.authorization.expiresAt.getTime()).toBeLessThanOrEqual(
    issued.grant.expiresAt.getTime(),
  )
  const storedMobileAuthorization =
    await fixture.db.qaClientAuthorization.findFirstOrThrow({
      where: { grantId: issued.grant.id, clientPlatform: "mobile" },
    })
  expect(storedMobileAuthorization.clientId).not.toBe(mobileClientId)
  expect(storedMobileAuthorization.clientId).toHaveLength(64)

  const webClientId = `web-${fixture.fixtureId}`
  const web = await exchangeQaTesterCredential(fixture.db, {
    clientId: webClientId,
    clientPlatform: "web",
    credential: issued.credential,
    qaDomain: fixture.domain,
    secret: fixture.secret,
  })
  expect(web.authorization.qaDomain).toBe(fixture.domain)

  const revalidated = await revalidateQaClientAuthorization(fixture.db, {
    secret: fixture.secret,
    token: mobile.token,
  })
  expect(revalidated.qaDomain).toBe(fixture.domain)

  const mobileProfiles = await listQaAccessProfiles(fixture.db, {
    secret: fixture.secret,
    token: mobile.token,
  })
  const fixtureProfiles = mobileProfiles.filter((profile) =>
    fixture.tenantIds.includes(profile.business.id),
  )
  expect(fixtureProfiles).toHaveLength(2)
  expect(
    fixtureProfiles.map((profile) => profile.business.name).sort(),
  ).toEqual(["QA Acceptance Alpha", "QA Acceptance Beta"])
  expect(
    mobileProfiles.every((profile) =>
      profile.identity.email.endsWith(`@${fixture.domain}`),
    ),
  ).toBe(true)

  const alphaProfile = fixtureProfiles.find(
    (profile) => profile.business.name === "QA Acceptance Alpha",
  )
  if (!alphaProfile) throw new Error("Alpha QA Access Profile was not listed.")
  const selectionOutcomes = await Promise.allSettled([
    selectQaAccessProfile(fixture.db, {
      profileReference: alphaProfile.profileReference,
      secret: fixture.secret,
      token: mobile.token,
      userAgent: "qa-acceptance-mobile",
    }),
    selectQaAccessProfile(fixture.db, {
      profileReference: alphaProfile.profileReference,
      secret: fixture.secret,
      token: mobile.token,
      userAgent: "qa-acceptance-mobile-replay",
    }),
  ])
  expect(
    selectionOutcomes.filter((outcome) => outcome.status === "fulfilled"),
  ).toHaveLength(1)
  expect(
    selectionOutcomes.filter((outcome) => outcome.status === "rejected"),
  ).toHaveLength(1)
  const mobileSelection = selectionOutcomes.find(
    (outcome) => outcome.status === "fulfilled",
  )
  if (!mobileSelection || mobileSelection.status !== "fulfilled") {
    throw new Error("Mobile QA Access Profile selection did not succeed.")
  }
  const mobileSession = await fixture.db.session.findUniqueOrThrow({
    where: { token: mobileSelection.value.token },
  })
  expect(mobileSession.expiresAt.getTime()).toBeLessThanOrEqual(
    mobile.authorization.expiresAt.getTime(),
  )
  expect(await validateQaDerivedSession(fixture.db, mobileSession.id)).toEqual({
    active: true,
    scope: {
      membershipId: mobileSession.qaMembershipId,
      storeId: mobileSession.qaStoreId,
      tenantId: mobileSession.qaTenantId,
    },
  })

  const webProfiles = await listQaAccessProfiles(fixture.db, {
    secret: fixture.secret,
    token: web.token,
  })
  const betaProfile = webProfiles.find(
    (profile) => profile.business.name === "QA Acceptance Beta",
  )
  if (!betaProfile) throw new Error("Beta QA Access Profile was not listed.")
  const webSelection = await selectQaAccessProfile(fixture.db, {
    profileReference: betaProfile.profileReference,
    secret: fixture.secret,
    token: web.token,
    userAgent: "qa-acceptance-web",
  })
  const webSession = await fixture.db.session.findUniqueOrThrow({
    where: { token: webSelection.token },
  })
  expect(
    (await validateQaDerivedSession(fixture.db, webSession.id)).active,
  ).toBe(true)

  expect(
    await revokeQaClientAuthorization(fixture.db, {
      secret: fixture.secret,
      token: mobile.token,
    }),
  ).toEqual({ revoked: true })
  expect(await validateQaDerivedSession(fixture.db, mobileSession.id)).toEqual({
    active: false,
    scope: null,
  })
  await expect(
    revalidateQaClientAuthorization(fixture.db, {
      secret: fixture.secret,
      token: mobile.token,
    }),
  ).rejects.toBeInstanceOf(QaAccessError)

  expect(
    await revokeQaTesterGrant(fixture.db, {
      grantId: issued.grant.id,
      secret: fixture.secret,
    }),
  ).toEqual({ revoked: true })
  expect(await validateQaDerivedSession(fixture.db, webSession.id)).toEqual({
    active: false,
    scope: null,
  })

  const auditEvents = await fixture.db.qaAccessAuditEvent.findMany({
    orderBy: { createdAt: "asc" },
    where: { grantId: { in: [...fixture.grantIds] } },
  })
  expect(auditEvents.map((event) => event.eventType)).toEqual(
    expect.arrayContaining([
      "credential_issued",
      "credential_exchange",
      "profile_selected",
      "authorization_revoked",
      "credential_revoked",
    ]),
  )
  const serializedAudit = JSON.stringify(auditEvents)
  for (const sensitiveValue of [
    fixture.domain,
    fixture.secret,
    issued.credential,
    mobile.token,
    web.token,
    alphaProfile.profileReference,
    betaProfile.profileReference,
  ]) {
    expect(serializedAudit).not.toContain(sensitiveValue)
  }
}
