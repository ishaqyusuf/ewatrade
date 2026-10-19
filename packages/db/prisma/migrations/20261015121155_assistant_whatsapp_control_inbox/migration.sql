/*
  Warnings:

  - A unique constraint covering the columns `[identityId,sequence]` on the table `AssistantWhatsAppInbox` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "AssistantWhatsAppInboxKind" AS ENUM ('TURN', 'CONTROL');

-- AlterTable
ALTER TABLE "AssistantWhatsAppIdentity" ADD COLUMN     "controlSequence" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "AssistantWhatsAppInbox" ADD COLUMN     "identityGeneration" INTEGER,
ADD COLUMN     "identityId" TEXT,
ADD COLUMN     "kind" "AssistantWhatsAppInboxKind" NOT NULL DEFAULT 'TURN',
ADD COLUMN     "selectionGeneration" INTEGER,
ALTER COLUMN "bindingId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "AssistantWhatsAppInbox_identityId_sequence_key" ON "AssistantWhatsAppInbox"("identityId", "sequence");

-- AddForeignKey
ALTER TABLE "AssistantWhatsAppInbox" ADD CONSTRAINT "AssistantWhatsAppInbox_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "AssistantWhatsAppIdentity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
