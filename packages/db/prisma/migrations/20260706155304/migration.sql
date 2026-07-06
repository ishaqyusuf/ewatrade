-- CreateEnum
CREATE TYPE "TenantMode" AS ENUM ('STORE', 'DISPATCH', 'MERCHANT');

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "enabledModes" "TenantMode"[];

-- AlterTable
ALTER TABLE "Verification" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "OnboardingSession" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "tenantId" TEXT,
    "userId" TEXT,
    "step" INTEGER NOT NULL DEFAULT 1,
    "formData" JSONB,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingSession_token_key" ON "OnboardingSession"("token");

-- CreateIndex
CREATE INDEX "OnboardingSession_token_idx" ON "OnboardingSession"("token");

-- CreateIndex
CREATE INDEX "OnboardingSession_tenantId_idx" ON "OnboardingSession"("tenantId");
