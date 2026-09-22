-- Перечисления Prisma (обязательны до создания таблиц)
CREATE TYPE "UserSource" AS ENUM ('local', 'ad');
CREATE TYPE "LawType" AS ENUM ('fz44', 'fz223');
CREATE TYPE "ProcMethod" AS ENUM ('electronic_shop', 'auction');
CREATE TYPE "ProcStatus" AS ENUM ('draft', 'collecting_quotes', 'memo', 'approval', 'transferred', 'returned', 'published', 'bidding', 'contracted', 'execution', 'acceptance_window', 'completed', 'rejected');
CREATE TYPE "MemoAddressee" AS ENUM ('director', 'deputy_director');

CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Department_code_key" ON "Department"("code");

CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "passwordHash" TEXT,
    "email" TEXT,
    "fullName" TEXT NOT NULL,
    "position" TEXT,
    "phone" TEXT,
    "source" "UserSource" NOT NULL DEFAULT 'local',
    "adDn" TEXT,
    "departmentId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "notifyInApp" BOOLEAN NOT NULL DEFAULT true,
    "notifyEmail" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_login_key" ON "User"("login");
ALTER TABLE "User" ADD CONSTRAINT "User_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "UserPermission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "canRead" BOOLEAN NOT NULL DEFAULT false,
    "canWrite" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "UserPermission_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UserPermission_userId_resource_key" ON "UserPermission"("userId", "resource");
ALTER TABLE "UserPermission" ADD CONSTRAINT "UserPermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "Procurement" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "law" "LawType" NOT NULL,
    "method" "ProcMethod" NOT NULL,
    "status" "ProcStatus" NOT NULL DEFAULT 'draft',
    "departmentId" TEXT NOT NULL,
    "initiatorId" TEXT NOT NULL,
    "description" TEXT,
    "estimatedAmount" DECIMAL(14,2),
    "contractNumber" TEXT,
    "contractDate" TIMESTAMP(3),
    "contractAmount" DECIMAL(14,2),
    "deliveryUntil" TIMESTAMP(3),
    "acceptanceStartAt" TIMESTAMP(3),
    "acceptanceDueAt" TIMESTAMP(3),
    "contractDeptNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Procurement_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "Procurement" ADD CONSTRAINT "Procurement_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON UPDATE CASCADE;
ALTER TABLE "Procurement" ADD CONSTRAINT "Procurement_initiatorId_fkey" FOREIGN KEY ("initiatorId") REFERENCES "User"("id") ON UPDATE CASCADE;

CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "procurementId" TEXT NOT NULL,
    "supplierName" TEXT NOT NULL,
    "amount" DECIMAL(14,2),
    "validUntil" TIMESTAMP(3),
    "comment" TEXT,
    "fileName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_procurementId_fkey" FOREIGN KEY ("procurementId") REFERENCES "Procurement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON UPDATE CASCADE;

CREATE TABLE "ServiceMemo" (
    "id" TEXT NOT NULL,
    "procurementId" TEXT NOT NULL,
    "addressee" "MemoAddressee" NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "agreedUserId" TEXT,
    "agreedPosition" TEXT NOT NULL,
    "agreedFullName" TEXT NOT NULL,
    "compiledById" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServiceMemo_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "ServiceMemo" ADD CONSTRAINT "ServiceMemo_procurementId_fkey" FOREIGN KEY ("procurementId") REFERENCES "Procurement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceMemo" ADD CONSTRAINT "ServiceMemo_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON UPDATE CASCADE;
ALTER TABLE "ServiceMemo" ADD CONSTRAINT "ServiceMemo_agreedUserId_fkey" FOREIGN KEY ("agreedUserId") REFERENCES "User"("id") ON UPDATE CASCADE;
ALTER TABLE "ServiceMemo" ADD CONSTRAINT "ServiceMemo_compiledById_fkey" FOREIGN KEY ("compiledById") REFERENCES "User"("id") ON UPDATE CASCADE;

CREATE TABLE "ProcDocument" (
    "id" TEXT NOT NULL,
    "procurementId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "present" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    CONSTRAINT "ProcDocument_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "ProcDocument" ADD CONSTRAINT "ProcDocument_procurementId_fkey" FOREIGN KEY ("procurementId") REFERENCES "Procurement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "StatusLog" (
    "id" TEXT NOT NULL,
    "procurementId" TEXT NOT NULL,
    "fromStatus" "ProcStatus",
    "toStatus" "ProcStatus" NOT NULL,
    "userId" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StatusLog_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "StatusLog" ADD CONSTRAINT "StatusLog_procurementId_fkey" FOREIGN KEY ("procurementId") REFERENCES "Procurement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StatusLog" ADD CONSTRAINT "StatusLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON UPDATE CASCADE;

CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'info',
    "readAt" TIMESTAMP(3),
    "emailSent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
