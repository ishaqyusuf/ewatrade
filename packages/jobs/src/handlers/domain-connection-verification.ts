import { prisma } from "@ewatrade/db/client"
import { updateDomainConnectionStatus } from "@ewatrade/db/queries"
import { VercelDomainClient } from "@ewatrade/domains"

export type DomainConnectionVerificationPayload = { connectionId: string }

function requireEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required.`)
  return value
}

export async function domainConnectionVerificationHandler(
  input: DomainConnectionVerificationPayload,
  _attempt: number,
) {
  const connection = await prisma.domainConnection.findUnique({
    where: { id: input.connectionId },
  })

  if (!connection || connection.status === "ACTIVE") {
    return
  }

  try {
    const projectId =
      connection.vercelProjectId?.trim() ||
      requireEnv("VERCEL_STOREFRONT_PROJECT_ID")
    const vercel = new VercelDomainClient({
      teamId: process.env.VERCEL_TEAM_ID,
      token: requireEnv("VERCEL_API_TOKEN"),
    })
    await vercel.addDomain(projectId, connection.hostname)
    const state = await vercel.inspectDomain(projectId, connection.hostname)
    await updateDomainConnectionStatus(prisma, {
      connectionId: connection.id,
      failureCode: null,
      failureMessage: null,
      status: state.verified ? "ACTIVE" : "VERIFYING",
      verificationRecordName: state.verified
        ? null
        : state.verificationRecord?.name,
      verificationRecordType: state.verified
        ? null
        : state.verificationRecord?.type,
      verificationRecordValue: state.verified
        ? null
        : state.verificationRecord?.value,
    })
  } catch (error) {
    await updateDomainConnectionStatus(prisma, {
      connectionId: connection.id,
      failureCode: "VERCEL_DOMAIN_VERIFICATION_FAILED",
      failureMessage:
        error instanceof Error ? error.message : "Unknown Vercel error",
      status: "FAILED",
    })
    throw error
  }
}
