-- CreateTable
CREATE TABLE "CommercialOrderCustomerLink" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "clientCommandId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "matchedBy" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommercialOrderCustomerLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommercialOrderCustomerLink_tenantId_clientCommandId_idx" ON "CommercialOrderCustomerLink"("tenantId", "clientCommandId");

-- CreateIndex
CREATE INDEX "CommercialOrderCustomerLink_tenantId_customerId_createdAt_idx" ON "CommercialOrderCustomerLink"("tenantId", "customerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommercialOrderCustomerLink_tenantId_orderId_key" ON "CommercialOrderCustomerLink"("tenantId", "orderId");

-- AddForeignKey
ALTER TABLE "CommercialOrderCustomerLink" ADD CONSTRAINT "CommercialOrderCustomerLink_tenantId_orderId_fkey" FOREIGN KEY ("tenantId", "orderId") REFERENCES "CommercialOrder"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialOrderCustomerLink" ADD CONSTRAINT "CommercialOrderCustomerLink_tenantId_customerId_fkey" FOREIGN KEY ("tenantId", "customerId") REFERENCES "Customer"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
