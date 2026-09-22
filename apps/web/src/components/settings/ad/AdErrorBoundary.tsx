import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode; onRetry?: () => void };
type State = { error: Error | null };

/** Ловит ошибки рендера панели AD вместо белого экрана */
export class AdErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("AdSettingsPanel:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="card" style={{ padding: 24 }}>
          <h3 style={{ marginTop: 0 }}>Ошибка интерфейса Active Directory</h3>
          <p className="error">{this.state.error.message}</p>
          <button
            type="button"
            className="btn"
            onClick={() => {
              this.setState({ error: null });
              this.props.onRetry?.();
            }}
          >
            Повторить
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
