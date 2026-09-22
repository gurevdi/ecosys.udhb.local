-- CreateTable
CREATE TABLE "ProcChangeLog" (
    "id" TEXT NOT NULL,
    "procurementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcChangeLog_pkey" PRIMARY KEY ("id")
);

-- Migrate status history
INSERT INTO "ProcChangeLog" ("id", "procurementId", "userId", "section", "action", "summary", "details", "createdAt")
SELECT
    "id",
    "procurementId",
    "userId",
    'Статус',
    'update',
    CASE
        WHEN "fromStatus" IS NOT NULL THEN 'Статус: ' || "fromStatus"::text || ' → ' || "toStatus"::text
        ELSE 'Статус: ' || "toStatus"::text
    END,
    "comment",
    "createdAt"
FROM "StatusLog";

-- DropTable
DROP TABLE "StatusLog";

-- CreateIndex
CREATE INDEX "ProcChangeLog_procurementId_createdAt_idx" ON "ProcChangeLog"("procurementId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "ProcChangeLog" ADD CONSTRAINT "ProcChangeLog_procurementId_fkey" FOREIGN KEY ("procurementId") REFERENCES "Procurement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcChangeLog" ADD CONSTRAINT "ProcChangeLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
