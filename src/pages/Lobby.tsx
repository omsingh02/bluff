import { useParams, useNavigate } from "react-router-dom";
import { useGame } from "@/contexts/GameContext";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Copy, Play, UserPlus, Crown, Check } from "lucide-react";
import { useState, useEffect } from "react";

const Lobby = () => {
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const { gameState, currentPlayerId, addBot, startGame, loading } = useGame();
  const [copied, setCopied] = useState(false);

  const game = useGame() as any;
  useEffect(() => {
    if (!gameState && roomCode && game.reconnectToRoom) {
      game.reconnectToRoom(roomCode);
    }
  }, [roomCode]);

  useEffect(() => {
    if (gameState?.status === "playing" || gameState?.status === "bluff_window") {
      navigate(`/game/${roomCode}`);
    }
  }, [gameState?.status, roomCode, navigate]);

  if (!gameState || gameState.roomCode !== roomCode) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center px-5">
        <p className="text-muted-foreground">
          {loading ? "Loading room..." : <>Room not found. <button onClick={() => navigate("/")} className="text-primary underline">Go back</button></>}
        </p>
      </div>
    );
  }

  const isHost = gameState.players.find(p => p.id === currentPlayerId)?.isHost;
  const canStart = isHost && gameState.players.length >= 2;

  const copyCode = () => {
    navigator.clipboard.writeText(gameState.roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleStart = async () => {
    await startGame();
  };

  return (
    <div className="min-h-[100dvh] flex flex-col items-center px-5 pt-10 pb-6 sm:pt-12">
      <motion.div initial={{ y: -30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="text-center mb-6 sm:mb-8">
        <p className="text-sm text-muted-foreground uppercase tracking-widest mb-2">Room Code</p>
        <button onClick={copyCode} className="group flex items-center gap-2 mx-auto active:scale-95 transition-transform">
          <span className="text-3xl sm:text-4xl font-black tracking-[0.3em] text-primary text-glow-purple font-mono">
            {gameState.roomCode}
          </span>
          {copied ? <Check className="w-5 h-5 text-secondary" /> : <Copy className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />}
        </button>
        <p className="text-xs text-muted-foreground mt-2">Share this code with friends to join!</p>
      </motion.div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="w-full max-w-sm space-y-2.5 mb-6 sm:mb-8">
        <p className="text-sm text-muted-foreground">
          Players ({gameState.players.length}/6)
        </p>
        {gameState.players.map((player, i) => (
          <motion.div
            key={player.id}
            initial={{ x: -30, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: i * 0.1 }}
            className="flex items-center gap-3 bg-card border border-border rounded-xl p-3"
          >
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-primary/20 border-2 border-primary flex items-center justify-center text-xs sm:text-sm font-bold text-primary shrink-0">
              {player.nickname.slice(0, 2).toUpperCase()}
            </div>
            <span className="font-medium text-foreground flex-1 truncate">{player.nickname}</span>
            {player.isHost && <Crown className="w-4 h-4 text-yellow-500 shrink-0" />}
            {player.id === currentPlayerId && (
              <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full shrink-0">You</span>
            )}
          </motion.div>
        ))}
      </motion.div>

      <div className="w-full max-w-sm space-y-3 mt-auto">
        {isHost && gameState.players.length < 6 && (
          <Button onClick={addBot} variant="outline" className="w-full border-border active:scale-[0.97] transition-transform">
            <UserPlus className="w-4 h-4 mr-2" />
            Add Bot Player
          </Button>
        )}
        {isHost && (
          <Button
            onClick={handleStart}
            disabled={!canStart}
            className="w-full h-12 bg-secondary hover:bg-secondary/90 glow-green font-bold text-base active:scale-[0.97] transition-transform"
          >
            <Play className="w-5 h-5 mr-2" />
            Start Game {!canStart && "(Need 2+ players)"}
          </Button>
        )}
      </div>
    </div>
  );
};

export default Lobby;
