import { prisma } from "./config.ts";

/** Следующий внутренний порядковый номер договора */
export async function nextProcurementSerialNo() {
  const agg = await prisma.procurement.aggregate({ _max: { serialNo: true } });
  return (agg._max.serialNo ?? 0) + 1;
}
