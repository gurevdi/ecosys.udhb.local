-- AlterTable
ALTER TABLE "Procurement" ADD COLUMN "contractEndDate" TIMESTAMP(3);
ALTER TABLE "Procurement" ADD COLUMN "deliveryDays" INTEGER;
ALTER TABLE "Procurement" ADD COLUMN "deliveryDeadlineKind" TEXT;
ALTER TABLE "Procurement" ADD COLUMN "prepaymentDate" TIMESTAMP(3);
ALTER TABLE "Procurement" ADD COLUMN "penaltyRateNum" INTEGER;
ALTER TABLE "Procurement" ADD COLUMN "penaltyRateDen" INTEGER;
ALTER TABLE "Procurement" ADD COLUMN "penaltyUsesKeyRate" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Procurement" ADD COLUMN "cbrKeyRate" DECIMAL(6,3);
ALTER TABLE "Procurement" ADD COLUMN "executedAmount" DECIMAL(14,2);
ALTER TABLE "Procurement" ADD COLUMN "contractParsedAt" TIMESTAMP(3);
ALTER TABLE "Procurement" ADD COLUMN "contractParseWarnings" TEXT;
