/*
  Warnings:

  - You are about to drop the `Page` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PageSection` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Template` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Theme` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[activeReleaseId]` on the table `Site` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "SiteDesignRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'VALIDATING', 'READY', 'FAILED', 'CANCELLED');

-- DropForeignKey
ALTER TABLE "Page" DROP CONSTRAINT "Page_siteId_fkey";

-- DropForeignKey
ALTER TABLE "Page" DROP CONSTRAINT "Page_storeId_fkey";

-- DropForeignKey
ALTER TABLE "PageSection" DROP CONSTRAINT "PageSection_pageId_fkey";

-- DropForeignKey
ALTER TABLE "Template" DROP CONSTRAINT "Template_storeId_fkey";

-- DropForeignKey
ALTER TABLE "Template" DROP CONSTRAINT "Template_themeId_fkey";

-- DropForeignKey
ALTER TABLE "Theme" DROP CONSTRAINT "Theme_storeId_fkey";

-- AlterTable
ALTER TABLE "Site" ADD COLUMN     "activeReleaseId" TEXT,
ADD COLUMN     "draftComposition" JSONB,
ADD COLUMN     "draftRevision" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "draftUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "draftUpdatedById" TEXT;

-- DropTable
DROP TABLE "Page";

-- DropTable
DROP TABLE "PageSection";

-- DropTable
DROP TABLE "Template";

-- DropTable
DROP TABLE "Theme";

-- DropEnum
DROP TYPE "PageStatus";

-- CreateTable
CREATE TABLE "SiteDesignRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "baseDraftRevision" INTEGER NOT NULL,
    "brief" JSONB NOT NULL,
    "manifests" JSONB NOT NULL,
    "configuration" JSONB NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "status" "SiteDesignRunStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "providerStartedAt" TIMESTAMP(3),
    "budgetScopeKey" TEXT NOT NULL,
    "reservedTokens" INTEGER NOT NULL,
    "actualTokens" INTEGER,
    "usageSettledAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "output" JSONB,
    "outputHash" TEXT,
    "errorCode" TEXT,
    "acceptedDirectionId" TEXT,
    "acceptedById" TEXT,
    "acceptedDraftRevision" INTEGER,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "SiteDesignRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteRelease" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "draftRevision" INTEGER NOT NULL,
    "contentHash" TEXT NOT NULL,
    "templateKey" TEXT NOT NULL,
    "templateVersion" TEXT NOT NULL,
    "runtimeVersion" INTEGER NOT NULL,
    "composition" JSONB NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "baseReleaseId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteRelease_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SiteDesignRun_status_leaseUntil_createdAt_idx" ON "SiteDesignRun"("status", "leaseUntil", "createdAt");

-- CreateIndex
CREATE INDEX "SiteDesignRun_tenantId_storeId_siteId_createdAt_idx" ON "SiteDesignRun"("tenantId", "storeId", "siteId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SiteDesignRun_siteId_actorUserId_clientRequestId_key" ON "SiteDesignRun"("siteId", "actorUserId", "clientRequestId");

-- CreateIndex
CREATE INDEX "SiteRelease_siteId_createdAt_idx" ON "SiteRelease"("siteId", "createdAt");

-- CreateIndex
CREATE INDEX "SiteRelease_tenantId_storeId_idx" ON "SiteRelease"("tenantId", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "SiteRelease_siteId_idempotencyKey_key" ON "SiteRelease"("siteId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Site_activeReleaseId_key" ON "Site"("activeReleaseId");

-- AddForeignKey
ALTER TABLE "SiteDesignRun" ADD CONSTRAINT "SiteDesignRun_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Site" ADD CONSTRAINT "Site_activeReleaseId_fkey" FOREIGN KEY ("activeReleaseId") REFERENCES "SiteRelease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteRelease" ADD CONSTRAINT "SiteRelease_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
