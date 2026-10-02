import {
  type LegalRuntimeEnvironment,
  currentEffectiveLegalPublication,
  isLegalTestingEnvironment,
} from "@ewatrade/utils/legal-approval"

import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import { StoreConversationError } from "./store-conversations-core"

type DbClient = PrismaClient | Prisma.TransactionClient
type EffectivePublication = NonNullable<
  ReturnType<typeof currentEffectiveLegalPublication>
>

export async function assertAccountStoreConversationTermsAccepted(
  db: DbClient,
  userId: string,
  publication: EffectivePublication | null = currentEffectiveLegalPublication(),
  env: LegalRuntimeEnvironment = process.env,
) {
  if (isLegalTestingEnvironment(env)) return
  if (!publication) {
    throw new StoreConversationError(
      "NOT_READY",
      "Messaging is paused until the EwaTrade Terms are approved and effective. You can still read or report conversations.",
    )
  }
  const acceptance = await db.legalAcceptance.findUnique({
    where: { userId_version: { userId, version: publication.version } },
    select: { documentHash: true },
  })
  if (acceptance?.documentHash !== publication.documentHash) {
    throw new StoreConversationError(
      "NOT_READY",
      "Review and accept the current EwaTrade Terms before posting in this Store conversation.",
    )
  }
}
