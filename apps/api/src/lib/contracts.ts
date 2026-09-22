import type { FastifyReply, FastifyRequest } from "fastify";
import { can, requireUser, type SessionUser } from "./auth.ts";

export type ContractRole = "admin" | "moderator" | "operator" | "auditor";

export type ContractRoleEntry = { role: ContractRole; departmentId: string | null };

/** Подписи ролей подсистемы «Договоры» */
export const CONTRACT_ROLE_LABELS: Record<ContractRole, string> = {
  admin: "Администратор подсистемы «Договоры»",
  moderator: "Модератор подсистемы «Договоры»",
  operator: "Оператор подсистемы «Договоры»",
  auditor: "Аудитор подсистемы «Договоры»",
};

export const CONTRACT_ROLES = Object.keys(CONTRACT_ROLE_LABELS) as ContractRole[];

function inScope(roleDeptId: string | null, targetDeptId?: string | null) {
  if (!roleDeptId) return true;
  if (!targetDeptId) return true;
  return roleDeptId === targetDeptId;
}

/** Ограничение выборки закупок по отделам из ролей подсистемы «Договоры» */
export function contractDepartmentScope(user: SessionUser): { departmentId?: { in: string[] } } {
  if (user.isAdmin) return {};
  if (can(user, "contracts", false)) return {};

  let allDepartments = false;
  const deptIds = new Set<string>();
  for (const r of user.contractRoles) {
    if (!CONTRACT_ROLES.includes(r.role)) continue;
    if (!r.departmentId) {
      allDepartments = true;
      break;
    }
    deptIds.add(r.departmentId);
  }

  if (allDepartments) return {};
  if (deptIds.size === 0) return { departmentId: { in: [] } };
  return { departmentId: { in: [...deptIds] } };
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

/** Эффективные права текущего пользователя в подсистеме «Договоры» */
export function getContractAccess(user: SessionUser): ContractAccess {
  const scope = contractDepartmentScope(user);
  return {
    canRead: canReadContracts(user),
    canWrite: canWriteContracts(user),
    canDelete: canDeleteContracts(user),
    canManageFolders: canManageFolders(user),
    canManageRoles: canManageContractRoles(user),
    roles: user.contractRoles.filter((r) => CONTRACT_ROLES.includes(r.role)),
    scopedDepartments: scope.departmentId?.in ?? null,
  };
}

/** Чтение карточек договорной деятельности */
export function canReadContracts(user: SessionUser, departmentId?: string | null) {
  if (user.isAdmin) return true;
  if (can(user, "contracts", false)) return true;
  return user.contractRoles.some(
    (r) => CONTRACT_ROLES.includes(r.role) && inScope(r.departmentId, departmentId)
  );
}

/** Создание и изменение карточек */
export function canWriteContracts(user: SessionUser, departmentId?: string | null) {
  if (user.isAdmin) return true;
  if (can(user, "contracts", true)) return true;
  return user.contractRoles.some(
    (r) => (r.role === "admin" || r.role === "moderator" || r.role === "operator") && inScope(r.departmentId, departmentId)
  );
}

/** Удаление карточек — только администратор и модератор подсистемы «Договоры» */
export function canDeleteContracts(user: SessionUser, departmentId?: string | null) {
  if (user.isAdmin) return true;
  return user.contractRoles.some(
    (r) => (r.role === "admin" || r.role === "moderator") && inScope(r.departmentId, departmentId)
  );
}

/** Управление иерархией папок */
export function canManageFolders(user: SessionUser) {
  if (user.isAdmin) return true;
  return user.contractRoles.some((r) => r.role === "admin" || r.role === "moderator");
}

/** Назначение ролей подсистемы «Договоры» */
export function canManageContractRoles(user: SessionUser) {
  if (user.isAdmin) return true;
  return user.contractRoles.some((r) => r.role === "admin");
}

export async function requireContractRead(req: FastifyRequest, reply: FastifyReply, departmentId?: string | null) {
  const user = await requireUser(req, reply);
  if (!user) return null;
  if (!canReadContracts(user, departmentId)) {
    reply.code(403).send({ error: "Недостаточно прав для просмотра договоров" });
    return null;
  }
  return user;
}

export async function requireContractWrite(req: FastifyRequest, reply: FastifyReply, departmentId?: string | null) {
  const user = await requireUser(req, reply);
  if (!user) return null;
  if (!canWriteContracts(user, departmentId)) {
    reply.code(403).send({ error: "Недостаточно прав для изменения договоров" });
    return null;
  }
  return user;
}

export async function requireFolderManage(req: FastifyRequest, reply: FastifyReply) {
  const user = await requireUser(req, reply);
  if (!user) return null;
  if (!canManageFolders(user) && !can(user, "settings", true)) {
    reply.code(403).send({ error: "Недостаточно прав для управления папками" });
    return null;
  }
  return user;
}

export async function requireContractRoleManage(req: FastifyRequest, reply: FastifyReply) {
  const user = await requireUser(req, reply);
  if (!user) return null;
  if (!canManageContractRoles(user) && !can(user, "settings", true)) {
    reply.code(403).send({ error: "Назначать роли подсистемы «Договоры» может администратор подсистемы" });
    return null;
  }
  return user;
}
