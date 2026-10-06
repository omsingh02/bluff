import { useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Home, RefreshCw, Swords, UserX, Users, type LucideIcon } from "lucide-react";
import { Logo } from "@/components/shell/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { RoomController } from "@/hooks/useRoom";
import { getName } from "@/lib/session";
import { MAX_NAME, type RoomPreview } from "@/lib/types";
import { cleanName, isValidName, NAME_HINT, useDocumentTitle } from "./helpers";

const BLOCKED: Record<"started" | "full" | "banned", { icon: LucideIcon; title: string; body: (host: string) => string; canRetry: boolean }> = {
  started: {
    icon: Swords,
    title: "This game already started",
    body: (host) => `${host} is mid-game. You can jump in once they're back in the lobby for the next round.`,
    canRetry: true,
  },
  full: {
    icon: Users,
    title: "This room is full",
    body: (host) => `Every seat is taken. Ask ${host} to free one up.`,
    canRetry: true,
  },
  banned: {
    icon: UserX,
    title: "You were removed from this room",
    body: (host) => `${host} removed you from this game, so you can't rejoin it.`,
    canRetry: false,
  },
};

/** What someone sees when they open a room link but aren't in the room yet. */
export function JoinPanel({ room, preview }: { room: RoomController; preview: RoomPreview }) {
  const navigate = useNavigate();
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setNameValue] = useState(() => getName());
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  useDocumentTitle(`Join ${preview.code} · Liar's Hand`);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (joining) return;
    const clean = cleanName(name);
    if (!isValidName(clean)) {
      setError(NAME_HINT);
      nameRef.current?.focus();
      return;
    }
    setError(null);
    setJoining(true);
    const ok = await room.join(clean);
    if (!ok) setJoining(false); // on success the room view replaces this screen
  }

  const blocked = preview.joinable ? null : BLOCKED[preview.reason ?? "started"];

  return (
    <main className="grid min-h-dvh grid-cols-[minmax(0,1fr)] place-items-center px-4 py-8 safe-pt safe-pb" data-testid="join-panel">
      <motion.div
        initial={{ opacity: 0, y: 22, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 380, damping: 28 }}
        className="relative w-full max-w-md"
      >
        <div aria-hidden className="absolute -inset-3 -z-10 rounded-[2.4rem] bg-gradient-to-br from-primary/25 via-transparent to-accent/25 blur-2xl" />
        <div className="glass-strong relative overflow-hidden rounded-3xl p-6 sm:p-8">
          <div aria-hidden className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-primary to-transparent" />
          <Logo size="sm" />

          {blocked ? (
            <div className="mt-8 text-center">
              <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-bluff/15 text-bluff">
                <blocked.icon className="h-8 w-8" aria-hidden />
              </span>
              <h1 className="mt-5 font-display text-2xl font-bold leading-tight tracking-tight" data-testid="join-blocked">
                {blocked.title}
              </h1>
              <p className="mx-auto mt-2 max-w-xs text-sm text-muted">{blocked.body(preview.host)}</p>
              <div className="mt-7 flex flex-col gap-2.5">
                <Button size="lg" onClick={() => navigate("/")}>
                  <Home className="h-4 w-4" aria-hidden />
                  Back to start
                </Button>
                {blocked.canRetry && (
                  <Button size="lg" variant="secondary" onClick={() => void room.refresh()}>
                    <RefreshCw className="h-4 w-4" aria-hidden />
                    Check again
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <form onSubmit={submit} noValidate className="mt-7">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold">You&apos;re invited</p>
              <h1 className="mt-1.5 break-words font-display text-[1.7rem] font-extrabold leading-tight tracking-tight sm:text-3xl">
                Join <span className="brand-gradient-text">{preview.host}</span>&apos;s game
              </h1>

              <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
                <span className="glass inline-flex items-center gap-2 rounded-full px-3.5 py-1.5">
                  <span className="text-xs text-muted">Room</span>
                  <span className="font-display font-bold tracking-[0.25em]" data-testid="join-room-code">
                    {preview.code}
                  </span>
                </span>
                <span className="glass inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 tabular-nums" data-testid="join-count">
                  <Users className="h-4 w-4 text-trust" aria-hidden />
                  {preview.count}/{preview.max} players
                </span>
              </div>

              <label htmlFor="join-name" className="mb-1.5 mt-6 block text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                Your name
              </label>
              <Input
                id="join-name"
                ref={nameRef}
                data-testid="join-name-input"
                value={name}
                maxLength={MAX_NAME}
                placeholder="What should we call you?"
                autoComplete="nickname"
                autoCapitalize="words"
                spellCheck={false}
                enterKeyHint="go"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "join-name-error" : undefined}
                onChange={(e) => {
                  setNameValue(e.target.value);
                  if (error) setError(null);
                }}
              />
              {error && (
                <p id="join-name-error" role="alert" className="mt-1.5 text-sm text-bluff">
                  {error}
                </p>
              )}

              <Button type="submit" size="lg" className="mt-5 w-full" loading={joining || room.busy} data-testid="join-confirm">
                Join the table
                <ArrowRight className="h-5 w-5" aria-hidden />
              </Button>
              <Button type="button" variant="ghost" size="md" className="mt-2 w-full" onClick={() => navigate("/")}>
                Not now
              </Button>
            </form>
          )}
        </div>
      </motion.div>
    </main>
  );
}
