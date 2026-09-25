import { prisma } from "./config.ts";

export async function logUserAccess(opts: {
  targetId: string;
  actorId: string;
  action: string;
  summary: string;
  details?: unknown;
}) {
  await prisma.userAccessLog.create({
    data: {
      targetId: opts.targetId,
      actorId: opts.actorId,
      action: opts.action,
      summary: opts.summary,
      details: opts.details === undefined ? undefined : (opts.details as object),
    },
  });
}

export function summarizePerms(
  perms: { resource: string; canRead: boolean; canWrite: boolean }[]
) {
  return [...perms]
    .sort((a, b) => a.resource.localeCompare(b.resource))
    .map((p) => `${p.resource}:${p.canWrite ? "rw" : p.canRead ? "r" : "-"}`)
    .join(",");
}

export function summarizeRoles(
  roles: { role: string; departmentId: string | null }[]
) {
  return [...roles]
    .sort((a, b) => `${a.role}:${a.departmentId || ""}`.localeCompare(`${b.role}:${b.departmentId || ""}`))
    .map((r) => `${r.role}@${r.departmentId || "*"}`)
    .join(",");
}
