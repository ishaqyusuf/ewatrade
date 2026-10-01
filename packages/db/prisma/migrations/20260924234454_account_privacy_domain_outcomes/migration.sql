-- CreateEnum
CREATE TYPE "AccountPrivacyDomain" AS ENUM ('IDENTITY_ACCESS', 'MEMBERSHIP', 'CONVERSATIONS', 'PRESCRIPTIONS', 'COMMERCIAL_RECORDS', 'SOFTWARE_SUBSCRIPTIONS', 'EXTERNAL_PROCESSORS', 'ACCOUNT_PROFILE', 'OUTCOME_NOTICE');

-- CreateEnum
CREATE TYPE "AccountPrivacyDisposition" AS ENUM ('ACCESS_REVOKED', 'ERASURE_CONFIRMED', 'ANONYMIZATION_CONFIRMED', 'RETENTION_APPROVED', 'NOT_APPLICABLE', 'NOTICE_DELIVERED');

-- CreateTable
CREATE TABLE "AccountPrivacyDomainOutcome" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "domain" "AccountPrivacyDomain" NOT NULL,
    "disposition" "AccountPrivacyDisposition" NOT NULL,
    "processor" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "evidenceDigest" TEXT NOT NULL,
    "nextReviewAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountPrivacyDomainOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountPrivacyDomainOutcome_userId_domain_idx" ON "AccountPrivacyDomainOutcome"("userId", "domain");

-- CreateIndex
CREATE UNIQUE INDEX "AccountPrivacyDomainOutcome_requestId_domain_key" ON "AccountPrivacyDomainOutcome"("requestId", "domain");

-- AddForeignKey
ALTER TABLE "AccountPrivacyDomainOutcome" ADD CONSTRAINT "AccountPrivacyDomainOutcome_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "AccountPrivacyRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
