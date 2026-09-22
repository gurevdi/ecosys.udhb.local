/**
 * Утилиты режима отладки на клиенте.
 * Включение: VITE_DEBUG=1 при сборке или import.meta.env.DEV.
 */

/** Признак debug-режима (Vite dev или явный флаг) */
export const isDebug =
  import.meta.env.DEV ||
  import.meta.env.VITE_DEBUG === "1" ||
  import.meta.env.VITE_DEBUG === "true";

const PREFIX = "[ecosys:web:debug]";

/** Лог отладки в консоль браузера */
export function debugLog(scope: string, message: string, data?: unknown) {
  if (!isDebug) return;
  if (data !== undefined) {
    console.log(`${PREFIX} [${scope}] ${message}`, data);
  } else {
    console.log(`${PREFIX} [${scope}] ${message}`);
  }
}

/** Лог ошибки с деталями в debug */
export function debugError(scope: string, message: string, err: unknown) {
  if (!isDebug) {
    console.error(`${PREFIX} [${scope}] ${message}`);
    return;
  }
  console.error(`${PREFIX} [${scope}] ${message}`, err);
}

/**
 * Проверка условия; в debug выводит предупреждение, не прерывает выполнение.
 */
export function debugCheck(scope: string, condition: unknown, message: string) {
  if (condition || !isDebug) return;
  console.warn(`${PREFIX} [${scope}] проверка не пройдена: ${message}`);
}

/** Извлекает понятное сообщение об ошибке для пользователя */
export function userError(err: unknown, fallback = "Произошла ошибка") {
  if (err instanceof Error && err.message && err.message !== "unauthorized") {
    return err.message;
  }
  return fallback;
}

/** Расширенное сообщение для debug-панели */
export function debugErrorDetail(err: unknown): string | null {
  if (!isDebug) return null;
  if (err instanceof Error) return err.stack || err.message;
  return String(err);
}
