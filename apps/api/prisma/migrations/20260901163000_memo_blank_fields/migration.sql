ALTER TABLE "ServiceMemo" ADD COLUMN "addresseeOrgLine" TEXT;
ALTER TABLE "ServiceMemo" ADD COLUMN "senderDepartment" TEXT;
ALTER TABLE "ServiceMemo" ADD COLUMN "outNumber" TEXT;
ALTER TABLE "ServiceMemo" ADD COLUMN "outDate" TIMESTAMP(3);
ALTER TABLE "ServiceMemo" ADD COLUMN "inNumber" TEXT;
ALTER TABLE "ServiceMemo" ADD COLUMN "inDate" TIMESTAMP(3);
ALTER TABLE "ServiceMemo" ADD COLUMN "fromPosition" TEXT;
ALTER TABLE "ServiceMemo" ADD COLUMN "fromShortName" TEXT;
