-- CreateEnum
CREATE TYPE "RetailOpsCloseoutStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'NEEDS_CORRECTION');

-- CreateEnum
CREATE TYPE "RetailOpsCloseoutReviewResult" AS ENUM ('APPROVED', 'REJECTED', 'NEEDS_CORRECTION');

-- CreateEnum
CREATE TYPE "RetailOpsPaymentDeclarationMethod" AS ENUM ('CASH', 'TRANSFER', 'CARD', 'CREDIT', 'OTHER');

-- CreateEnum
CREATE TYPE "RetailOpsStockDeclarationType" AS ENUM ('OPENING', 'CLOSING');

-- CreateEnum
CREATE TYPE "RetailOpsStockDeclarationSource" AS ENUM ('CENTRAL_STOCK', 'STAFF_WALLET');

-- CreateTable
CREATE TABLE "RetailOpsCloseout" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "cashierSessionId" TEXT NOT NULL,
    "status" "RetailOpsCloseoutStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "expectedTotalMinor" INTEGER NOT NULL DEFAULT 0,
    "declaredTotalMinor" INTEGER NOT NULL DEFAULT 0,
    "varianceTotalMinor" INTEGER NOT NULL DEFAULT 0,
    "paymentVarianceCount" INTEGER NOT NULL DEFAULT 0,
    "stockVarianceLineCount" INTEGER NOT NULL DEFAULT 0,
    "submittedByUserId" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "externalId" TEXT,
    "deviceId" TEXT,
    "syncEventId" TEXT,
    "notes" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailOpsCloseout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetailOpsPaymentDeclaration" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "closeoutId" TEXT NOT NULL,
    "cashierSessionId" TEXT NOT NULL,
    "method" "RetailOpsPaymentDeclarationMethod" NOT NULL,
    "expectedMinor" INTEGER NOT NULL DEFAULT 0,
    "declaredMinor" INTEGER NOT NULL DEFAULT 0,
    "varianceMinor" INTEGER NOT NULL DEFAULT 0,
    "declaredByUserId" TEXT,
    "declaredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailOpsPaymentDeclaration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetailOpsStockDeclaration" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "closeoutId" TEXT,
    "cashierSessionId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productVariantId" TEXT NOT NULL,
    "type" "RetailOpsStockDeclarationType" NOT NULL,
    "stockSource" "RetailOpsStockDeclarationSource" NOT NULL DEFAULT 'CENTRAL_STOCK',
    "unitNameSnapshot" TEXT NOT NULL,
    "unitSkuSnapshot" TEXT,
    "expectedQuantity" INTEGER NOT NULL DEFAULT 0,
    "countedQuantity" INTEGER NOT NULL DEFAULT 0,
    "varianceQuantity" INTEGER NOT NULL DEFAULT 0,
    "damagedQuantity" INTEGER NOT NULL DEFAULT 0,
    "lostQuantity" INTEGER NOT NULL DEFAULT 0,
    "declaredByUserId" TEXT,
    "declaredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailOpsStockDeclaration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetailOpsCloseoutReview" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "closeoutId" TEXT NOT NULL,
    "cashierSessionId" TEXT NOT NULL,
    "result" "RetailOpsCloseoutReviewResult" NOT NULL,
    "reviewedByUserId" TEXT NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetailOpsCloseoutReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RetailOpsCloseout_cashierSessionId_key" ON "RetailOpsCloseout"("cashierSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "RetailOpsCloseout_tenantId_storeId_externalId_key" ON "RetailOpsCloseout"("tenantId", "storeId", "externalId");

-- CreateIndex
CREATE INDEX "RetailOpsCloseout_tenantId_storeId_status_idx" ON "RetailOpsCloseout"("tenantId", "storeId", "status");

-- CreateIndex
CREATE INDEX "RetailOpsCloseout_cashierSessionId_status_idx" ON "RetailOpsCloseout"("cashierSessionId", "status");

-- CreateIndex
CREATE INDEX "RetailOpsCloseout_submittedByUserId_submittedAt_idx" ON "RetailOpsCloseout"("submittedByUserId", "submittedAt");

-- CreateIndex
CREATE INDEX "RetailOpsCloseout_reviewedByUserId_reviewedAt_idx" ON "RetailOpsCloseout"("reviewedByUserId", "reviewedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RetailOpsPaymentDeclaration_closeoutId_method_key" ON "RetailOpsPaymentDeclaration"("closeoutId", "method");

-- CreateIndex
CREATE INDEX "RetailOpsPaymentDeclaration_tenantId_storeId_method_idx" ON "RetailOpsPaymentDeclaration"("tenantId", "storeId", "method");

-- CreateIndex
CREATE INDEX "RetailOpsPaymentDeclaration_cashierSessionId_method_idx" ON "RetailOpsPaymentDeclaration"("cashierSessionId", "method");

-- CreateIndex
CREATE INDEX "RetailOpsPaymentDeclaration_declaredByUserId_declaredAt_idx" ON "RetailOpsPaymentDeclaration"("declaredByUserId", "declaredAt");

-- CreateIndex
CREATE UNIQUE INDEX "RetailOpsStockDeclaration_cashierSessionId_type_productVariantId_stockSource_key" ON "RetailOpsStockDeclaration"("cashierSessionId", "type", "productVariantId", "stockSource");

-- CreateIndex
CREATE INDEX "RetailOpsStockDeclaration_tenantId_storeId_type_idx" ON "RetailOpsStockDeclaration"("tenantId", "storeId", "type");

-- CreateIndex
CREATE INDEX "RetailOpsStockDeclaration_closeoutId_idx" ON "RetailOpsStockDeclaration"("closeoutId");

-- CreateIndex
CREATE INDEX "RetailOpsStockDeclaration_productVariantId_declaredAt_idx" ON "RetailOpsStockDeclaration"("productVariantId", "declaredAt");

-- CreateIndex
CREATE INDEX "RetailOpsStockDeclaration_declaredByUserId_declaredAt_idx" ON "RetailOpsStockDeclaration"("declaredByUserId", "declaredAt");

-- CreateIndex
CREATE INDEX "RetailOpsCloseoutReview_tenantId_storeId_reviewedAt_idx" ON "RetailOpsCloseoutReview"("tenantId", "storeId", "reviewedAt");

-- CreateIndex
CREATE INDEX "RetailOpsCloseoutReview_closeoutId_reviewedAt_idx" ON "RetailOpsCloseoutReview"("closeoutId", "reviewedAt");

-- CreateIndex
CREATE INDEX "RetailOpsCloseoutReview_cashierSessionId_reviewedAt_idx" ON "RetailOpsCloseoutReview"("cashierSessionId", "reviewedAt");

-- CreateIndex
CREATE INDEX "RetailOpsCloseoutReview_reviewedByUserId_reviewedAt_idx" ON "RetailOpsCloseoutReview"("reviewedByUserId", "reviewedAt");

-- CreateIndex
CREATE INDEX "RetailOpsCloseoutReview_result_reviewedAt_idx" ON "RetailOpsCloseoutReview"("result", "reviewedAt");

-- AddForeignKey
ALTER TABLE "RetailOpsCloseout" ADD CONSTRAINT "RetailOpsCloseout_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailOpsCloseout" ADD CONSTRAINT "RetailOpsCloseout_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailOpsCloseout" ADD CONSTRAINT "RetailOpsCloseout_cashierSessionId_fkey" FOREIGN KEY ("cashierSessionId") REFERENCES "CashierSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailOpsPaymentDeclaration" ADD CONSTRAINT "RetailOpsPaymentDeclaration_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailOpsPaymentDeclaration" ADD CONSTRAINT "RetailOpsPaymentDeclaration_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailOpsPaymentDeclaration" ADD CONSTRAINT "RetailOpsPaymentDeclaration_closeoutId_fkey" FOREIGN KEY ("closeoutId") REFERENCES "RetailOpsCloseout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailOpsPaymentDeclaration" ADD CONSTRAINT "RetailOpsPaymentDeclaration_cashierSessionId_fkey" FOREIGN KEY ("cashierSessionId") REFERENCES "CashierSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailOpsStockDeclaration" ADD CONSTRAINT "RetailOpsStockDeclaration_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailOpsStockDeclaration" ADD CONSTRAINT "RetailOpsStockDeclaration_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailOpsStockDeclaration" ADD CONSTRAINT "RetailOpsStockDeclaration_closeoutId_fkey" FOREIGN KEY ("closeoutId") REFERENCES "RetailOpsCloseout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailOpsStockDeclaration" ADD CONSTRAINT "RetailOpsStockDeclaration_cashierSessionId_fkey" FOREIGN KEY ("cashierSessionId") REFERENCES "CashierSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailOpsStockDeclaration" ADD CONSTRAINT "RetailOpsStockDeclaration_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailOpsStockDeclaration" ADD CONSTRAINT "RetailOpsStockDeclaration_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailOpsCloseoutReview" ADD CONSTRAINT "RetailOpsCloseoutReview_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailOpsCloseoutReview" ADD CONSTRAINT "RetailOpsCloseoutReview_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailOpsCloseoutReview" ADD CONSTRAINT "RetailOpsCloseoutReview_closeoutId_fkey" FOREIGN KEY ("closeoutId") REFERENCES "RetailOpsCloseout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetailOpsCloseoutReview" ADD CONSTRAINT "RetailOpsCloseoutReview_cashierSessionId_fkey" FOREIGN KEY ("cashierSessionId") REFERENCES "CashierSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
