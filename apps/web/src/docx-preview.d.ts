declare module "docx-preview" {
  export function renderAsync(
    data: Blob | ArrayBuffer | Uint8Array,
    bodyContainer: HTMLElement,
    styleContainer?: HTMLElement | null,
    options?: {
      className?: string;
      inWrapper?: boolean;
      ignoreWidth?: boolean;
      ignoreHeight?: boolean;
      breakPages?: boolean;
    },
  ): Promise<void>;
}
