export type MemoSignatory = {
  /** Именительный падеж — справочно */
  position: string;
  /** Дательный падеж для строки «Кому: директору» */
  positionDative: string;
  fullName: string;
  shortName: string;
  /** Фамилия И.О. в дательном падеже */
  dative: string;
};

export const MEMO_SIGNATORY_SETTING_KEYS = {
  director: "memo_signatory_1",
  deputy: "memo_signatory_2",
} as const;

export const EMPTY_MEMO_SIGNATORY: MemoSignatory = {
  position: "",
  positionDative: "",
  fullName: "",
  shortName: "",
  dative: "",
};

export function parseMemoSignatory(raw: string | null | undefined): MemoSignatory | null {
  if (!raw?.trim()) return null;
  try {
    const o = JSON.parse(raw) as Partial<MemoSignatory>;
    if (!o || typeof o !== "object") return null;
    const signatory: MemoSignatory = {
      position: String(o.position ?? "").trim(),
      positionDative: String(o.positionDative ?? "").trim(),
      fullName: String(o.fullName ?? "").trim(),
      shortName: String(o.shortName ?? "").trim(),
      dative: String(o.dative ?? "").trim(),
    };
    if (
      !signatory.position &&
      !signatory.positionDative &&
      !signatory.fullName &&
      !signatory.shortName &&
      !signatory.dative
    )
      return null;
    return signatory;
  } catch {
    return null;
  }
}

export function serializeMemoSignatory(signatory: MemoSignatory): string {
  return JSON.stringify({
    position: signatory.position.trim(),
    positionDative: signatory.positionDative.trim(),
    fullName: signatory.fullName.trim(),
    shortName: signatory.shortName.trim(),
    dative: signatory.dative.trim(),
  });
}

export function signatoryFromSettings(
  settings: Record<string, string>,
  addressee: "director" | "deputy_director"
): MemoSignatory | null {
  const key =
    addressee === "director" ? MEMO_SIGNATORY_SETTING_KEYS.director : MEMO_SIGNATORY_SETTING_KEYS.deputy;
  return parseMemoSignatory(settings[key]);
}

export type MemoAddresseeSnapshot = {
  addressee: string;
  addresseeDative?: string | null;
  addresseePosition?: string | null;
  addresseePositionDative?: string | null;
};

/** Строки адресата для блока «Кому:» (должность и ФИО в дательном падеже) */
export function memoAddresseeLines(m: MemoAddresseeSnapshot): string[] {
  const name =
    m.addresseeDative?.trim() ||
    (m.addressee === "director" ? "Директору" : "Заместителю директора");
  const position =
    m.addresseePositionDative?.trim() ||
    m.addresseePosition?.trim() ||
    "";
  if (position) return [position, name];
  return [name];
}

/** @deprecated используйте memoAddresseeLines */
export function memoAddresseeLine(m: MemoAddresseeSnapshot): string {
  return memoAddresseeLines(m).join(" ");
}
