-- Справочник поставщиков, шапки СЗ, оплаты, поля контракта и архива

CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "inn" TEXT,
    "phone" TEXT,
    "comment" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Supplier_name_idx" ON "Supplier"("name");

ALTER TABLE "Quote" ADD COLUMN "supplierId" TEXT;

ALTER TABLE "Quote" ADD CONSTRAINT "Quote_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Procurement" ADD COLUMN "executorName" TEXT;
ALTER TABLE "Procurement" ADD COLUMN "executorUserId" TEXT;
ALTER TABLE "Procurement" ADD COLUMN "performanceDays" INTEGER;
-- acceptanceDays уже есть на проде (миграция 20260901182000_acceptance_days)
ALTER TABLE "Procurement" ADD COLUMN "actualDeliveryAt" TIMESTAMP(3);
ALTER TABLE "Procurement" ADD COLUMN "validUntil" TIMESTAMP(3);
ALTER TABLE "Procurement" ADD COLUMN "fromArchive" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Procurement" ADD CONSTRAINT "Procurement_executorUserId_fkey"
  FOREIGN KEY ("executorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ServiceMemo" ADD COLUMN "letterheadKind" TEXT NOT NULL DEFAULT 'department';

CREATE TABLE "MemoLetterhead" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemoLetterhead_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MemoLetterhead_departmentId_key" ON "MemoLetterhead"("departmentId");

ALTER TABLE "MemoLetterhead" ADD CONSTRAINT "MemoLetterhead_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ProcPayment" (
    "id" TEXT NOT NULL,
    "procurementId" TEXT NOT NULL,
    "amount" DECIMAL(14,2),
    "paidAt" TIMESTAMP(3),
    "addressee" TEXT NOT NULL,
    "memoText" TEXT,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcPayment_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ProcPayment" ADD CONSTRAINT "ProcPayment_procurementId_fkey"
  FOREIGN KEY ("procurementId") REFERENCES "Procurement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProcPayment" ADD CONSTRAINT "ProcPayment_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ProcPaymentFile" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcPaymentFile_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ProcPaymentFile" ADD CONSTRAINT "ProcPaymentFile_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "ProcPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
