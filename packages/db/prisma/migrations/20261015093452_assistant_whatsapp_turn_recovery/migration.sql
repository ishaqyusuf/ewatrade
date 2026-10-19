/*
  Warnings:

  - A unique constraint covering the columns `[assistantMessageId]` on the table `AssistantRun` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "AssistantRun" ADD COLUMN     "assistantMessageId" TEXT;

-- AlterTable
ALTER TABLE "AssistantWhatsAppInbox" ADD COLUMN     "nextAttemptAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "AssistantRun_assistantMessageId_key" ON "AssistantRun"("assistantMessageId");

-- AddForeignKey
ALTER TABLE "AssistantRun" ADD CONSTRAINT "AssistantRun_assistantMessageId_fkey" FOREIGN KEY ("assistantMessageId") REFERENCES "AssistantMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
