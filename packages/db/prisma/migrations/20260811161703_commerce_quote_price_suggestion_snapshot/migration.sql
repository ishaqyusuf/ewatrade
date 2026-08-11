-- AlterTable
ALTER TABLE "CommerceQuoteLine" ADD COLUMN     "catalogPriceOverride" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "catalogPriceSuggestionEffectiveAt" TIMESTAMP(3),
ADD COLUMN     "catalogPriceSuggestionScope" TEXT,
ADD COLUMN     "catalogPriceSuggestionSource" TEXT,
ADD COLUMN     "catalogSuggestedUnitPriceMinor" INTEGER;
