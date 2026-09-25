import type { ProcWorkflowMeta } from "../../lib/proc-workflow";

export type Brief = { id: string; fullName: string; position: string | null };

export type ProcDoc = {
  id: string;
  code: string;
  title: string;
  present: boolean;
  note: string | null;
  fileName: string | null;
  storedName: string | null;
};

export type ProcQuote = {
  id: string;
  supplierName: string;
  amount: string | null;
  fileName: string;
  createdAt: string;
};

export type ProcMemo = {
  id: string;
  addressee: string;
  addresseePosition?: string | null;
  addresseePositionDative?: string | null;
  addresseeFullName?: string | null;
  addresseeShortName?: string | null;
  addresseeDative?: string | null;
  letterheadKind?: string;
  body: string;
  agreedPosition: string;
  agreedFullName: string;
  fromUser: { fullName: string; position: string | null };
  compiledBy: { fullName: string; position: string | null };
  createdAt: string;
};

export type ProcPayment = {
  id: string;
  amount: string | null;
  paidAt: string | null;
  addressee: string;
  memoText: string | null;
  note: string | null;
  files: { id: string; fileName: string }[];
  createdBy: { fullName: string } | null;
};

export type Proc = {
  id: string;
  serialNo: number;
  createdAt: string;
  title: string;
  law: string;
  method: string;
  category: string;
  status: string;
  description: string | null;
  estimatedAmount: string | null;
  contractNumber: string | null;
  contractDate: string | null;
  contractAmount: string | null;
  deliveryUntil: string | null;
  acceptanceStartAt: string | null;
  acceptanceDueAt: string | null;
  contractDeptNote: string | null;
  publishedAt: string | null;
  biddingStartAt: string | null;
  biddingEndAt: string | null;
  supervisorApprovedAt: string | null;
  directorApprovedAt: string | null;
  supervisorApprovedBy: Brief | null;
  directorApprovedBy: Brief | null;
  selectedQuoteId: string | null;
  contractFileName: string | null;
  contractStoredName: string | null;
  executorName: string | null;
  executorUserId: string | null;
  performanceDays: number | null;
  acceptanceDays: number | null;
  actualDeliveryAt: string | null;
  validUntil: string | null;
  contractKind: "renewable" | "onetime" | null;
  contractComment: string | null;
  fromArchive: boolean;
  parseWarnings?: string[];
  workflow?: ProcWorkflowMeta;
  department: { id: string; name: string };
  initiator: { fullName: string };
  documents: ProcDoc[];
  quotes: ProcQuote[];
  payments?: ProcPayment[];
  memos: ProcMemo[];
};

export type ProcDates = {
  contractNumber: string;
  contractDate: string;
  contractAmount: string;
  deliveryUntil: string;
  acceptanceStartAt: string;
  acceptanceDueAt: string;
  contractDeptNote: string;
  publishedAt: string;
  biddingStartAt: string;
  biddingEndAt: string;
  validUntil: string;
  actualDeliveryAt: string;
  executorName: string;
  executorUserId: string;
  performanceDays: string;
  acceptanceDays: string;
  contractKind: string;
  contractComment: string;
  estimatedAmount: string;
  title: string;
};
