import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, day, formatApiError, STATUS } from "../api";
import { debugError } from "../debug";
import { SedDocumentModal } from "../components/SedDocumentModal";

type CabinetContracts = {
  total: number;
  active: number;
  completed: number;
  overdueAcceptance: number;
  recent: {
    id: string;
    serialNo: number;
    title: string;
    status: string;
    updatedAt: string;
    department: { name: string };
    selectedQuote?: { supplierName: string } | null;
    contractAmount?: string | null;
    estimatedAmount?: string | null;
  }[];
};

type CabinetSedItem = {
  id: string;
  kind: string | null;
  number: string | null;
  regDate: string | null;
  correspondent: string | null;
  title: string | null;
};

type CabinetSed = {
  ok: boolean;
  error?: string;
  dashboard: {
    total: number;
    burning: number;
    urgent: number;
    other: number;
  } | null;
  items: CabinetSedItem[];
  fetchedAt?: string;
};

type CabinetData = {
  mine: { id: string; title: string; status: string; department: { name: string } }[];
  unread: { id: string; title: string; body: string; createdAt: string }[];
  deadlines: {
    id: string;
    title: string;
    acceptanceStartAt: string | null;
    acceptanceDueAt: string | null;
    initiator: { fullName: string };
  }[];
  contracts: CabinetContracts | null;
  sed: CabinetSed | null;
};

function kindClass(kind: string | null) {
  const k = (kind || "").toLowerCase();
  if (k.includes("вход")) return "in";
  if (k.includes("исход")) return "out";
  if (k.includes("служеб")) return "memo";
  return "other";
}

function phaseOf(status: string) {
  if (["completed", "rejected"].includes(status)) return 5;
  if (["execution", "acceptance_window", "contracted"].includes(status)) return 4;
  if (["transferred", "published", "bidding", "returned"].includes(status)) return 3;
  if (["approval", "supervisor_approval", "director_approval", "memo", "collecting_quotes"].includes(status)) return 2;
  return 1;
}

function stOf(status: string) {
  if (status === "completed") return "st--ok";
  if (status === "rejected") return "st--danger";
  if (status === "draft") return "st--muted";
  if (["acceptance_window", "approval", "supervisor_approval", "director_approval", "memo", "returned"].includes(status))
    return "st--gold";
  return "st--work";
}

function Stage({ status }: { status: string }) {
  const cur = status === "completed" ? 6 : status === "rejected" ? 0 : phaseOf(status);
  return (
    <span className="stage" aria-hidden>
      {[1, 2, 3, 4, 5].map((i) => (
        <i key={i} className={i < cur ? "done" : i === cur ? "now" : ""} />
      ))}
    </span>
  );
}

function money(v: string | number | null | undefined) {
  const n = Number(v || 0);
  if (!n) return "—";
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 0 }) + " \u20BD";
}

function fmtWhen(v: string | null) {
  if (!v) return "—";
  return new Date(v).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function Cabinet() {
  const [data, setData] = useState<CabinetData | null>(null);
  const [error, setError] = useState("");
  const [debugDetail, setDebugDetail] = useState<string | null>(null);
  const [sedDocId, setSedDocId] = useState<string | null>(null);

  useEffect(() => {
    api<CabinetData>("/api/cabinet")
      .then(setData)
      .catch((err) => {
        debugError("cabinet", "не удалось загрузить панель управления", err);
        const { message, detail } = formatApiError(err);
        setError(message);
        setDebugDetail(detail);
      });
  }, []);

  if (error) {
    return (
      <div className="page">
        <p className="error">{error}</p>
        {debugDetail && <pre className="debug-detail">{debugDetail}</pre>}
      </div>
    );
  }
  if (!data) return <div className="page"><p className="muted">Загрузка…</p></div>;

  const now = Date.now();
  const overdue = data.deadlines.filter((d) => d.acceptanceDueAt && new Date(d.acceptanceDueAt).getTime() < now);
  const formedAt = new Date().toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const todayShort = new Date().toLocaleDateString("ru-RU");

  return (
    <div className="page">
      <p className="page-cap">Выписка из реестра, сформирована <b>{formedAt}</b> · Asia/Omsk</p>

      <div className="stats">
        {data.contracts && (
          <>
            <div className="stat"><div className="stat-v">{data.contracts.total}</div><div className="stat-l">договоров в выборке</div></div>
            <div className="stat"><div className="stat-v">{data.contracts.active}</div><div className="stat-l">в работе</div></div>
            <div className="stat stat--danger"><div className="stat-v">{data.contracts.overdueAcceptance}</div><div className="stat-l">просрочена приёмка</div></div>
            <div className="stat"><div className="stat-v">{data.contracts.completed}</div><div className="stat-l">завершено</div></div>
          </>
        )}
        {data.sed?.dashboard && (
          <div className="stat stat--gold"><div className="stat-v">{data.sed.dashboard.total}</div><div className="stat-l">СЭД · на рассмотрении</div></div>
        )}
      </div>

      {((data.contracts?.overdueAcceptance ?? overdue.length) > 0 || data.unread.length > 0 || Boolean(data.sed?.dashboard?.urgent) || Boolean(data.sed?.dashboard?.burning)) && (
        <div className="require">
          <span className="stamp">К исполнению</span>
          <p className="require-t">Требует действий на {todayShort}</p>
          <ul>
            {(data.contracts?.overdueAcceptance ?? overdue.length) > 0 && (
              <li>
                <span className="cnt">{data.contracts?.overdueAcceptance ?? overdue.length}</span>
                <span>просрочена приёмка — <Link to="/procurements">оформить акты</Link></span>
              </li>
            )}
            {data.unread.length > 0 && (
              <li>
                <span className="cnt cnt--calm">{data.unread.length}</span>
                <span>непрочитанных уведомлений — <Link to="/notifications">прочитать</Link></span>
              </li>
            )}
            {Boolean(data.sed?.dashboard?.urgent) && (
              <li>
                <span className="cnt">{data.sed!.dashboard!.urgent}</span>
                <span>срочных документа СЭД — <Link to="/sed">разобрать</Link></span>
              </li>
            )}
            {Boolean(data.sed?.dashboard?.burning) && (
              <li>
                <span className="cnt cnt--calm">{data.sed!.dashboard!.burning}</span>
                <span>«горящих» документа СЭД — <Link to="/sed">разобрать</Link></span>
              </li>
            )}
          </ul>
        </div>
      )}

      {data.contracts && (
        <section className="sec">
          <div className="sec-head">
            <h2 className="sec-title">Подсистема «Договоры»</h2>
            <Link to="/procurements" className="sec-link">Перейти в реестр →</Link>
          </div>
          <table className="reg">
            <thead>
              <tr>
                <th style={{ width: 60 }}>№</th>
                <th>Закупка</th>
                <th>Этап</th>
                <th>Поставщик</th>
                <th className="sum">Сумма</th>
              </tr>
            </thead>
            <tbody>
              {data.contracts.recent.length === 0 && (
                <tr><td colSpan={5} className="muted">Нет карточек</td></tr>
              )}
              {data.contracts.recent.map((p) => (
                <tr key={p.id} className={p.status === "acceptance_window" ? "row-danger" : ""}>
                  <td className="num">№{p.serialNo}</td>
                  <td>
                    <Link className="name" to={`/procurements/${p.id}`}>{p.title}</Link>
                    <div className="sub">{p.department.name} · {day(p.updatedAt)}</div>
                  </td>
                  <td>
                    <Stage status={p.status} />
                    <span className={`st ${stOf(p.status)}`}>{STATUS[p.status] || p.status}</span>
                  </td>
                  <td>{p.selectedQuote?.supplierName || "—"}</td>
                  <td className="sum">{money(p.contractAmount || p.estimatedAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {data.sed && data.sed.items.length > 0 && (
        <section className="sec">
          <div className="sec-head">
            <h2 className="sec-title">Подсистема «СЭД»</h2>
            <Link to="/sed" className="sec-link">Все документы →</Link>
          </div>
          <table className="reg">
            <thead>
              <tr>
                <th style={{ width: 110 }}>Номер</th>
                <th>Документ</th>
                <th>Корреспондент</th>
                <th style={{ width: 110 }}>Поступил</th>
              </tr>
            </thead>
            <tbody>
              {data.sed.items.map((doc) => (
                <tr key={doc.id} style={{ cursor: "pointer" }} onClick={() => setSedDocId(doc.id)}>
                  <td className="num">{doc.number || doc.id}</td>
                  <td>
                    <div className="name">{doc.title || "—"}</div>
                    <div className="sub">{doc.kind || "—"}</div>
                  </td>
                  <td>{doc.correspondent || "—"}</td>
                  <td>{doc.regDate || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="sec">
        <div className="sec-head">
          <h2 className="sec-title">Уведомления</h2>
          <Link to="/notifications" className="sec-link">Все →</Link>
        </div>
        {data.unread.length === 0 && <div className="note" style={{ marginTop: 12 }}>Нет непрочитанных уведомлений</div>}
        {data.unread.length > 0 && (
          <div className="note" style={{ marginTop: 12 }}>
            {data.unread.slice(0, 3).map((n, i) => (
              <span key={n.id}>{i > 0 && " · "}{n.title}: {n.body}</span>
            ))}
          </div>
        )}
      </section>

      {sedDocId && <SedDocumentModal documentId={sedDocId} onClose={() => setSedDocId(null)} />}
    </div>
  );
}
