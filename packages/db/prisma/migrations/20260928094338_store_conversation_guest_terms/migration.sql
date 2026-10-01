-- CreateTable
CREATE TABLE "StoreConversationGuestLegalAcceptance" (
    "id" TEXT NOT NULL,
    "guestIdentityId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "documentHash" TEXT NOT NULL,
    "surface" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreConversationGuestLegalAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StoreConversationGuestLegalAcceptance_acceptedAt_idx" ON "StoreConversationGuestLegalAcceptance"("acceptedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoreConversationGuestLegalAcceptance_guestIdentityId_versi_key" ON "StoreConversationGuestLegalAcceptance"("guestIdentityId", "version");

-- AddForeignKey
ALTER TABLE "StoreConversationGuestLegalAcceptance" ADD CONSTRAINT "StoreConversationGuestLegalAcceptance_guestIdentityId_fkey" FOREIGN KEY ("guestIdentityId") REFERENCES "StoreConversationGuestIdentity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
