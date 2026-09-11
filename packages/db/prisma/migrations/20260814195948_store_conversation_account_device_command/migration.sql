-- CreateTable
CREATE TABLE "StoreConversationAccountDeviceCommand" (
    "id" TEXT NOT NULL,
    "accountUserId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "clientOperationId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreConversationAccountDeviceCommand_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StoreConversationAccountDeviceCommand_credentialId_createdA_idx" ON "StoreConversationAccountDeviceCommand"("credentialId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationAccountDeviceCommand_accountUserId_clientO_key" ON "StoreConversationAccountDeviceCommand"("accountUserId", "clientOperationId");

-- AddForeignKey
ALTER TABLE "StoreConversationAccountDeviceCommand" ADD CONSTRAINT "StoreConversationAccountDeviceCommand_accountUserId_fkey" FOREIGN KEY ("accountUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreConversationAccountDeviceCommand" ADD CONSTRAINT "StoreConversationAccountDeviceCommand_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "StoreConversationGuestCredential"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
