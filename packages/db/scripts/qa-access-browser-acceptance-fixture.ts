import { assertQaAccessAcceptanceDatabase } from "../src/queries/acceptance/qa-access/database"
import {
  createQaAccessAcceptanceFixture,
  disposeQaAccessAcceptanceFixture,
} from "../src/queries/acceptance/qa-access/fixture"
import { issueQaTesterCredential } from "../src/queries/qa-access"

assertQaAccessAcceptanceDatabase()

const secret = process.env.QA_ACCELERATOR_SECRET?.trim()
if (!secret || secret.length < 32) {
  throw new Error("QA_ACCELERATOR_SECRET must contain at least 32 characters.")
}

const fixture = await createQaAccessAcceptanceFixture({ secret })
let disposed = false

async function dispose() {
  if (disposed) return
  disposed = true
  const residue = await disposeQaAccessAcceptanceFixture(fixture)
  process.stdout.write(
    `${JSON.stringify({ cleanup: residue, status: "disposed" })}\n`,
  )
  await fixture.db.$disconnect()
}

try {
  const issued = await issueQaTesterCredential(fixture.db, {
    expiresAt: new Date(Date.now() + 2 * 60 * 60_000),
    qaDomain: fixture.domain,
    secret,
    testerIdentity: `browser-acceptance-${fixture.fixtureId}`,
  })
  fixture.grantIds.add(issued.grant.id)

  process.stdout.write(
    `${JSON.stringify({
      businesses: ["QA Acceptance Alpha", "QA Acceptance Beta"],
      credential: issued.credential,
      domain: fixture.domain,
      fixtureId: fixture.fixtureId,
      status: "ready",
    })}\n`,
  )

  await new Promise<void>((resolve) => {
    process.once("SIGINT", resolve)
    process.once("SIGTERM", resolve)
    process.stdin.once("data", resolve)
    process.stdin.resume()
  })
} finally {
  await dispose()
}
