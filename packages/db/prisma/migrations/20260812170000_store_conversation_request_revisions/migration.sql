-- AlterTable
ALTER TABLE "CommerceInquiry" ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "ServiceRequest" ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 1;
