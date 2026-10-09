-- AlterEnum
ALTER TYPE "AssistantConversationPurpose" ADD VALUE 'PRODUCT_CREATE';

-- AlterTable
ALTER TABLE "AssistantConversation" ADD COLUMN     "workflowContext" JSONB;
