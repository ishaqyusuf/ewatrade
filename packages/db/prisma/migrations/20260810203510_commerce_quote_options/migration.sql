-- AlterTable
ALTER TABLE "CommerceQuoteLine" ADD COLUMN     "quoteOptionId" TEXT;

-- CreateTable
CREATE TABLE "CommerceQuoteOption" (
    "id" TEXT NOT NULL,
    "quoteVersionId" TEXT NOT NULL,
    "clientOptionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "availabilityOutcome" "CommerceQuoteAvailabilityOutcome" NOT NULL,
    "fulfilmentType" "CommerceQuoteFulfilmentType" NOT NULL DEFAULT 'UNSPECIFIED',
    "currencyCode" TEXT NOT NULL,
    "subtotalMinor" INTEGER NOT NULL,
    "discountMinor" INTEGER NOT NULL DEFAULT 0,
    "taxMinor" INTEGER NOT NULL DEFAULT 0,
    "fulfilmentFeeMinor" INTEGER NOT NULL DEFAULT 0,
    "totalMinor" INTEGER NOT NULL,
    "customerNote" TEXT,
    "fulfilmentPromise" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommerceQuoteOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommerceQuoteOptionSelection" (
    "quoteVersionId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "clientSelectionId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "selectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommerceQuoteOptionSelection_pkey" PRIMARY KEY ("quoteVersionId")
);

-- CreateIndex
CREATE INDEX "CommerceQuoteOption_quoteVersionId_totalMinor_idx" ON "CommerceQuoteOption"("quoteVersionId", "totalMinor");

-- CreateIndex
CREATE UNIQUE INDEX "CommerceQuoteOption_quoteVersionId_clientOptionId_key" ON "CommerceQuoteOption"("quoteVersionId", "clientOptionId");

-- CreateIndex
CREATE UNIQUE INDEX "CommerceQuoteOption_quoteVersionId_position_key" ON "CommerceQuoteOption"("quoteVersionId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "CommerceQuoteOptionSelection_optionId_key" ON "CommerceQuoteOptionSelection"("optionId");

-- CreateIndex
CREATE INDEX "CommerceQuoteOptionSelection_selectedAt_idx" ON "CommerceQuoteOptionSelection"("selectedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommerceQuoteOptionSelection_quoteVersionId_clientSelection_key" ON "CommerceQuoteOptionSelection"("quoteVersionId", "clientSelectionId");

-- CreateIndex
CREATE INDEX "CommerceQuoteLine_quoteOptionId_idx" ON "CommerceQuoteLine"("quoteOptionId");

-- AddForeignKey
ALTER TABLE "CommerceQuoteOption" ADD CONSTRAINT "CommerceQuoteOption_quoteVersionId_fkey" FOREIGN KEY ("quoteVersionId") REFERENCES "CommerceQuoteVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommerceQuoteOptionSelection" ADD CONSTRAINT "CommerceQuoteOptionSelection_quoteVersionId_fkey" FOREIGN KEY ("quoteVersionId") REFERENCES "CommerceQuoteVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommerceQuoteOptionSelection" ADD CONSTRAINT "CommerceQuoteOptionSelection_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "CommerceQuoteOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommerceQuoteLine" ADD CONSTRAINT "CommerceQuoteLine_quoteOptionId_fkey" FOREIGN KEY ("quoteOptionId") REFERENCES "CommerceQuoteOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;
