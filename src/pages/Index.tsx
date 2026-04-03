import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useGame } from "@/contexts/GameContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sparkles, Users } from "lucide-react";
import { toast } from "sonner";

const Index = () => {
  const { nickname, setNickname, createGame, joinGame, loading } = useGame();
  const navigate = useNavigate();
  const [showJoin, setShowJoin] = useState(false);
  const [roomCode, setRoomCode] = useState("");
  const [error, setError] = useState("");

  const handleCreate = async () => {
    if (!nickname.trim()) return;
    try {
      const code = await createGame();
      navigate(`/lobby/${code}`);
    } catch {
      toast.error("Failed to create game");
    }
  };

  const handleJoin = async () => {
    if (!nickname.trim() || !roomCode.trim()) return;
    const ok = await joinGame(roomCode.toUpperCase());
    if (ok) navigate(`/lobby/${roomCode.toUpperCase()}`);
    else setError("Room not found or full");
  };

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center px-5 py-6 relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute inset-0 pointer-events-none select-none">
        <motion.div animate={{ y: [0, -20, 0], rotate: [0, 5, 0] }} transition={{ repeat: Infinity, duration: 6 }} className="absolute top-[12%] left-[5%] text-primary/15 text-5xl sm:text-6xl">♠</motion.div>
        <motion.div animate={{ y: [0, 20, 0], rotate: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 7, delay: 1 }} className="absolute top-[20%] right-[8%] text-red-500/15 text-4xl sm:text-5xl">♥</motion.div>
        <motion.div animate={{ y: [0, -15, 0], rotate: [0, 8, 0] }} transition={{ repeat: Infinity, duration: 5, delay: 2 }} className="absolute bottom-[25%] left-[10%] text-red-500/15 text-3xl sm:text-4xl">♦</motion.div>
        <motion.div animate={{ y: [0, 15, 0], rotate: [0, -8, 0] }} transition={{ repeat: Infinity, duration: 8, delay: 0.5 }} className="absolute bottom-[15%] right-[12%] text-primary/15 text-4xl sm:text-5xl">♣</motion.div>
      </div>

      {/* Title */}
      <motion.div
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200 }}
        className="text-center mb-8 sm:mb-10"
      >
        <h1 className="text-5xl sm:text-6xl md:text-7xl font-black text-primary text-glow-purple tracking-tight">
          BLUFF
        </h1>
        <p className="text-muted-foreground mt-2 text-xs sm:text-sm tracking-widest uppercase">
          The Ultimate Card Game
        </p>
      </motion.div>

      {/* Form */}
      <motion.div
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="w-full max-w-sm space-y-3"
      >
        <Input
          placeholder="Enter your nickname..."
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={16}
          className="bg-card border-border text-center text-lg h-12 placeholder:text-muted-foreground/50"
        />

        <Button
          onClick={handleCreate}
          disabled={!nickname.trim() || loading}
          className="w-full h-12 bg-primary hover:bg-primary/90 glow-purple font-bold text-base active:scale-[0.97] transition-transform"
        >
          <Sparkles className="w-5 h-5 mr-2" />
          {loading ? "Creating..." : "Create New Game"}
        </Button>

        <Button
          onClick={() => setShowJoin(!showJoin)}
          disabled={!nickname.trim()}
          variant="outline"
          className="w-full h-12 border-secondary text-secondary hover:bg-secondary/10 font-bold text-base active:scale-[0.97] transition-transform"
        >
          <Users className="w-5 h-5 mr-2" />
          Join Game
        </Button>

        <AnimatePresence>
          {showJoin && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden space-y-3"
            >
              <Input
                placeholder="Room code (e.g. AB12)"
                value={roomCode}
                onChange={(e) => { setRoomCode(e.target.value.toUpperCase()); setError(""); }}
                maxLength={4}
                className="bg-card border-border text-center text-lg h-12 tracking-[0.3em] font-mono uppercase"
              />
              {error && <p className="text-destructive text-sm text-center">{error}</p>}
              <Button
                onClick={handleJoin}
                disabled={!roomCode.trim() || loading}
                className="w-full h-12 bg-secondary hover:bg-secondary/90 glow-green font-bold text-base active:scale-[0.97] transition-transform"
              >
                {loading ? "Joining..." : "Join Room"}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

export default Index;
