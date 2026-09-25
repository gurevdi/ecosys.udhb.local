import { Link } from "react-router-dom";
import { CATEGORY, canDeleteContracts, money, procIdentity, STATUS } from "../../api";
import { DeleteButton } from "../DeleteButton";
import { HistoryButton } from "../HistoryButton";
import type { Me } from "../../App";
import type { Proc } from "./procTypes";

export function ProcCardHeader({
  p,
  me,
  readOnly,
  docsReady,
  docsTotal,
  onHistory,
  onDelete,
}: {
  p: Proc;
  me: Me["user"] | null;
  readOnly: boolean;
  docsReady: number;
  docsTotal: number;
  onHistory: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="proc-head">
      <div className="crumbs proc-crumbs">
        <span className="proc-crumbs-main">
          <Link to="/procurements">← Реестр</Link>
          <span className="proc-crumbs-sep">·</span>
          <strong>{procIdentity(p.serialNo, p.createdAt)}</strong>
          <span className="proc-crumbs-sep">·</span>
          <span className="st st--work">{STATUS[p.status] || p.status}</span>
          {readOnly && <span className="st st--muted">только просмотр</span>}
        </span>
        <span className="crumbs-actions">
          <a className="btn ghost btn-sm" href={`/api/procurements/${p.id}/archive`} title="Скачать все файлы">
            Архив
          </a>
          <HistoryButton onClick={onHistory} />
          {me && canDeleteContracts(me, p.department.id) && <DeleteButton onClick={onDelete} title="Удалить закупку" />}
        </span>
      </div>
      <p className="proc-meta">
        <span className="proc-meta-title">{p.title}</span>
        <span className="proc-meta-bits">
          {(CATEGORY[p.category] || p.category).toLowerCase()}
          {" · "}
          {p.department.name}
          {p.executorName ? ` · ${p.executorName}` : ""}
          {" · "}
          {money(p.contractAmount || p.estimatedAmount)}
          {" · "}
          {p.quotes.length} КП
          {" · "}
          док. {docsReady}/{docsTotal}
          {p.performanceDays != null ? ` · ${p.performanceDays} дн.` : ""}
        </span>
      </p>
    </div>
  );
}
