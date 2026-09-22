export type ToastKind = "error" | "ok" | "warn";
export type ToastItem = { id: number; message: string; kind: ToastKind };

const listeners = new Set<(items: ToastItem[]) => void>();
let items: ToastItem[] = [];
let seq = 1;

function emit() {
  for (const l of listeners) l(items);
}

export function toast(message: string, kind: ToastKind = "error") {
  const id = seq++;
  items = [...items, { id, message, kind }];
  emit();
  window.setTimeout(() => dismissToast(id), 6000);
}

export function dismissToast(id: number) {
  items = items.filter((t) => t.id !== id);
  emit();
}

export function subscribeToasts(fn: (items: ToastItem[]) => void) {
  listeners.add(fn);
  fn(items);
  return () => {
    listeners.delete(fn);
  };
}
