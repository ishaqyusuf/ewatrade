import type { PrismaClient } from "@ewatrade/db"
import { StoreConversationGuestCredentialPurpose } from "@ewatrade/db/enums"
import {
  authorizeGuestStoreConversationVoiceNoteView,
  authorizeStoreConversationAttachmentView,
} from "@ewatrade/db/queries"
import { getConfiguredPrivateMediaProvider as getPrescriptionMediaProvider } from "@ewatrade/prescriptions"
import { getConfiguredPrivateMediaProvider as getGenericMediaProvider } from "@ewatrade/service-commerce"

type Dependencies = {
  authorize: typeof authorizeStoreConversationAttachmentView
  grantGeneric(input: {
    expiresAt: Date
    mediaAssetId: string
    storageReference: string
  }): Promise<{ expiresAt: Date; url: string }>
  grantPrescription(input: {
    expiresInSeconds: number
    objectKey: string
  }): Promise<{ expiresAt: Date; url: string }>
}

function defaultDependencies(): Dependencies {
  return {
    authorize: (db, input) =>
      authorizeStoreConversationAttachmentView(db, input),
    grantGeneric: (input) => getGenericMediaProvider().createViewerGrant(input),
    grantPrescription: (input) =>
      getPrescriptionMediaProvider().createAuthorizedDelivery(input),
  }
}

export class StoreConversationAttachmentViewerUnavailableError extends Error {
  constructor() {
    super("This attachment view is currently unavailable.")
    this.name = "StoreConversationAttachmentViewerUnavailableError"
  }
}

export async function issueStoreConversationAttachmentViewerGrant(
  db: PrismaClient,
  input: {
    actorUserId: string
    conversationId: string
    messageAttachmentId: string
    reason: string
    storeId: string
    tenantId: string
  },
  dependencies: Dependencies = defaultDependencies(),
) {
  const authorized = await dependencies.authorize(db, {
    ...input,
    expiresAt: new Date(Date.now() + 60_000),
  })
  try {
    return authorized.kind === "generic"
      ? await dependencies.grantGeneric({
          expiresAt: authorized.expiresAt,
          mediaAssetId: authorized.mediaAssetId,
          storageReference: authorized.storageReference,
        })
      : await dependencies.grantPrescription({
          expiresInSeconds: 60,
          objectKey: authorized.storageReference,
        })
  } catch {
    throw new StoreConversationAttachmentViewerUnavailableError()
  }
}

type GuestVoiceDependencies = {
  authorize: typeof authorizeGuestStoreConversationVoiceNoteView
  grantGeneric(input: {
    expiresAt: Date
    mediaAssetId: string
    storageReference: string
  }): Promise<{ expiresAt: Date; url: string }>
}

export async function issueGuestStoreConversationVoiceNoteGrant(
  db: PrismaClient,
  input: {
    channel: "mobile" | "web"
    conversationId: string
    credentialToken: string
    installationToken?: string
    messageAttachmentId: string
    publicToken: string
  },
  dependencies: GuestVoiceDependencies = {
    authorize: (client, command) =>
      authorizeGuestStoreConversationVoiceNoteView(client, command),
    grantGeneric: (command) =>
      getGenericMediaProvider().createViewerGrant(command),
  },
) {
  const expiresAt = new Date(Date.now() + 60_000)
  const authorized = await dependencies.authorize(db, {
    conversationId: input.conversationId,
    credentialToken: input.credentialToken,
    expiresAt,
    installationToken: input.installationToken,
    messageAttachmentId: input.messageAttachmentId,
    publicToken: input.publicToken,
    purpose:
      input.channel === "mobile"
        ? StoreConversationGuestCredentialPurpose.MOBILE_DEVICE
        : StoreConversationGuestCredentialPurpose.WEB_DEVICE,
  })
  try {
    return await dependencies.grantGeneric({
      expiresAt: authorized.expiresAt,
      mediaAssetId: authorized.mediaAssetId,
      storageReference: authorized.storageReference,
    })
  } catch {
    throw new StoreConversationAttachmentViewerUnavailableError()
  }
}
