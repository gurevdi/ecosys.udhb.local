import crypto from "crypto";
import { config } from "./config.ts";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;

function key() {
  return crypto.createHash("sha256").update(config.jwtSecret + ":ad").digest();
}

/** Шифрование пароля service-bind LDAP для хранения в Setting */
export function encryptAdPassword(plain: string) {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${enc.toString("base64")}`;
}

/** Расшифровка пароля service-bind LDAP */
export function decryptAdPassword(payload: string) {
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Некорректное хранилище пароля AD");
  const decipher = crypto.createDecipheriv(ALGO, key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const dec = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]);
  return dec.toString("utf8");
}
