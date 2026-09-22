-- Новые значения enum (отдельная транзакция — без UPDATE в этом файле)
ALTER TYPE "ProcStatus" ADD VALUE IF NOT EXISTS 'supervisor_approval';
ALTER TYPE "ProcStatus" ADD VALUE IF NOT EXISTS 'director_approval';
