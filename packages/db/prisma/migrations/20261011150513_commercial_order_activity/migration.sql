-- CreateEnum
CREATE TYPE "CommercialOrderAttachmentKind" AS ENUM ('IMAGE', 'DOCUMENT', 'VIDEO');

-- CreateEnum
CREATE TYPE "CommercialOrderAttachmentStatus" AS ENUM ('PENDING_UPLOAD', 'READY');

-- CreateTable
CREATE TABLE "CommercialOrderActivity" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "clientActivityId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "body" TEXT,
    "source" TEXT NOT NULL DEFAULT 'staff',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommercialOrderActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommercialOrderAttachment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "kind" "CommercialOrderAttachmentKind" NOT NULL,
    "status" "CommercialOrderAttachmentStatus" NOT NULL DEFAULT 'PENDING_UPLOAD',
    "contentType" TEXT NOT NULL,
    "contentDigest" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "originalFileName" TEXT,
    "storageProvider" TEXT,
    "storageStoreId" TEXT,
    "storagePath" TEXT,
    "uploadExpiresAt" TIMESTAMP(3) NOT NULL,
    "uploadedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommercialOrderAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommercialOrderActivity_orderId_createdAt_idx" ON "CommercialOrderActivity"("orderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommercialOrderActivity_tenantId_clientActivityId_key" ON "CommercialOrderActivity"("tenantId", "clientActivityId");

-- CreateIndex
CREATE INDEX "CommercialOrderAttachment_orderId_createdAt_idx" ON "CommercialOrderAttachment"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "CommercialOrderAttachment_activityId_idx" ON "CommercialOrderAttachment"("activityId");

-- CreateIndex
CREATE INDEX "CommercialOrderAttachment_status_uploadExpiresAt_idx" ON "CommercialOrderAttachment"("status", "uploadExpiresAt");

-- AddForeignKey
ALTER TABLE "CommercialOrderActivity" ADD CONSTRAINT "CommercialOrderActivity_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CommercialOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialOrderAttachment" ADD CONSTRAINT "CommercialOrderAttachment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CommercialOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialOrderAttachment" ADD CONSTRAINT "CommercialOrderAttachment_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "CommercialOrderActivity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
