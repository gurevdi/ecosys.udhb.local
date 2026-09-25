-- AlterEnum
ALTER TYPE "ProcStatus" ADD VALUE 'coordinator_approval';

-- AlterTable
ALTER TABLE "Procurement" ADD COLUMN "coordinatorApprovedAt" TIMESTAMP(3),
ADD COLUMN "coordinatorApprovedById" TEXT;

-- AddForeignKey
ALTER TABLE "Procurement" ADD CONSTRAINT "Procurement_coordinatorApprovedById_fkey"
  FOREIGN KEY ("coordinatorApprovedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
