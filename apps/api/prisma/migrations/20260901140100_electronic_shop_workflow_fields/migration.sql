-- Поля и данные workflow электронного магазина
ALTER TABLE "Procurement" ADD COLUMN IF NOT EXISTS "publishedAt" TIMESTAMP(3);
ALTER TABLE "Procurement" ADD COLUMN IF NOT EXISTS "biddingStartAt" TIMESTAMP(3);
ALTER TABLE "Procurement" ADD COLUMN IF NOT EXISTS "biddingEndAt" TIMESTAMP(3);
ALTER TABLE "Procurement" ADD COLUMN IF NOT EXISTS "supervisorApprovedAt" TIMESTAMP(3);
ALTER TABLE "Procurement" ADD COLUMN IF NOT EXISTS "supervisorApprovedById" TEXT;
ALTER TABLE "Procurement" ADD COLUMN IF NOT EXISTS "directorApprovedAt" TIMESTAMP(3);
ALTER TABLE "Procurement" ADD COLUMN IF NOT EXISTS "directorApprovedById" TEXT;
ALTER TABLE "Procurement" ADD COLUMN IF NOT EXISTS "selectedQuoteId" TEXT;
ALTER TABLE "Procurement" ADD COLUMN IF NOT EXISTS "contractFileName" TEXT;
ALTER TABLE "Procurement" ADD COLUMN IF NOT EXISTS "contractStoredName" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Procurement_selectedQuoteId_key" ON "Procurement"("selectedQuoteId");

DO $$ BEGIN
  ALTER TABLE "Procurement" ADD CONSTRAINT "Procurement_supervisorApprovedById_fkey"
    FOREIGN KEY ("supervisorApprovedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Procurement" ADD CONSTRAINT "Procurement_directorApprovedById_fkey"
    FOREIGN KEY ("directorApprovedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Procurement" ADD CONSTRAINT "Procurement_selectedQuoteId_fkey"
    FOREIGN KEY ("selectedQuoteId") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

UPDATE "Procurement"
SET status = 'supervisor_approval'
WHERE status = 'approval' AND method = 'electronic_shop';
