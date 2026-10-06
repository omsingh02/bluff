import { Component, type ErrorInfo, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "./Logo";

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/**
 * Last line of defence: a render crash anywhere shows a friendly screen instead of a blank page.
 * It sits outside the router, so "Home" is a plain anchor.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled UI error:", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <main className="grid min-h-dvh grid-cols-[minmax(0,1fr)] place-items-center px-4 py-10 safe-pt safe-pb" role="alert" data-testid="error-boundary">
        <div className="glass-strong w-full max-w-md rounded-3xl p-7 text-center">
          <Logo size="md" className="mx-auto" />
          <p className="mt-7 text-5xl" aria-hidden>
            🃏
          </p>
          <h1 className="mt-3 font-display text-2xl font-bold tracking-tight">The deck got knocked over</h1>
          <p className="mt-2 text-sm text-muted">Something unexpected broke. Reload to reshuffle — your seat is saved.</p>
          {import.meta.env.DEV && (
            <pre className="mt-4 max-h-32 overflow-auto rounded-xl bg-black/40 p-3 text-left text-xs text-bluff">{error.message}</pre>
          )}
          <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
            <Button size="lg" onClick={() => window.location.reload()}>
              <RotateCcw className="h-4 w-4" aria-hidden />
              Reload
            </Button>
            <Button size="lg" variant="secondary" onClick={() => window.location.assign("/")}>
              Back to start
            </Button>
          </div>
        </div>
      </main>
    );
  }
}
