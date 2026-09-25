-- AlterTable
ALTER TABLE "Procurement" ADD COLUMN "claimOpenedAt" TIMESTAMP(3),
ADD COLUMN "claimClosedAt" TIMESTAMP(3),
ADD COLUMN "claimClosedNote" TEXT;
