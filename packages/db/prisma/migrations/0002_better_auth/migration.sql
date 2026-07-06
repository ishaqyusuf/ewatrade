-- Add Better Auth canonical user fields while keeping Ewatrade profile fields.
ALTER TABLE "User"
  ADD COLUMN "name" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "image" TEXT;

UPDATE "User"
SET
  "name" = COALESCE(
    NULLIF("displayName", ''),
    NULLIF(BTRIM(COALESCE("firstName", '') || ' ' || COALESCE("lastName", '')), ''),
    "email"
  ),
  "emailVerified" = "emailVerifiedAt" IS NOT NULL,
  "image" = COALESCE("image", "avatarUrl")
WHERE "name" = ''
   OR "emailVerifiedAt" IS NOT NULL
   OR "avatarUrl" IS NOT NULL;

-- Better Auth writes accountId/providerId/password. Backfill from the old
-- credentials columns, then keep those legacy columns nullable for transition.
ALTER TABLE "Account"
  ADD COLUMN "accountId" TEXT,
  ADD COLUMN "providerId" TEXT,
  ADD COLUMN "password" TEXT,
  ADD COLUMN "accessTokenExpiresAt" TIMESTAMP(3),
  ADD COLUMN "refreshTokenExpiresAt" TIMESTAMP(3);

UPDATE "Account"
SET
  "accountId" = COALESCE("accountId", "providerAccountId"),
  "providerId" = COALESCE(
    "providerId",
    CASE
      WHEN "provider" IN ('credential', 'credentials') THEN 'credential'
      ELSE "provider"
    END
  ),
  "password" = COALESCE("password", "passwordHash"),
  "accessTokenExpiresAt" = COALESCE("accessTokenExpiresAt", "expiresAt");

ALTER TABLE "Account"
  ALTER COLUMN "accountId" SET NOT NULL,
  ALTER COLUMN "providerId" SET NOT NULL,
  ALTER COLUMN "provider" DROP NOT NULL,
  ALTER COLUMN "providerAccountId" DROP NOT NULL;

CREATE UNIQUE INDEX "Account_providerId_accountId_key" ON "Account"("providerId", "accountId");

CREATE TABLE "Verification" (
  "id" TEXT NOT NULL,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);
