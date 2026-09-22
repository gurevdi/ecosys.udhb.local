import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma, config } from "./config.ts";
import { ldapUserBind } from "./ldap.ts";
import { debugError, debugLog, debugTry } from "./debug.ts";
import type { ContractRoleEntry } from "./contracts.ts";

/** Данные авторизованного пользователя в сессии */
export type SessionUser = {
  id: string;
  login: string;
  fullName: string;
  isAdmin: boolean;
  departmentId: string | null;
  permissions: { resource: string; canRead: boolean; canWrite: boolean }[];
  contractRoles: ContractRoleEntry[];
};

/** Выпуск JWT-токена сессии (12 часов) */
export function signToken(userId: string) {
  return jwt.sign({ sub: userId }, config.jwtSecret, { expiresIn: "12h" });
}

/** Запись cookie сессии в ответ */
export function setSession(reply: FastifyReply, token: string) {
  reply.setCookie(config.cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

/** Загрузка пользователя и прав по id из БД */
export async function loadSession(userId: string): Promise<SessionUser | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { permissions: true, contractRoles: true },
  });
  if (!user || !user.isActive) return null;
  return {
    id: user.id,
    login: user.login,
    fullName: user.fullName,
    isAdmin: user.isAdmin,
    departmentId: user.departmentId,
    permissions: user.permissions.map((p) => ({
      resource: p.resource,
      canRead: p.canRead,
      canWrite: p.canWrite,
    })),
    contractRoles: user.contractRoles.map((r) => ({
      role: r.role,
      departmentId: r.departmentId,
    })),
  };
}

/** Проверка права на ресурс (чтение или запись) */
export function can(user: SessionUser, resource: string, write = false) {
  if (user.isAdmin) return true;
  if (resource === "contracts") {
    const p = user.permissions.find((x) => x.resource === "contracts");
    if (p && (write ? p.canWrite : p.canRead || p.canWrite)) return true;
    return user.contractRoles.some((r) =>
      write ? r.role === "admin" || r.role === "moderator" || r.role === "operator" : true
    );
  }
  const p = user.permissions.find((x) => x.resource === resource);
  if (!p) return false;
  return write ? p.canWrite : p.canRead || p.canWrite;
}

/** Извлечение пользователя из cookie без прерывания запроса */
export async function getAuthUser(req: FastifyRequest): Promise<SessionUser | null> {
  const token = req.cookies?.[config.cookieName];
  if (!token) return null;
  try {
    const payload = jwt.verify(token, config.jwtSecret) as { sub: string };
    return loadSession(payload.sub);
  } catch (err) {
    debugError("auth", "невалидный или просроченный токен", err);
    return null;
  }
}

/** Обязательная авторизация; иначе 401 */
export async function requireUser(req: FastifyRequest, reply: FastifyReply) {
  const user = await getAuthUser(req);
  if (!user) {
    reply.code(401).send({ error: "Нужна авторизация" });
    return null;
  }
  return user;
}

/** Авторизация + право на ресурс; иначе 403 */
export async function requirePerm(
  req: FastifyRequest,
  reply: FastifyReply,
  resource: string,
  write = false
) {
  const user = await requireUser(req, reply);
  if (!user) return null;
  if (!can(user, resource, write)) {
    debugLog("auth", `отказ в доступе: ${user.login} → ${resource} write=${write}`);
    reply.code(403).send({ error: "Недостаточно прав" });
    return null;
  }
  return user;
}

/**
 * Проверка пароля: для AD — LDAP bind, для local — bcrypt.
 * У AD-пользователя возможен запасной локальный хеш.
 */
export async function verifyPassword(
  user: { source: string; login: string; passwordHash: string | null },
  password: string
) {
  return debugTry("auth", `verifyPassword ${user.login}`, async () => {
    if (user.source === "ad") {
      const bindOk = await ldapUserBind(user.login, password);
      if (bindOk) return true;
      if (user.passwordHash) return bcrypt.compare(password, user.passwordHash);
      return false;
    }
    if (!user.passwordHash) {
      debugLog("auth", `у локального пользователя ${user.login} нет passwordHash`);
      return false;
    }
    return bcrypt.compare(password, user.passwordHash);
  });
}

export { bcrypt };
