import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render errors so a single broken component shows a message the user
 * can act on instead of a blank page.
 *
 * Must stay a class component: React exposes no hook equivalent of
 * componentDidCatch.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled render error:", error, info.componentStack);
  }

  handleReload = () => {
    this.setState({ error: null });
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-xl font-semibold">This page stopped working</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Your data is safe — nothing was saved or changed. Reloading usually
          clears it.
        </p>
        <pre className="max-w-full overflow-x-auto rounded border border-border bg-muted p-3 text-left text-xs">
          {error.message}
        </pre>
        <button
          onClick={this.handleReload}
          className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Reload
        </button>
      </div>
    );
  }
}
