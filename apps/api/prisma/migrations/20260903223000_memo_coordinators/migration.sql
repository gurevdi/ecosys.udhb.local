-- CreateTable
CREATE TABLE "ContractMemoCoordinator" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractMemoCoordinator_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "ServiceMemo" ADD COLUMN "agreedShortName" TEXT;
ALTER TABLE "ServiceMemo" ADD COLUMN "agreedCatalogId" TEXT;
ALTER TABLE "ServiceMemo" ALTER COLUMN "agreedPosition" SET DEFAULT '';
ALTER TABLE "ServiceMemo" ALTER COLUMN "agreedFullName" SET DEFAULT '';

-- CreateIndex
CREATE INDEX "ServiceMemo_agreedCatalogId_idx" ON "ServiceMemo"("agreedCatalogId");

-- AddForeignKey
ALTER TABLE "ServiceMemo" ADD CONSTRAINT "ServiceMemo_agreedCatalogId_fkey" FOREIGN KEY ("agreedCatalogId") REFERENCES "ContractMemoCoordinator"("id") ON DELETE SET NULL ON UPDATE CASCADE;
