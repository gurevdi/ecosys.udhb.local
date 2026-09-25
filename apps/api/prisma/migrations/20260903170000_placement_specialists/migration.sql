-- CreateTable
CREATE TABLE "ContractTradingSpecialist" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractTradingSpecialist_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Procurement" ADD COLUMN "marketplace" TEXT;
ALTER TABLE "Procurement" ADD COLUMN "tradingSpecialistId" TEXT;
ALTER TABLE "Procurement" ADD COLUMN "tradingSpecialistName" TEXT;
ALTER TABLE "Procurement" ADD COLUMN "tradingSpecialistPhone" TEXT;
ALTER TABLE "Procurement" ADD COLUMN "tradingSpecialistEmail" TEXT;

-- Migrate legacy platform text from contractDeptNote
UPDATE "Procurement"
SET "marketplace" = "contractDeptNote"
WHERE "contractDeptNote" IS NOT NULL AND TRIM("contractDeptNote") <> '' AND ("marketplace" IS NULL OR TRIM("marketplace") = '');

-- CreateIndex
CREATE INDEX "Procurement_tradingSpecialistId_idx" ON "Procurement"("tradingSpecialistId");

-- AddForeignKey
ALTER TABLE "Procurement" ADD CONSTRAINT "Procurement_tradingSpecialistId_fkey" FOREIGN KEY ("tradingSpecialistId") REFERENCES "ContractTradingSpecialist"("id") ON DELETE SET NULL ON UPDATE CASCADE;
