import { debugCheck, debugError, debugLog, userError, debugErrorDetail } from "./debug";

/**
 * HTTP-клиент к API экосистемы.
 * В debug логирует запросы и детали ошибок.
 */
export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  debugLog("api", `${init.method || "GET"} ${path}`);

  let res: Response;
  try {
    res = await fetch(path, { ...init, headers, credentials: "include" });
  } catch (err) {
    debugError("api", `сеть недоступна: ${path}`, err);
    throw new Error("Сервер недоступен. Проверьте подключение.");
  }

  if (res.status === 401) {
    if (!path.startsWith("/api/auth/login")) {
      const err = new Error("unauthorized") as Error & { status: number };
      err.status = 401;
      throw err;
    }
  }

  const text = await res.text();
  let data: { error?: string; detail?: string } | null = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch (err) {
      debugError("api", `некорректный JSON от ${path}`, err);
      throw new Error("Некорректный ответ сервера");
    }
  }

  if (!res.ok) {
    debugCheck("api", data?.error, `ошибка ${res.status} без текста error`);
    const message = data?.error || "Ошибка запроса";
    const err = new Error(message) as Error & { status: number; detail?: string; fields?: string[] };
    err.status = res.status;
    if (data?.detail) err.detail = data.detail;
    if (Array.isArray((data as { fields?: string[] }).fields)) err.fields = (data as { fields: string[] }).fields;
    debugError("api", `${res.status} ${path}`, err);
    throw err;
  }

  return data as T;
}

/** Подписи статусов закупки */
export const STATUS: Record<string, string> = {
  draft: "Черновик",
  collecting_quotes: "Сбор КП",
  memo: "Служебная записка",
  approval: "На согласовании",
  supervisor_approval: "Согласование руководителя",
  director_approval: "Согласование директора",
  transferred: "Передано в договорной",
  returned: "Возврат пакета",
  published: "Размещено",
  bidding: "Торги",
  contracted: "Контракт",
  execution: "Исполнение",
  acceptance_window: "Окно приёмки",
  completed: "Завершено",
  rejected: "Отклонено",
};

export const METHOD: Record<string, string> = {
  electronic_shop: "Электронный магазин",
  auction: "Аукцион / торги",
};

/** Типы договоров */
export const CATEGORY: Record<string, string> = {
  service: "Услуга",
  supply: "Поставка",
  telecom: "Связь",
};

export const CATEGORY_IDS = ["service", "supply", "telecom"] as const;

export const ADDRESSEE: Record<string, string> = {
  director: "Директору",
  deputy_director: "Заместителю директора",
};

export const RESOURCES = [
  { id: "contracts", name: "Договорная деятельность" },
  { id: "users", name: "Пользователи" },
  { id: "directory", name: "Каталог AD" },
  { id: "settings", name: "Настройки" },
] as const;

/** Роли подсистемы «Договоры» */
export const CONTRACT_ROLES = [
  { id: "admin", name: "Администратор подсистемы «Договоры»" },
  { id: "moderator", name: "Модератор подсистемы «Договоры»" },
  { id: "operator", name: "Оператор подсистемы «Договоры»" },
  { id: "auditor", name: "Аудитор подсистемы «Договоры»" },
] as const;

export type ContractRoleId = (typeof CONTRACT_ROLES)[number]["id"];

export type ContractRoleEntry = { role: string; departmentId: string | null };

function inContractScope(roleDeptId: string | null, targetDeptId?: string | null) {
  if (!roleDeptId) return true;
  if (!targetDeptId) return true;
  return roleDeptId === targetDeptId;
}

type ContractUser = {
  isAdmin: boolean;
  permissions?: { resource: string; canRead: boolean; canWrite: boolean }[];
  contractRoles?: ContractRoleEntry[];
};

function hasGlobalContracts(user: ContractUser, write = false) {
  if (user.isAdmin) return true;
  return (user.permissions || []).some(
    (p) => p.resource === "contracts" && (write ? p.canWrite : p.canRead || p.canWrite)
  );
}

/** Просмотр подсистемы «Договоры» */
export function canReadContracts(user: ContractUser, departmentId?: string | null) {
  if (user.isAdmin) return true;
  if (hasGlobalContracts(user)) return true;
  return (user.contractRoles || []).some(
    (r) => CONTRACT_ROLES.some((cr) => cr.id === r.role) && inContractScope(r.departmentId, departmentId)
  );
}

/** Создание и изменение карточек */
export function canWriteContracts(user: ContractUser, departmentId?: string | null) {
  if (user.isAdmin) return true;
  if (hasGlobalContracts(user, true)) return true;
  return (user.contractRoles || []).some(
    (r) =>
      (r.role === "admin" || r.role === "moderator" || r.role === "operator") &&
      inContractScope(r.departmentId, departmentId)
  );
}

/** Удаление договоров — модератор или администратор подсистемы «Договоры» */
export function canDeleteContracts(user: ContractUser, departmentId?: string | null) {
  if (user.isAdmin) return true;
  return (user.contractRoles || []).some(
    (r) => (r.role === "admin" || r.role === "moderator") && inContractScope(r.departmentId, departmentId)
  );
}

/** Управление папками договоров */
export function canManageFolders(user: ContractUser) {
  if (user.isAdmin) return true;
  return (user.contractRoles || []).some((r) => r.role === "admin" || r.role === "moderator");
}

/** Назначение ролей подсистемы «Договоры» */
export function canManageContractRoles(user: ContractUser) {
  if (user.isAdmin) return true;
  return (user.contractRoles || []).some((r) => r.role === "admin");
}

export type ContractAccess = {
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
  canManageFolders: boolean;
  canManageRoles: boolean;
  roles: ContractRoleEntry[];
  scopedDepartments: string[] | null;
};

/** Подпись роли по id */
export function contractRoleLabel(roleId: string) {
  return CONTRACT_ROLES.find((r) => r.id === roleId)?.name || roleId;
}

/** Форматирование суммы в рублях */
export function money(v: string | number | null | undefined) {
  if (v === null || v === undefined || v === "") return "—";
  return Number(v).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ₽";
}

/** Подпись: внутренний № и дата создания */
export function procIdentity(serialNo: number, createdAt: string | null | undefined) {
  return `№${serialNo} · ${day(createdAt)}`;
}

/** Форматирование даты */
export function day(v: string | null | undefined) {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("ru-RU");
}

/** Сообщение об ошибке для UI + опционально debug-detail */
export function formatApiError(err: unknown) {
  return {
    message: userError(err),
    detail: debugErrorDetail(err),
  };
}
