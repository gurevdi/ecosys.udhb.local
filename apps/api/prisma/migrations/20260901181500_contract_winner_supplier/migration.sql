-- Победитель торгов может не быть в списке КП
ALTER TABLE "Procurement" ADD COLUMN "contractSupplierName" TEXT;
ALTER TABLE "Procurement" ADD COLUMN "contractSupplierInn" TEXT;

UPDATE "Procurement" p
SET "contractSupplierName" = q."supplierName"
FROM "Quote" q
WHERE p."selectedQuoteId" = q."id" AND p."contractSupplierName" IS NULL;
