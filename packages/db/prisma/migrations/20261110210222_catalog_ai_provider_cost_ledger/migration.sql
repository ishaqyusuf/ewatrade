-- CreateTable
CREATE TABLE "CatalogAiProviderCost" (
    "id" TEXT NOT NULL,
    "reservedCostMicros" INTEGER NOT NULL,
    "costMicros" INTEGER,
    "providerRequestId" TEXT,
    "reconciliation" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogAiProviderCost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CatalogAiProviderCost_createdAt_idx" ON "CatalogAiProviderCost"("createdAt");
