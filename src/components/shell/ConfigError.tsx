import { Terminal } from "lucide-react";
import { Logo } from "./Logo";

const Code = ({ children }: { children: string }) => (
  <code className="rounded-md bg-white/[0.07] px-1.5 py-0.5 font-mono text-[12.5px] text-primary-foreground/90">{children}</code>
);

/** Shown instead of the app when the Supabase environment variables are missing. */
export function ConfigError() {
  return (
    <main className="grid min-h-dvh grid-cols-[minmax(0,1fr)] place-items-center px-4 py-10 safe-pt safe-pb" data-testid="config-error">
      <div className="glass-strong w-full max-w-lg rounded-3xl p-6 sm:p-8">
        <Logo size="md" />
        <h1 className="mt-6 font-display text-2xl font-bold leading-tight tracking-tight">
          One more step: connect your <span className="brand-gradient-text">Supabase</span> project
        </h1>
        <p className="mt-2 text-sm text-muted">
          The game needs its backend, but the app can&apos;t find the connection settings.
        </p>

        <ol className="mt-5 space-y-3 text-sm">
          <li className="flex gap-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/20 font-display text-xs text-primary">1</span>
            <span>
              Copy <Code>.env.example</Code> to <Code>.env.local</Code>.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/20 font-display text-xs text-primary">2</span>
            <span>
              Set <Code>VITE_SUPABASE_URL</Code> and <Code>VITE_SUPABASE_PUBLISHABLE_KEY</Code> (Supabase dashboard →
              Project Settings → API).
            </span>
          </li>
          <li className="flex gap-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/20 font-display text-xs text-primary">3</span>
            <span>
              Apply the game database: <Code>supabase db push</Code>
            </span>
          </li>
          <li className="flex gap-3">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/20 font-display text-xs text-primary">4</span>
            <span>
              Restart the dev server (or redeploy, if you set the variables on your host).
            </span>
          </li>
        </ol>

        <p className="mt-6 flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 font-mono text-xs text-muted">
          <Terminal className="h-4 w-4 shrink-0 text-trust" aria-hidden />
          npm run dev
        </p>
      </div>
    </main>
  );
}
