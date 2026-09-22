import { FormEvent, useEffect, useState } from "react";
import { api } from "../../../api";
import { toast } from "../../../lib/toast";

type Letterhead = { id: string; departmentId: string | null; title: string; body: string; department: { name: string } | null };
type Dept = { id: string; name: string };
type Supplier = { id: string; name: string; inn: string | null; phone: string | null; comment: string | null; isActive: boolean };

export function ContractsExtraPanel({ enabled }: { enabled: boolean }) {
  const [deps, setDeps] = useState<Dept[]>([]);
  const [heads, setHeads] = useState<Letterhead[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [payNames, setPayNames] = useState("");
  const [headDraft, setHeadDraft] = useState({ departmentId: "", title: "", body: "" });
  const [supDraft, setSupDraft] = useState({ name: "", inn: "", phone: "", comment: "" });
  const [csv, setCsv] = useState("");

  async function load() {
    const [d, h, s, settings] = await Promise.all([
      api<Dept[]>("/api/departments"),
      api<Letterhead[]>("/api/letterheads"),
      api<Supplier[]>("/api/suppliers"),
      api<Record<string, string>>("/api/settings"),
    ]);
    setDeps(d);
    setHeads(h);
    setSuppliers(s);
    try {
      const names = JSON.parse(settings.payment_addressees || "[]");
      setPayNames(Array.isArray(names) ? names.join("\n") : "");
    } catch {
      setPayNames("");
    }
  }

  useEffect(() => {
    if (enabled) load().catch((e) => toast(e instanceof Error ? e.message : "Ошибка загрузки"));
  }, [enabled]);

  async function saveHead(e: FormEvent) {
    e.preventDefault();
    await api("/api/letterheads", {
      method: "PUT",
      body: JSON.stringify({
        departmentId: headDraft.departmentId || null,
        title: headDraft.title || (headDraft.departmentId ? "Шапка отдела" : "Шапка управления"),
        body: headDraft.body,
      }),
    });
    toast("Шапка сохранена", "ok");
    await load();
  }

  async function savePays(e: FormEvent) {
    e.preventDefault();
    const names = payNames
      .split(/\n/)
      .map((x) => x.trim())
      .filter(Boolean);
    await api("/api/payment-addressees", {
      method: "PUT",
      body: JSON.stringify({ names }),
    });
    toast("Адресаты оплат сохранены", "ok");
  }

  async function addSupplier(e: FormEvent) {
    e.preventDefault();
    await api("/api/suppliers", {
      method: "POST",
      body: JSON.stringify(supDraft),
    });
    setSupDraft({ name: "", inn: "", phone: "", comment: "" });
    toast("Поставщик добавлен", "ok");
    await load();
  }

  async function importCsv(e: FormEvent) {
    e.preventDefault();
    const lines = csv.trim().split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) {
      toast("Нужна строка заголовков и хотя бы одна строка данных");
      return;
    }
    const header = lines[0].split(";").map((h) => h.trim().replace(/^"|"$/g, "").toLowerCase());
    const idx = (name: string) => header.findIndex((h) => h.includes(name));
    const rows = lines.slice(1).map((line) => {
      const c = line.split(";").map((x) => x.trim().replace(/^"|"$/g, ""));
      const num = (i: number) => {
        const n = Number(String(c[i] || "").replace(/\s/g, "").replace(",", "."));
        return Number.isFinite(n) ? n : undefined;
      };
      const iso = (i: number) => {
        const v = c[i] || "";
        const m = v.match(/(\d{1,2})[.](\d{1,2})[.](\d{4})/) || v.match(/(\d{4})-(\d{2})-(\d{2})/);
        if (!m) return undefined;
        if (m[0].includes("-")) return m[0];
        return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
      };
      return {
        title: c[idx("наим")] || c[idx("title")] || c[0],
        supplierName: c[idx("постав")] || c[idx("supplier")] || "",
        inn: c[idx("инн")] || "",
        contractNumber: c[idx("номер") >= 0 ? idx("номер") : idx("контракт")] || "",
        contractDate: iso(idx("заключ") >= 0 ? idx("заключ") : idx("дата")),
        contractAmount: num(idx("сумм")),
        departmentCode: c[idx("отдел")] || c[idx("код")] || "",
        budgetYear: num(idx("год")),
        category: (c[idx("тип")] || "").includes("постав") ? "supply" : undefined,
      };
    }).filter((r) => r.title);
    const res = await api<{ count: number }>("/api/procurements/import-archive", {
      method: "POST",
      body: JSON.stringify({ rows }),
    });
    toast(`Импортировано ${res.count} архивных карточек`, "ok");
    setCsv("");
  }

  const selectedHead = heads.find((h) => (headDraft.departmentId ? h.departmentId === headDraft.departmentId : !h.departmentId));

  return (
    <div className="ctr-extra">
      <section className="card">
        <h2>Шапки служебных записок</h2>
        <p className="muted">Отдел пишет под своей шапкой. Если СЗ на директора — шапка управления.</p>
        <form onSubmit={saveHead}>
          <div className="field">
            <label>Бланк</label>
            <select
              value={headDraft.departmentId}
              onChange={(e) => {
                const id = e.target.value;
                const found = heads.find((h) => (id ? h.departmentId === id : !h.departmentId));
                setHeadDraft({ departmentId: id, title: found?.title || "", body: found?.body || "" });
              }}
            >
              <option value="">Управление</option>
              {deps.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Текст шапки</label>
            <textarea
              rows={5}
              value={headDraft.body || selectedHead?.body || ""}
              onChange={(e) => setHeadDraft({ ...headDraft, body: e.target.value })}
              required
            />
          </div>
          <button className="btn" type="submit">
            Сохранить шапку
          </button>
        </form>
      </section>

      <section className="card">
        <h2>Справочник поставщиков</h2>
        <form onSubmit={addSupplier} className="proc-form-grid">
          <div className="field">
            <label>Наименование</label>
            <input value={supDraft.name} onChange={(e) => setSupDraft({ ...supDraft, name: e.target.value })} required />
          </div>
          <div className="field">
            <label>ИНН</label>
            <input value={supDraft.inn} onChange={(e) => setSupDraft({ ...supDraft, inn: e.target.value })} />
          </div>
          <div className="field">
            <label>Телефон</label>
            <input value={supDraft.phone} onChange={(e) => setSupDraft({ ...supDraft, phone: e.target.value })} />
          </div>
          <div className="field">
            <label>Комментарий</label>
            <input value={supDraft.comment} onChange={(e) => setSupDraft({ ...supDraft, comment: e.target.value })} />
          </div>
          <button className="btn" type="submit">
            Добавить
          </button>
        </form>
        <p className="muted">{suppliers.length} в справочнике. При загрузке КП имя подтягивается отсюда.</p>
      </section>

      <section className="card">
        <h2>Адресаты служебок на оплату</h2>
        <form onSubmit={savePays}>
          <div className="field">
            <label>По одному на строку</label>
            <textarea rows={5} value={payNames} onChange={(e) => setPayNames(e.target.value)} />
          </div>
          <button className="btn" type="submit">
            Сохранить список
          </button>
        </form>
      </section>

      <section className="card">
        <h2>Импорт архива CSV</h2>
        <p className="muted">
          Разделитель «;». Заголовки: наименование; поставщик; ИНН; номер; дата заключения; сумма; отдел; год.
          Карточки помечаются как архивные — полный комплект не требуется.
        </p>
        <form onSubmit={importCsv}>
          <textarea rows={6} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder="наименование;поставщик;..." />
          <button className="btn" type="submit" style={{ marginTop: 10 }}>
            Импортировать
          </button>
        </form>
      </section>
    </div>
  );
}
