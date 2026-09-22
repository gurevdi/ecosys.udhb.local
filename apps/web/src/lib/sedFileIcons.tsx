import type { SedDocumentFile } from "./sedFiles";
import { sedFileKindClass } from "./sedFiles";

type IconProps = { className?: string };

export function SedFileTypeIcon({ file, className }: { file: SedDocumentFile; className?: string }) {
  const kind = sedFileKindClass(file);
  switch (kind) {
    case "pdf":
      return <IconPdf className={className} />;
    case "doc":
      return <IconDoc className={className} />;
    case "xls":
      return <IconSheet className={className} />;
    case "img":
      return <IconImage className={className} />;
    case "ppt":
      return <IconSlide className={className} />;
    case "zip":
      return <IconArchive className={className} />;
    default:
      return <IconFile className={className} />;
  }
}

export function IconDownload({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M8 2v7m0 0L5.5 6.5M8 9l2.5-2.5M3 11v1.5A1.5 1.5 0 0 0 4.5 14h7a1.5 1.5 0 0 0 1.5-1.5V11"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconPreview({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8s-2.5 4.5-6.5 4.5S1.5 8 1.5 8Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <circle cx="8" cy="8" r="2" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

export function IconArchive({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M3 4.5h10v7a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 11.5v-7Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path d="M6 2.5h4v2H6v-2Z" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M6.5 8h3M6.5 10h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function IconPdf({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4.5 2.5h4.2L12.5 6v7.5H4.5V2.5Z" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M8.5 2.5V6H12.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <text x="5.2" y="12" fontSize="4.5" fontWeight="700" fill="currentColor">
        PDF
      </text>
    </svg>
  );
}

function IconDoc({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4.5 2.5h4.2L12.5 6v7.5H4.5V2.5Z" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M8.5 2.5V6H12.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M6 9h4M6 11h3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
    </svg>
  );
}

function IconSheet({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3.5 3.5h9v9h-9v-9Z" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M3.5 6.5h9M3.5 9.5h9M6.5 3.5v9M9.5 3.5v9" stroke="currentColor" strokeWidth="0.9" opacity="0.7" />
    </svg>
  );
}

function IconImage({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3.5 4.5h9v7h-9v-7Z" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="6" cy="7" r="1" fill="currentColor" />
      <path d="M4.5 11l2.2-2.2 1.8 1.8 1.5-2 2.5 2.4" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconSlide({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3.5 4.5h9v7h-9v-7Z" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5.5 11.5h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function IconFile({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4.5 2.5h4.2L12.5 6v7.5H4.5V2.5Z" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M8.5 2.5V6H12.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
