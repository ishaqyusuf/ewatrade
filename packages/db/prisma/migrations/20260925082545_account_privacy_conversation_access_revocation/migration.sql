-- AlterEnum
ALTER TYPE "StoreConversationAccountAccessStatus" ADD VALUE 'REVOKED';

-- AlterEnum
ALTER TYPE "StoreConversationWhatsAppCandidateStatus" ADD VALUE 'REVOKED';

-- AlterTable
ALTER TABLE "StoreConversationAccountAccess" ADD COLUMN     "revokedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "StoreConversationWhatsAppCandidate" ADD COLUMN     "revokedAt" TIMESTAMP(3);
