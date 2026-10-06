import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { DoorOpen, Home, RefreshCw, Terminal, WifiOff, type LucideIcon } from "lucide-react";
import { Logo } from "@/components/shell/Logo";
import { Button } from "@/components/ui/button";
import type { RoomController } from "@/hooks/useRoom";
import type { ApiError } from "@/lib/api";

interface Copy {
  icon: LucideIcon;
  tone: string;
  title: string;
  body: ReactNode;
  retry: boolean;
}

function copyFor(error: ApiError): Copy {
  switch (error.code) {
    case "room_not_found":
      return {
        icon: DoorOpen,
        tone: "bg-primary/15 text-primary",
        title: "This room doesn't exist anymore",
        body: "It may have closed after everyone left, or the code has a typo. Double-check it, or start a fresh game.",
        retry: false,
      };
    case "setup":
      return {
        icon: Terminal,
        tone: "bg-gold/15 text-gold",
        title: "The game server isn't ready yet",
        body: (
          <>
            The database migration hasn&apos;t been applied to this Supabase project. Run{" "}
            <code className="whitespace-nowrap rounded-md bg-white/[0.08] px-1.5 py-0.5 font-mono text-[12.5px] text-foreground">supabase db push</code>
            , then reload.
          </>
        ),
        retry: true,
      };
    default:
      return {
        icon: WifiOff,
        tone: "bg-bluff/15 text-bluff",
        title: "Can't reach the table",
        body: "Check your connection and try again — your seat is saved.",
        retry: true,
      };
  }
}

/** Fatal load errors for a room: gone, backend not set up, or unreachable on first load. */
export function RoomError({ room, error }: { room: RoomController; error: ApiError }) {
  const navigate = useNavigate();
  const c = copyFor(error);
  return (
    <main className="grid min-h-dvh grid-cols-[minmax(0,1fr)] place-items-center px-4 py-8 safe-pt safe-pb" data-testid="room-error" data-error={error.code}>
      <motion.div
        initial={{ opacity: 0, y: 22, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 380, damping: 28 }}
        className="glass-strong w-full max-w-md rounded-3xl p-7 text-center sm:p-8"
      >
        <Logo size="sm" className="mx-auto" />
        <span className={`mx-auto mt-8 grid h-16 w-16 place-items-center rounded-2xl ${c.tone}`}>
          <c.icon className="h-8 w-8" aria-hidden />
        </span>
        <h1 className="mt-5 font-display text-2xl font-bold leading-tight tracking-tight">{c.title}</h1>
        <p className="mx-auto mt-2 max-w-xs text-sm text-muted">{c.body}</p>
        <div className="mt-7 flex flex-col gap-2.5">
          <Button size="lg" onClick={() => navigate("/")} variant={c.retry ? "secondary" : "primary"}>
            <Home className="h-4 w-4" aria-hidden />
            Back to start
          </Button>
          {c.retry && (
            <Button
              size="lg"
              data-testid="room-retry"
              // A fatal "setup" error stops the sync loop for good, so a full reload is the only reliable retry.
              onClick={() => (error.code === "setup" ? window.location.reload() : void room.refresh())}
            >
              <RefreshCw className="h-4 w-4" aria-hidden />
              Try again
            </Button>
          )}
        </div>
      </motion.div>
    </main>
  );
}
