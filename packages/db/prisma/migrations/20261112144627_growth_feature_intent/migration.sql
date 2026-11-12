-- CreateTable
CREATE TABLE "GrowthFeatureIntent" (
    "tenantId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "taps" INTEGER NOT NULL DEFAULT 0,
    "firstAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrowthFeatureIntent_pkey" PRIMARY KEY ("tenantId","feature","month")
);

-- CreateIndex
CREATE INDEX "GrowthFeatureIntent_month_feature_taps_idx" ON "GrowthFeatureIntent"("month", "feature", "taps");

-- AddForeignKey
ALTER TABLE "GrowthFeatureIntent" ADD CONSTRAINT "GrowthFeatureIntent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
