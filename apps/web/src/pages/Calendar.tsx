import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, day } from "../api";

type Row = {
  id: string;
  serialNo: number;
  title: string;
  status: string;
  createdAt: string;
  contractDate: string | null;
  deliveryUntil: string | null;
  validUntil: string | null;
  acceptanceStartAt: string | null;
  acceptanceDueAt: string | null;
  department: { name: string };
  payments?: { amount: string | null; paidAt: string | null }[];
};

type Ev = {
  date: string; // YYYY-MM-DD
  kind: "contract" | "delivery" | "accStart" | "accDue" | "valid" | "payment" | "created";
  label: string;
  row: Row;
  overdue?: boolean;
};

const KIND_LABEL: Record<Ev["kind"], string> = {
  contract: "Заключение",
  delivery: "Поставка до",
  accStart: "Начало приёмки",
  accDue: "Приёмка до",
  valid: "Действует до",
  payment: "Оплата",
  created: "Создана",
};

const WEEKDAYS = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];
const MONTHS = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function events(r: Row): Ev[] {
  const out: Ev[] = [];
  const push = (date: string | null, kind: Ev["kind"], overdue = false) => {
    if (date) out.push({ date: date.slice(0, 10), kind, label: `№${r.serialNo} ${r.title}`, row: r, overdue });
  };
  push(r.contractDate, "contract");
  push(r.deliveryUntil, "delivery");
  push(r.acceptanceStartAt, "accStart");
  push(r.acceptanceDueAt, "accDue", r.acceptanceDueAt ? new Date(r.acceptanceDueAt).getTime() < Date.now() : false);
  push(r.validUntil, "valid");
  (r.payments || []).forEach((p) => push(p.paidAt, "payment"));
  push(r.createdAt, "created");
  return out;
}

export default function Calendar() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState("");
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [kinds, setKinds] = useState<Set<Ev["kind"]>>(new Set(["contract", "delivery", "accStart", "accDue", "valid", "payment", "created"]));

  useEffect(() => {
    api<Row[]>("/api/procurements")
      .then(setRows)
      .catch((e) => setErr(e?.message || "Не удалось загрузить"));
  }, []);

  const allEvents = useMemo(() => (rows || []).flatMap(events).filter((e) => kinds.has(e.kind)), [rows, kinds]);

  const byDate = useMemo(() => {
    const map = new Map<string, Ev[]>();
    for (const e of allEvents) {
      const list = map.get(e.date) || [];
      list.push(e);
      map.set(e.date, list);
    }
    return map;
  }, [allEvents]);

  const todayIso = iso(new Date());
  const first = new Date(cursor.y, cursor.m, 1);
  const startOffset = (first.getDay() + 6) % 7; // понедельник — первый
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const daysInPrev = new Date(cursor.y, cursor.m, 0).getDate();
  const cells: { iso: string; dayNum: number; other: boolean }[] = [];
  for (let i = 0; i < startOffset; i++) {
    const d = new Date(cursor.y, cursor.m - 1, daysInPrev - startOffset + 1 + i);
    cells.push({ iso: iso(d), dayNum: d.getDate(), other: true });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ iso: iso(new Date(cursor.y, cursor.m, d)), dayNum: d, other: false });
  }
  while (cells.length % 7 !== 0) {
    const d = new Date(cursor.y, cursor.m + 1, cells.length - startOffset - daysInMonth + 1);
    cells.push({ iso: iso(d), dayNum: d.getDate(), other: true });
  }

  const monthEvents = allEvents.filter((e) => e.date.startsWith(`${cursor.y}-${String(cursor.m + 1).padStart(2, "0")}`));
  const upcoming = allEvents
    .filter((e) => e.date >= todayIso)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 12);
  const selectedEvents = selected ? byDate.get(selected) || [] : [];

  const shift = (n: number) => setCursor((c) => {
    const d = new Date(c.y, c.m + n, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  const toggleKind = (k: Ev["kind"]) =>
    setKinds((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  if (err) return <div className="page"><p className="error">{err}</p></div>;
  if (!rows) return <div className="page"><p className="muted">Загрузка…</p></div>;

  return (
    <div className="page">
      <p className="page-cap">
        Календарь сроков по договорам · событий в месяце: <b>{monthEvents.length}</b>
      </p>

      <div className="pagehead">
        <h2 className="pagehead-title">
          {MONTHS[cursor.m]} <span className="cal-year">{cursor.y}</span>
        </h2>
        <div className="pagehead-actions">
          <button type="button" className="btn ghost btn-sm" onClick={() => shift(-1)}>← Пред.</button>
          <button
            type="button"
            className="btn ghost btn-sm"
            onClick={() => {
              const d = new Date();
              setCursor({ y: d.getFullYear(), m: d.getMonth() });
              setSelected(todayIso);
            }}
          >
            Сегодня
          </button>
          <button type="button" className="btn ghost btn-sm" onClick={() => shift(1)}>След. →</button>
        </div>
      </div>

      <div className="chips">
        {(Object.keys(KIND_LABEL) as Ev["kind"][]).map((k) => (
          <button key={k} type="button" className={kinds.has(k) ? "chip on" : "chip"} onClick={() => toggleKind(k)}>
            {KIND_LABEL[k]}
            <span className="c">{allEvents.length ? (rows.flatMap(events).filter((e) => e.kind === k).length) : 0}</span>
          </button>
        ))}
      </div>

      <div className="cal">
        {WEEKDAYS.map((w) => (
          <div key={w} className="cal-wd">{w}</div>
        ))}
        {cells.map((c) => {
          const evs = byDate.get(c.iso) || [];
          const isToday = c.iso === todayIso;
          const isSel = c.iso === selected;
          return (
            <button
              key={c.iso}
              type="button"
              className={`cal-day${c.other ? " cal-day--other" : ""}${isToday ? " cal-day--today" : ""}${isSel ? " cal-day--sel" : ""}`}
              onClick={() => setSelected(isSel ? null : c.iso)}
            >
              <span className="cal-num">{c.dayNum}</span>
              {evs.slice(0, 3).map((e, i) => (
                <span key={i} className={`cal-ev cal-ev--${e.kind}${e.overdue ? " cal-ev--overdue" : ""}`} title={e.label}>
                  {e.label}
                </span>
              ))}
              {evs.length > 3 && <span className="cal-more">+{evs.length - 3}</span>}
            </button>
          );
        })}
      </div>

      <div className="cal-lists">
        <section className="sec">
          <div className="sec-head">
            <h2 className="sec-title">{selected ? `События ${selected.split("-").reverse().join(".")}` : "Ближайшие события"}</h2>
            {selected && (
              <button type="button" className="f-reset" style={{ margin: 0 }} onClick={() => setSelected(null)}>
                Показать ближайшие ×
              </button>
            )}
          </div>
          <table className="reg">
            <thead>
              <tr>
                <th style={{ width: 90 }}>Дата</th>
                <th style={{ width: 140 }}>Событие</th>
                <th>Закупка</th>
                <th>Отдел</th>
              </tr>
            </thead>
            <tbody>
              {(selected ? selectedEvents : upcoming).length === 0 && (
                <tr><td colSpan={4} className="muted">Событий нет</td></tr>
              )}
              {(selected ? selectedEvents : upcoming).map((e, i) => (
                <tr key={i} className={e.overdue ? "row-danger" : ""}>
                  <td className="num">{e.date.split("-").reverse().join(".")}</td>
                  <td>
                    <span className={`st ${e.overdue ? "st--danger" : e.kind === "delivery" || e.kind === "accDue" ? "st--gold" : e.kind === "payment" ? "st--ok" : "st--work"}`}>
                      {KIND_LABEL[e.kind]}
                    </span>
                  </td>
                  <td>
                    <Link className="name" to={`/procurements/${e.row.id}`}>№{e.row.serialNo} {e.row.title}</Link>
                    <div className="sub">{e.row.status}</div>
                  </td>
                  <td>{e.row.department.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <div className="regfoot">
        <span>События формируются из карточек договоров · {day(new Date().toISOString())}</span>
      </div>
    </div>
  );
}
