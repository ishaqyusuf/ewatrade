-- DropForeignKey
ALTER TABLE "StoreConversationAccountGuardianApproval" DROP CONSTRAINT "StoreConversationAccountGuardianApproval_teenUserId_fkey";

-- DropForeignKey
ALTER TABLE "StoreConversationAccountGuardianApproval" DROP CONSTRAINT "StoreConversationAccountGuardianApproval_guardianUserId_fkey";

-- DropForeignKey
ALTER TABLE "StoreConversationGuestGuardianApproval" DROP CONSTRAINT "StoreConversationGuestGuardianApproval_guestIdentityId_fkey";

-- DropForeignKey
ALTER TABLE "StoreConversationGuestGuardianApproval" DROP CONSTRAINT "StoreConversationGuestGuardianApproval_guardianUserId_fkey";

-- DropTable
DROP TABLE "StoreConversationAccountGuardianApproval";

-- DropTable
DROP TABLE "StoreConversationGuestGuardianApproval";

-- DropEnum
DROP TYPE "GuardianApprovalStatus";
