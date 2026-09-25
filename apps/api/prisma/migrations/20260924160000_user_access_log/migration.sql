-- Журнал изменений доступа пользователей
CREATE TABLE "UserAccessLog" (
    "id" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserAccessLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UserAccessLog_targetId_createdAt_idx" ON "UserAccessLog"("targetId", "createdAt" DESC);

ALTER TABLE "UserAccessLog" ADD CONSTRAINT "UserAccessLog_targetId_fkey"
  FOREIGN KEY ("targetId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserAccessLog" ADD CONSTRAINT "UserAccessLog_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
