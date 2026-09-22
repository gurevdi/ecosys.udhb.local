-- AlterTable
ALTER TABLE "Procurement" ADD COLUMN "serialNo" INTEGER;

-- Backfill internal sequential numbers by creation date
WITH numbered AS (
    SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt" ASC, "id" ASC) AS n
    FROM "Procurement"
)
UPDATE "Procurement" AS p
SET "serialNo" = numbered.n
FROM numbered
WHERE p."id" = numbered."id";

ALTER TABLE "Procurement" ALTER COLUMN "serialNo" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Procurement_serialNo_key" ON "Procurement"("serialNo");
