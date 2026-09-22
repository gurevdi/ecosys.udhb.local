-- CreateEnum
CREATE TYPE "ProcCategory" AS ENUM ('service', 'supply', 'telecom');

-- AlterTable
ALTER TABLE "Procurement" ADD COLUMN "category" "ProcCategory" NOT NULL DEFAULT 'service';
