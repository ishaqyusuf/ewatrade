-- AlterTable
ALTER TABLE "LifecycleMessage" ADD COLUMN     "payload" JSONB,
ADD COLUMN     "templateKey" TEXT;
