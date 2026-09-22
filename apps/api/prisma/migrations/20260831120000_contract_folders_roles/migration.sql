-- CreateEnum
CREATE TYPE "ContractSubsystemRole" AS ENUM ('admin', 'moderator', 'operator', 'auditor');

-- CreateTable
CREATE TABLE "ContractFolder" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "year" INTEGER,
    "departmentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserContractRole" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ContractSubsystemRole" NOT NULL,
    "departmentId" TEXT,
    "scopeKey" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "UserContractRole_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Procurement" ADD COLUMN "folderId" TEXT;
ALTER TABLE "Procurement" ADD COLUMN "budgetYear" INTEGER;

-- CreateIndex
CREATE INDEX "ContractFolder_parentId_sortOrder_idx" ON "ContractFolder"("parentId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "UserContractRole_userId_role_scopeKey_key" ON "UserContractRole"("userId", "role", "scopeKey");

-- AddForeignKey
ALTER TABLE "ContractFolder" ADD CONSTRAINT "ContractFolder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ContractFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractFolder" ADD CONSTRAINT "ContractFolder_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserContractRole" ADD CONSTRAINT "UserContractRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserContractRole" ADD CONSTRAINT "UserContractRole_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Procurement" ADD CONSTRAINT "Procurement_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "ContractFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
