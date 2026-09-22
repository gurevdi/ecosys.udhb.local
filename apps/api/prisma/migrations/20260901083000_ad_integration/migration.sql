-- Active Directory: профиль пользователя и маппинг групп
ALTER TABLE "User" ADD COLUMN "adGroups" JSONB;
ALTER TABLE "User" ADD COLUMN "adSyncedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "adAccountDisabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "AdGroupMapping" (
    "id" TEXT NOT NULL,
    "adGroup" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "permissions" JSONB NOT NULL DEFAULT '[]',
    "contractRoles" JSONB NOT NULL DEFAULT '[]',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdGroupMapping_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdGroupMapping_adGroup_key" ON "AdGroupMapping"("adGroup");
