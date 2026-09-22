-- Реквизиты адресата СЗ (снимок из настроек подписантов)
ALTER TABLE "ServiceMemo" ADD COLUMN "addresseePosition" TEXT;
ALTER TABLE "ServiceMemo" ADD COLUMN "addresseeFullName" TEXT;
ALTER TABLE "ServiceMemo" ADD COLUMN "addresseeShortName" TEXT;
ALTER TABLE "ServiceMemo" ADD COLUMN "addresseeDative" TEXT;
