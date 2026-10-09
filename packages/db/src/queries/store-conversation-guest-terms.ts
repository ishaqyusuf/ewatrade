import { currentEffectiveLegalPublication } from "@ewatrade/utils/legal-approval"

import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import { StoreConversationGuestCredentialPurpose } from "../../generated/prisma/enums"
import {
  StoreConversationError,
  resolveStoreConversationGuestCredential,
} from "./store-conversations-core"

type DbClient = PrismaClient | Prisma.TransactionClient
export type GuestTermsPublication = NonNullable<
  ReturnType<typeof currentEffectiveLegalPublication>
>

export const GUEST_TERMS_REQUIRED_MESSAGE =
  "Review and accept the current EwaTrade Terms before posting in this Store conversation."

function effectiveTerms(publicationOverride?: GuestTermsPublication | null) {
  const publication =
    publicationOverride === undefined
      ? currentEffectiveLegalPublication()
      : publicationOverride
  if (!publication) {
    throw new StoreConversationError(
      "NOT_READY",
      "Messaging is paused until the EwaTrade Terms are approved and effective. You can still read or report this conversation.",
    )
  }
  return publication
}

export async function assertGuestStoreConversationTermsAccepted(
  db: DbClient,
  guestIdentityId: string,
  publicationOverride?: GuestTermsPublication | null,
) {
  const publication = effectiveTerms(publicationOverride)
  const acceptance = await db.storeConversationGuestLegalAcceptance.findUnique({
    where: {
      guestIdentityId_version: {
        guestIdentityId,
        version: publication.version,
      },
    },
  })
  if (acceptance?.documentHash !== publication.documentHash) {
    throw new StoreConversationError("NOT_READY", GUEST_TERMS_REQUIRED_MESSAGE)
  }
  return acceptance
}

export async function getGuestStoreConversationTermsStatus(
  db: DbClient,
  input: {
    credentialToken: string
    installationToken?: string
    purpose: StoreConversationGuestCredentialPurpose
  },
) {
  const credential = await resolveStoreConversationGuestCredential(db, {
    ...input,
    now: new Date(),
  })
  const publication = currentEffectiveLegalPublication()
  if (!publication) {
    return {
      accepted: false,
      effective: false,
      effectiveDate: null,
      version: null,
    }
  }
  const acceptance = await db.storeConversationGuestLegalAcceptance.findUnique({
    where: {
      guestIdentityId_version: {
        guestIdentityId: credential.guestIdentityId,
        version: publication.version,
      },
    },
  })
  return {
    accepted: acceptance?.documentHash === publication.documentHash,
    effective: true,
    effectiveDate: publication.effectiveDate,
    version: publication.version,
  }
}

export async function acceptGuestStoreConversationTerms(
  db: PrismaClient,
  input: {
    acceptedTerms: true
    credentialToken: string
    installationToken?: string
    purpose: StoreConversationGuestCredentialPurpose
    version: string
  },
  publicationOverride?: GuestTermsPublication,
) {
  const publication = effectiveTerms(publicationOverride)
  if (input.acceptedTerms !== true || input.version !== publication.version) {
    throw new StoreConversationError(
      "NOT_READY",
      "Review the current EwaTrade Terms before continuing.",
    )
  }
  return db.$transaction(async (tx) => {
    const credential = await resolveStoreConversationGuestCredential(tx, {
      credentialToken: input.credentialToken,
      installationToken: input.installationToken,
      now: new Date(),
      purpose: input.purpose,
    })
    const existing = await tx.storeConversationGuestLegalAcceptance.findUnique({
      where: {
        guestIdentityId_version: {
          guestIdentityId: credential.guestIdentityId,
          version: publication.version,
        },
      },
    })
    if (existing && existing.documentHash !== publication.documentHash) {
      throw new StoreConversationError(
        "NOT_READY",
        "The Terms changed under this version. A new version must be published.",
      )
    }
    const acceptance =
      existing ??
      (await tx.storeConversationGuestLegalAcceptance.upsert({
        create: {
          documentHash: publication.documentHash,
          guestIdentityId: credential.guestIdentityId,
          surface:
            input.purpose ===
            StoreConversationGuestCredentialPurpose.MOBILE_DEVICE
              ? "customer_mobile_conversation"
              : "customer_web_conversation",
          version: publication.version,
        },
        update: {},
        where: {
          guestIdentityId_version: {
            guestIdentityId: credential.guestIdentityId,
            version: publication.version,
          },
        },
      }))
    if (acceptance.documentHash !== publication.documentHash) {
      throw new StoreConversationError(
        "NOT_READY",
        "The Terms changed under this version. A new version must be published.",
      )
    }
    return {
      accepted: true,
      acceptedAt: acceptance.acceptedAt,
      effectiveDate: publication.effectiveDate,
      version: publication.version,
    }
  })
}
