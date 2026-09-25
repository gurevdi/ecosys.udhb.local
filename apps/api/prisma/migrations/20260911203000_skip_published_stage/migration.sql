-- Этап «Размещено» (published) исключён из маршрута:
-- заполнение даты публикации и окончания торгов на «Сведения о размещении»
-- сразу ведёт к этапу «Торги».
UPDATE "Procurement" SET "status" = 'bidding' WHERE "status" = 'published';
