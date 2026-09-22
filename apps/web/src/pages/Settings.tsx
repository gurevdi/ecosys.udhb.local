import { FormEvent, useEffect, useState } from "react";

import { api } from "../api";
import { canManageContractRoles, canManageFolders } from "../api";
import { DEFAULT_BRAND_ORG_NAME } from "../lib/brand";
import { Logo } from "../components/Logo";
import {
  EMPTY_MEMO_SIGNATORY,
  MEMO_SIGNATORY_SETTING_KEYS,
  parseMemoSignatory,
  serializeMemoSignatory,
  type MemoSignatory,
} from "../lib/memo-signatories";
import { AdSettingsPanel } from "../components/settings/ad/AdSettingsPanel";
import { AdErrorBoundary } from "../components/settings/ad/AdErrorBoundary";
import { ContractsSettingsPanel } from "../components/settings/contracts/ContractsSettingsPanel";
import { ContractsExtraPanel } from "../components/settings/contracts/ContractsExtraPanel";
import { MemoSignatoryFields } from "../components/settings/MemoSignatoryFields";
import type { Me } from "../App";

type Dept = { id: string; name: string };
type Tab = "general" | "contracts" | "ad";

type GeneralForm = {
  brandOrgName: string;
  signatory1: MemoSignatory;
  signatory2: MemoSignatory;
};

export default function Settings({
  me,
  canWrite,
}: {
  me: Me["user"];
  canWrite?: boolean;
}) {
  const canSettings = Boolean(canWrite);
  const canContractsTab = canSettings || canManageFolders(me) || canManageContractRoles(me);
  const initialTab: Tab =
    sessionStorage.getItem("settingsTab") === "contracts" && canContractsTab
      ? "contracts"
      : canSettings ? "general" : "contracts";

  const [tab, setTab] = useState<Tab>(initialTab);
  const [deps, setDeps] = useState<Dept[]>([]);
  const [form, setForm] = useState<GeneralForm>({
    brandOrgName: DEFAULT_BRAND_ORG_NAME,
    signatory1: { ...EMPTY_MEMO_SIGNATORY },
    signatory2: { ...EMPTY_MEMO_SIGNATORY },
  });
  const [ok, setOk] = useState("");

  async function loadGeneral() {
    const s = await api<Record<string, string>>("/api/settings");
    setForm({
      brandOrgName: s.brand_org_name?.trim() || DEFAULT_BRAND_ORG_NAME,
      signatory1: parseMemoSignatory(s[MEMO_SIGNATORY_SETTING_KEYS.director]) || { ...EMPTY_MEMO_SIGNATORY },
      signatory2: parseMemoSignatory(s[MEMO_SIGNATORY_SETTING_KEYS.deputy]) || { ...EMPTY_MEMO_SIGNATORY },
    });
  }

  useEffect(() => { if (canSettings) loadGeneral(); }, [canSettings]);
  useEffect(() => { if (tab === "contracts") sessionStorage.removeItem("settingsTab"); }, [tab]);
  useEffect(() => {
    if ((tab === "ad" || tab === "contracts") && !deps.length) {
      api<Dept[]>("/api/departments").then(setDeps).catch(() => null);
    }
  }, [tab, deps.length]);

  async function saveGeneral(e: FormEvent) {
    e.preventDefault();
    if (
      !form.signatory1.dative.trim() ||
      !form.signatory1.positionDative.trim() ||
      !form.signatory2.dative.trim() ||
      !form.signatory2.positionDative.trim()
    ) {
      setOk(""); alert("Укажите должность и ФИО в дательном падеже для обоих подписантов"); return;
    }
    await api("/api/settings", {
      method: "PUT",
      body: JSON.stringify({
        brand_org_name: form.brandOrgName.trim() || DEFAULT_BRAND_ORG_NAME,
        [MEMO_SIGNATORY_SETTING_KEYS.director]: serializeMemoSignatory(form.signatory1),
        [MEMO_SIGNATORY_SETTING_KEYS.deputy]: serializeMemoSignatory(form.signatory2),
        directorUserId: null, deputyUserId: null,
      }),
    });
    setOk("Сохранено");
  }

  const sectionItems = [
    canSettings && { id: "general" as Tab, label: "Общие" },
    canContractsTab && { id: "contracts" as Tab, label: "Договоры" },
    canSettings && { id: "ad" as Tab, label: "Active Directory" },
  ].filter(Boolean) as { id: Tab; label: string }[];

  return (
    <div className="page">
      <p className="page-cap">Системные параметры экосистемы</p>

      <div className="reglayout">
        <aside className="toc">
          <div className="toc-title">Разделы</div>
          {sectionItems.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`toc-item${tab === s.id ? " toc-item--on" : ""}`}
              onClick={() => setTab(s.id)}
            >
              {s.label}
            </button>
          ))}
        </aside>

        <div>
          {tab === "general" && canSettings && (
            <section className="sec">
              <div className="sec-head">
                <h2 className="sec-title">Бренд интерфейса</h2>
              </div>
              <form onSubmit={saveGeneral}>
                <p className="muted" style={{ fontSize: 12.5 }}>Название организации в блоке бренда (левая колонка).</p>
                <div className="f-row">
                  <div className="f-label">Название организации</div>
                  <input
                    value={form.brandOrgName}
                    onChange={(e) => setForm({ ...form, brandOrgName: e.target.value })}
                    maxLength={64}
                    placeholder={DEFAULT_BRAND_ORG_NAME}
                    required
                  />
                </div>
                <div style={{ maxWidth: 200, margin: "12px 0" }}>
                  <Logo orgName={form.brandOrgName.trim() || DEFAULT_BRAND_ORG_NAME} />
                </div>

                <div className="sec-head" style={{ marginTop: 24 }}>
                  <h2 className="sec-title">Служебные записки</h2>
                </div>
                <MemoSignatoryFields
                  title="Подписант 1 — директор"
                  hint="Реквизиты для печати."
                  value={form.signatory1}
                  onChange={(signatory1) => setForm({ ...form, signatory1 })}
                />
                <MemoSignatoryFields
                  title="Подписант 2 — замещающая подпись"
                  hint="Заместитель или лицо с правом замещающей подписи."
                  value={form.signatory2}
                  onChange={(signatory2) => setForm({ ...form, signatory2 })}
                />

                <button className="btn gold" type="submit" style={{ marginTop: 16 }}>Сохранить</button>
                {ok && <span className="muted" style={{ marginLeft: 10 }}>{ok}</span>}
              </form>
            </section>
          )}

          {tab === "contracts" && canContractsTab && (
            <>
              <ContractsSettingsPanel me={me} canWriteSettings={canSettings} enabled={tab === "contracts"} />
              <ContractsExtraPanel enabled={tab === "contracts"} />
            </>
          )}

          {tab === "ad" && canSettings && (
            <AdErrorBoundary>
              <AdSettingsPanel deps={deps} canWrite={canSettings} />
            </AdErrorBoundary>
          )}
        </div>
      </div>
    </div>
  );
}
