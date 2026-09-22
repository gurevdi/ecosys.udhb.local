import { useEffect, useState } from "react";
import { dismissToast, subscribeToasts, type ToastItem } from "../lib/toast";

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => {
    return subscribeToasts(setItems);
  }, []);
  if (!items.length) return null;
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast toast--${t.kind}`}>
          <p>{t.message}</p>
          <button type="button" className="toast-close" onClick={() => dismissToast(t.id)} aria-label="Закрыть">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
