-- CreateTable
CREATE TABLE "AccountPrivacyRateBucket" (
    "id" TEXT NOT NULL,
    "bucketDigest" TEXT NOT NULL,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "windowStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountPrivacyRateBucket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountPrivacyRateBucket_bucketDigest_key" ON "AccountPrivacyRateBucket"("bucketDigest");
