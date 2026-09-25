-- AlterTable
ALTER TABLE "Procurement" ADD COLUMN "acceptanceCadence" TEXT NOT NULL DEFAULT 'once';
ALTER TABLE "Procurement" ADD COLUMN "acceptanceRemindDays" INTEGER NOT NULL DEFAULT 8;

-- CreateTable
CREATE TABLE "ProcAcceptancePeriod" (
    "id" TEXT NOT NULL,
    "procurementId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "remindAt" TIMESTAMP(3) NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "dueAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "notifiedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcAcceptancePeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProcAcceptancePeriod_remindAt_confirmedAt_idx" ON "ProcAcceptancePeriod"("remindAt", "confirmedAt");

-- CreateIndex
CREATE INDEX "ProcAcceptancePeriod_procurementId_startAt_idx" ON "ProcAcceptancePeriod"("procurementId", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProcAcceptancePeriod_procurementId_year_month_key" ON "ProcAcceptancePeriod"("procurementId", "year", "month");

-- AddForeignKey
ALTER TABLE "ProcAcceptancePeriod" ADD CONSTRAINT "ProcAcceptancePeriod_procurementId_fkey" FOREIGN KEY ("procurementId") REFERENCES "Procurement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
