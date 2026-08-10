/*
  Warnings:

  - A unique constraint covering the columns `[tenantId,providerEventId]` on the table `CommerceInquiry` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tenantId,providerEventId]` on the table `PrescriptionRequest` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tenantId,providerEventId]` on the table `ServiceRequest` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "ServiceCommerceIntakeChannelOrigin" AS ENUM ('WEB', 'STAFF', 'WHATSAPP');

-- AlterTable
ALTER TABLE "CommerceInquiry" ADD COLUMN     "consentVersion" TEXT,
ADD COLUMN     "contactOptIn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "providerEventId" TEXT,
ALTER COLUMN "createdByUserId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "PrescriptionRequest" ADD COLUMN     "contactOptIn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "providerEventId" TEXT;

-- AlterTable
ALTER TABLE "ServiceRequest" ADD COLUMN     "channelOrigin" "ServiceCommerceIntakeChannelOrigin" NOT NULL DEFAULT 'WEB',
ADD COLUMN     "consentVersion" TEXT,
ADD COLUMN     "contactOptIn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "createdByUserId" TEXT,
ADD COLUMN     "providerEventId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CommerceInquiry_tenantId_providerEventId_key" ON "CommerceInquiry"("tenantId", "providerEventId");

-- CreateIndex
CREATE UNIQUE INDEX "PrescriptionRequest_tenantId_providerEventId_key" ON "PrescriptionRequest"("tenantId", "providerEventId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceRequest_tenantId_providerEventId_key" ON "ServiceRequest"("tenantId", "providerEventId");
