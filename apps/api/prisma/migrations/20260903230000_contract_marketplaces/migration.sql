-- CreateTable
CREATE TABLE "ContractMarketplace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractMarketplace_pkey" PRIMARY KEY ("id")
);

-- Seed default marketplace
INSERT INTO "ContractMarketplace" ("id", "name", "sortOrder", "isActive", "isDefault", "createdAt", "updatedAt")
VALUES (
  'marketplace-rts-em',
  'РТС-Тендер Электронный магазин',
  0,
  true,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);
