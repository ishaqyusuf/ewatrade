import {
  DirectMetaWhatsAppProvider,
  type WhatsAppProvider,
  resolveCommunicationsCredential,
} from "@ewatrade/communications"
import { prisma } from "@ewatrade/db/client"
import {
  getWhatsAppConnectionForBackend,
  recordWhatsAppConnectionTest,
} from "@ewatrade/db/queries"
import { assertQaJobProviderAllowed } from "../qa-provider-guard"

export type WhatsAppConnectionTestPayload = {
  connectionId: string
  tenantId: string
}

type Dependencies = {
  assertProviderAllowed(input: { tenantId: string }): Promise<unknown>
  load(input: WhatsAppConnectionTestPayload): Promise<{
    credentialReference: string
    displayNumber: string
    phoneNumberId: string
    pendingCredentialReference: string | null
    testRecipient: string | null
    wabaId: string
  }>
  provider: WhatsAppProvider
  record(input: {
    businessVerified: boolean
    connectionId: string
    displayNumber: string
    failureCode?: string
    numberVerified: boolean
    outboundVerified: boolean
    tenantId: string
    webhookSubscribed: boolean
    templatesReady: boolean
    templateConfiguration: Record<string, string>
  }): Promise<unknown>
  resolveCredential(reference: string): string
}

function defaultDependencies(): Dependencies {
  return {
    assertProviderAllowed: ({ tenantId }) =>
      assertQaJobProviderAllowed({ operation: "whatsapp", tenantId }),
    load: (input) => getWhatsAppConnectionForBackend(prisma, input),
    provider: new DirectMetaWhatsAppProvider(),
    record: (input) => recordWhatsAppConnectionTest(prisma, input),
    resolveCredential: resolveCommunicationsCredential,
  }
}

export async function runWhatsAppConnectionTest(
  payload: WhatsAppConnectionTestPayload,
  dependencies: Dependencies = defaultDependencies(),
) {
  const connection = await dependencies.load(payload)
  await dependencies.assertProviderAllowed({ tenantId: payload.tenantId })
  try {
    const result = await dependencies.provider.testConnection({
      accessToken: dependencies.resolveCredential(
        connection.pendingCredentialReference ?? connection.credentialReference,
      ),
      phoneNumberId: connection.phoneNumberId,
      testRecipient: connection.testRecipient?.replaceAll(/\D/g, ""),
      wabaId: connection.wabaId,
    })
    await dependencies.record({
      ...result,
      connectionId: payload.connectionId,
      tenantId: payload.tenantId,
    })
    return result
  } catch (error) {
    await dependencies.record({
      businessVerified: false,
      connectionId: payload.connectionId,
      displayNumber: connection.displayNumber,
      failureCode: "connection_test_failed",
      numberVerified: false,
      outboundVerified: false,
      tenantId: payload.tenantId,
      webhookSubscribed: false,
      templatesReady: false,
      templateConfiguration: {},
    })
    throw error
  }
}

export async function whatsappConnectionTestHandler(
  payload: WhatsAppConnectionTestPayload,
) {
  await runWhatsAppConnectionTest(payload)
}
