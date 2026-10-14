import { type CSSProperties, Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches an error thrown while rendering any screen, so a broken component shows a message
 * and a Reload button instead of a blank page. Errors in event handlers and promises don't
 * reach it (see the unhandledrejection listener in main.tsx).
 */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("The game crashed while rendering", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <main style={styles.page} role="alert">
        <section className="glass" style={styles.card}>
          <h1 style={styles.title}>Something went wrong</h1>
          <p style={styles.text}>The game ran into an error it couldn't recover from. Reloading usually fixes it.</p>
          <pre style={styles.detail}>{error.message || String(error)}</pre>
          <button className="primary" style={styles.button} onClick={() => location.reload()}>
            Reload
          </button>
        </section>
      </main>
    );
  }
}

const styles = {
  page: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    padding: "1.5rem 1rem",
    background: "var(--bg)",
  },
  card: {
    width: "min(26rem, 100%)",
    padding: "1.6rem 1.5rem",
    borderRadius: "var(--radius)",
    display: "flex",
    flexDirection: "column",
    gap: "0.9rem",
  },
  title: { fontSize: "1.4rem" },
  text: { margin: 0, color: "var(--ink-70)" },
  detail: {
    margin: 0,
    padding: "0.7rem 0.9rem",
    borderRadius: "12px",
    background: "var(--ink-06)",
    color: "var(--ink-70)",
    fontSize: "0.8rem",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    maxHeight: "9rem",
    overflow: "auto",
  },
  button: { alignSelf: "flex-start" },
} satisfies Record<string, CSSProperties>;
