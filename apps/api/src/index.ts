import fs from "fs";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { config, prisma } from "./lib/config.ts";
import { registerRoutes } from "./routes.ts";
import { remindAcceptance } from "./lib/notify.ts";
import { debugError, debugLog, debugErrorPayload, isDebug } from "./lib/debug.ts";

// Каталог загрузки КП и документов
fs.mkdirSync(config.uploadDir, { recursive: true });

const app = Fastify({
  logger: true,
  // В debug включаем подробный вывод ошибок Fastify
  ...(isDebug ? { disableRequestLogging: false } : {}),
});

await app.register(cookie);
await app.register(cors, { origin: true, credentials: true });
await app.register(multipart, { limits: { fileSize: 40 * 1024 * 1024 } });
await registerRoutes(app);

/**
 * Глобальный обработчик ошибок API.
 * Пользователю — короткое сообщение; в DEBUG — detail и stack.
 */
app.setErrorHandler((err, req, reply) => {
  debugError("api", `${req.method} ${req.url}`, err);
  const status = (err as { statusCode?: number }).statusCode || 400;
  const publicMessage = err.message || "Ошибка";
  reply.code(status).send(debugErrorPayload(err, publicMessage));
});

await app.listen({ port: config.port, host: "0.0.0.0" });
debugLog("startup", `API слушает порт ${config.port}, debug=${isDebug}`);

// Напоминания о сроках приёмки — каждые 15 минут
setInterval(() => {
  remindAcceptance().catch((e) => debugError("acceptance-cron", "напоминания", e));
}, 15 * 60 * 1000);
setTimeout(() => remindAcceptance().catch((e) => debugError("acceptance-cron", "первый запуск", e)), 8000);

/** Корректное завершение при остановке службы */
const shutdown = async () => {
  debugLog("shutdown", "остановка API");
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
