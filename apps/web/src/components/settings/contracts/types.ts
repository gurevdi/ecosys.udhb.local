export type Dept = { id: string; name: string };
export type Brief = { id: string; fullName: string; position: string | null; login?: string };

export type FolderNode = {
  id: string;
  name: string;
  year: number | null;
  departmentId: string | null;
  department: { id: string; name: string } | null;
  sortOrder: number;
  procurementCount: number;
  directProcurementCount?: number;
  childCount: number;
  children: FolderNode[];
};

export type ContractRoleRow = {
  id: string;
  role: string;
  departmentId: string | null;
  department: { id: string; name: string } | null;
  user: { id: string; fullName: string; login: string };
};

export type ContractsSection = "overview" | "folders" | "roles" | "display";

export const CONTRACTS_SECTIONS: { id: ContractsSection; label: string; icon: string }[] = [
  { id: "overview", label: "Обзор", icon: "◫" },
  { id: "folders", label: "Папки", icon: "▤" },
  { id: "roles", label: "Роли и доступ", icon: "◉" },
  { id: "display", label: "Отображение", icon: "☰" },
];

/** Матрица возможностей по ролям */
export const ROLE_MATRIX = [
  { key: "read", label: "Просмотр карточек", admin: true, moderator: true, operator: true, auditor: true },
  { key: "write", label: "Создание и изменение", admin: true, moderator: true, operator: true, auditor: false },
  { key: "delete", label: "Удаление карточек", admin: true, moderator: true, operator: false, auditor: false },
  { key: "folders", label: "Управление папками", admin: true, moderator: true, operator: false, auditor: false },
  { key: "roles", label: "Назначение ролей", admin: true, moderator: false, operator: false, auditor: false },
] as const;
