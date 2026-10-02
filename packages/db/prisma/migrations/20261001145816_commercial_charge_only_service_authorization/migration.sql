-- CreateTable
CREATE TABLE "CommercialServiceAuthorization" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderLineId" TEXT NOT NULL,
    "clientOperationId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "quantity" DECIMAL(38,6) NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "authorizedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommercialServiceAuthorization_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommercialServiceAuthorization_orderLineId_key" ON "CommercialServiceAuthorization"("orderLineId");

-- CreateIndex
CREATE INDEX "CommercialServiceAuthorization_orderId_authorizedAt_idx" ON "CommercialServiceAuthorization"("orderId", "authorizedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommercialServiceAuthorization_tenantId_clientOperationId_key" ON "CommercialServiceAuthorization"("tenantId", "clientOperationId");

-- CreateIndex
CREATE UNIQUE INDEX "CommercialServiceAuthorization_orderId_orderLineId_key" ON "CommercialServiceAuthorization"("orderId", "orderLineId");

-- AddForeignKey
ALTER TABLE "CommercialServiceAuthorization" ADD CONSTRAINT "CommercialServiceAuthorization_tenantId_orderId_fkey" FOREIGN KEY ("tenantId", "orderId") REFERENCES "CommercialOrder"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialServiceAuthorization" ADD CONSTRAINT "CommercialServiceAuthorization_orderId_orderLineId_fkey" FOREIGN KEY ("orderId", "orderLineId") REFERENCES "CommercialOrderLine"("orderId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
