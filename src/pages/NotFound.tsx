import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDocumentTitle } from "./helpers";

export function NotFound() {
  const navigate = useNavigate();
  useDocumentTitle("Wrong table · Liar's Hand");
  return (
    <main className="grid min-h-dvh grid-cols-[minmax(0,1fr)] place-items-center px-4 py-8 text-center safe-pt safe-pb" data-testid="not-found">
      <motion.div
        initial={{ opacity: 0, y: 22 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 380, damping: 28 }}
        className="flex max-w-sm flex-col items-center"
      >
        <p
          aria-hidden
          className="brand-gradient-text animate-float font-display text-[7rem] font-black leading-none tracking-tight drop-shadow-[0_0_30px_hsl(var(--primary)/0.4)]"
        >
          404
        </p>
        <h1 className="mt-4 font-display text-2xl font-bold tracking-tight">Wrong table</h1>
        <p className="mt-2 text-sm text-muted">Nothing is being dealt here. The page you&apos;re after doesn&apos;t exist.</p>
        <Button size="lg" className="mt-7" onClick={() => navigate("/")}>
          <Home className="h-4 w-4" aria-hidden />
          Back to start
        </Button>
      </motion.div>
    </main>
  );
}
