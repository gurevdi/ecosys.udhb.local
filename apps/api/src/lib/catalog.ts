/** Ресурсы для назначения прав администратором */
export const RESOURCES = ["contracts", "users", "directory", "settings"] as const;
export type Resource = (typeof RESOURCES)[number];

/**
 * Комплекты документов по способу закупки.
 * Закон (44/223-ФЗ) пока не учитываем — вернём позже при необходимости.
 */
export const DOCUMENT_PACKAGES: Record<string, { code: string; title: string }[]> = {
  electronic_shop: [
    { code: "justification", title: "Обоснование закупки" },
    { code: "kp", title: "Коммерческие предложения" },
    { code: "spec", title: "Спецификация / описание объекта" },
    { code: "memo", title: "Служебная записка" },
  ],
  auction: [
    { code: "tz", title: "Техническое задание" },
    { code: "nmck", title: "Обоснование НМЦК" },
    { code: "calc", title: "Расчёт НМЦК / КП для расчёта" },
    { code: "spec", title: "Описание объекта закупки" },
    { code: "memo", title: "Служебная записка" },
  ],
};

/** Ключ пакета документов — только способ закупки */
export function packageKey(method: string) {
  return method;
}

/** Человекочитаемые подписи статусов закупки */
export const STATUS_LABELS: Record<string, string> = {
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

/** Типы договоров */
export const CATEGORY_LABELS: Record<string, string> = {
  service: "Услуга",
  supply: "Поставка",
  telecom: "Связь",
};

/** Статусы, которые выставляет договорной отдел (внешняя структура) */
export const CONTRACT_DEPT_STATUSES = [
  "transferred",
  "returned",
  "published",
  "bidding",
  "contracted",
  "rejected",
] as const;
