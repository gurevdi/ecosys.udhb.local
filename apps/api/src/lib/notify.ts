import nodemailer from "nodemailer";
import { prisma, config } from "./config.ts";
import { debugError, debugLog, debugTry } from "./debug.ts";

let transporter: nodemailer.Transporter | null = null;

/** SMTP-транспорт (создаётся один раз, если задан SMTP_HOST) */
function mailer() {
  if (!config.smtp.host) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
      tls: { rejectUnauthorized: false },
    });
  }
  return transporter;
}

/**
 * Уведомление пользователю: запись в БД + опционально e-mail.
 * Почта берётся из профиля, если включено notifyEmail.
 */
export async function notify(opts: {
  userId: string;
  title: string;
  body: string;
  kind?: string;
}) {
  return debugTry("notify", `userId=${opts.userId} title=${opts.title}`, async () => {
    const user = await prisma.user.findUnique({ where: { id: opts.userId } });
    if (!user || !user.isActive) {
      debugLog("notify", `пропуск: пользователь ${opts.userId} неактивен или не найден`);
      return;
    }

    const row = await prisma.notification.create({
      data: {
        userId: user.id,
        title: opts.title,
        body: opts.body,
        kind: opts.kind || "info",
      },
    });

    if (user.notifyEmail && user.email && mailer()) {
      try {
        await mailer()!.sendMail({
          from: config.smtp.from,
          to: user.email,
          subject: `[Экосистема УДХБ] ${opts.title}`,
          text: opts.body,
        });
        await prisma.notification.update({ where: { id: row.id }, data: { emailSent: true } });
        debugLog("notify", `письмо отправлено на ${user.email}`);
      } catch (e) {
        debugError("notify", `ошибка SMTP для ${user.email}`, e);
      }
    }
  });
}

/** Массовая рассылка уведомлений (без дубликатов по userId) */
export async function notifyMany(userIds: string[], title: string, body: string, kind?: string) {
  const unique = [...new Set(userIds)];
  for (const userId of unique) {
    await notify({ userId, title, body, kind });
  }
}

/**
 * Фоновая задача: напоминания о сроках приёмки.
 * Приёмка в 1С — здесь только контроль дат начала и крайнего срока.
 */
export async function remindAcceptance() {
  return debugTry("acceptance", "проверка сроков приёмки", async () => {
    const now = new Date();
    const horizon = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    const rows = await prisma.procurement.findMany({
      where: {
        status: { in: ["contracted", "execution", "acceptance_window"] },
        OR: [
          { acceptanceStartAt: { lte: horizon, gte: now } },
          { acceptanceDueAt: { lte: horizon } },
        ],
      },
      include: { initiator: true },
    });

    debugLog("acceptance", `к проверке закупок: ${rows.length}`);

    for (const p of rows) {
      const due = p.acceptanceDueAt;
      const start = p.acceptanceStartAt;
      let title = "Контроль приёмки";
      let body = `Закупка «${p.title}»: `;

      if (due && due <= now) {
        title = "Просрочена дата приёмки";
        body += `крайний срок ${due.toLocaleDateString("ru-RU")} уже прошёл. Приёмка ведётся в 1С, здесь только контроль срока.`;
      } else if (start && start <= now && start <= horizon) {
        title = "Пора начинать приёмку";
        body += `плановое начало ${start.toLocaleDateString("ru-RU")}. Не выходите за срок${due ? ` ${due.toLocaleDateString("ru-RU")}` : ""}.`;
      } else if (due && due <= horizon) {
        title = "Приёмка в ближайшие дни";
        body += `крайний срок ${due.toLocaleDateString("ru-RU")}.`;
      } else {
        continue;
      }

      // Не дублируем одно и то же уведомление в один день
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const already = await prisma.notification.findFirst({
        where: { userId: p.initiatorId, title, createdAt: { gte: today } },
      });
      if (!already) {
        await notify({ userId: p.initiatorId, title, body, kind: "deadline" });
      }
    }
  });
}
