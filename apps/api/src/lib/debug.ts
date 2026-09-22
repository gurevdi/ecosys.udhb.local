/**
 * Утилиты режима отладки (DEBUG=1 или NODE_ENV=development).
 * В debug-режиме логируем подробности и возвращаем расширенные сообщения об ошибках.
 */

/** Признак включённого режима отладки */
export const isDebug =
  process.env.DEBUG === "1" ||
  process.env.DEBUG === "true" ||
  process.env.NODE_ENV === "development";

/** Префикс для сообщений отладки в консоли */
const PREFIX = "[ecosys:debug]";

/**
 * Логирует отладочное сообщение, если DEBUG включён.
 */
export function debugLog(scope: string, message: string, data?: unknown) {
  if (!isDebug) return;
  if (data !== undefined) {
    console.log(`${PREFIX} [${scope}] ${message}`, data);
  } else {
    console.log(`${PREFIX} [${scope}] ${message}`);
  }
}

/**
 * Логирует ошибку. В debug-режиме — с полным стеком.
 */
export function debugError(scope: string, message: string, err: unknown) {
  if (isDebug) {
    console.error(`${PREFIX} [${scope}] ${message}`, err);
    return;
  }
  const text = err instanceof Error ? err.message : String(err);
  console.error(`${PREFIX} [${scope}] ${message}: ${text}`);
}

/**
 * Проверка обязательного условия. В debug бросает исключение, иначе — fallback.
 */
export function debugAssert(
  condition: unknown,
  message: string,
  fallback?: () => never
): asserts condition {
  if (condition) return;
  debugError("assert", message, new Error(message));
  if (fallback) fallback();
  throw new Error(message);
}

/**
 * Безопасное выполнение async-операции с логированием в debug.
 */
export async function debugTry<T>(
  scope: string,
  action: string,
  fn: () => Promise<T>
): Promise<T> {
  debugLog(scope, `начало: ${action}`);
  try {
    const result = await fn();
    debugLog(scope, `успех: ${action}`);
    return result;
  } catch (err) {
    debugError(scope, `ошибка: ${action}`, err);
    throw err;
  }
}

/**
 * Формирует тело ответа об ошибке: в debug добавляет detail и stack.
 */
export function debugErrorPayload(err: unknown, publicMessage: string) {
  const base: { error: string; detail?: string; stack?: string } = {
    error: publicMessage,
  };
  if (!isDebug) return base;
  if (err instanceof Error) {
    base.detail = err.message;
    base.stack = err.stack;
  } else {
    base.detail = String(err);
  }
  return base;
}

/**
 * Проверяет обязательные переменные окружения при старте (только в debug).
 */
export function debugCheckEnv(required: Record<string, string | undefined>) {
  if (!isDebug) return;
  for (const [key, value] of Object.entries(required)) {
    if (!value || value === "change-me") {
      debugError("env", `переменная ${key} не задана или имеет значение по умолчанию`, new Error(key));
    }
  }
}
