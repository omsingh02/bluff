import { useParams, useNavigate } from "react-router-dom";
import { useGame } from "@/contexts/GameContext";
import { useEffect } from "react";
import { motion } from "framer-motion";
import { OpponentBar } from "@/components/game/OpponentBar";
import { CenterPile } from "@/components/game/CenterPile";
import { BluffButton } from "@/components/game/BluffButton";
import { PlayerHand } from "@/components/game/PlayerHand";
import { VictoryModal } from "@/components/game/VictoryModal";
import { AllCardsModal } from "@/components/game/AllCardsModal";
import { useState } from "react";

const GameRoom = () => {
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const {
    gameState, currentPlayerId, isMyTurn, isBluffWindow,
    myPlayer, playCards, callBluff, resetGame, loading
  } = useGame();
  const [showAllCards, setShowAllCards] = useState(false);

  const game = useGame() as any;
  useEffect(() => {
    if (!gameState && roomCode && game.reconnectToRoom) {
      game.reconnectToRoom(roomCode);
    }
  }, [roomCode]);

  if (!gameState || gameState.roomCode !== roomCode) {
    return (
      <div className="h-[100dvh] flex items-center justify-center px-5">
        <p className="text-muted-foreground">
          {loading ? "Loading game..." : <>Game not found. <button onClick={() => navigate("/")} className="text-primary underline">Go back</button></>}
        </p>
      </div>
    );
  }

  const currentTurnPlayer = gameState.players[gameState.currentTurnIndex];
  const winner = gameState.winnerId ? gameState.players.find(p => p.id === gameState.winnerId) : null;

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden">
      {/* Opponents */}
      <OpponentBar
        players={gameState.players}
        currentPlayerId={currentPlayerId}
        currentTurnIndex={gameState.currentTurnIndex}
      />

      {/* Turn indicator */}
      <div className="text-center py-1.5 shrink-0">
        <motion.p
          key={currentTurnPlayer?.id}
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-xs sm:text-sm text-muted-foreground"
        >
          {isMyTurn ? (
            <span className="text-primary font-bold text-glow-purple">Your turn — play your cards!</span>
          ) : (
            <span>{currentTurnPlayer?.nickname}'s turn</span>
          )}
        </motion.p>
      </div>

      {/* Center area */}
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-3 px-4">
        <CenterPile
          pileCount={gameState.centerPile.length}
          claimedRank={gameState.claimedRank}
          lastPlayedCount={gameState.lastPlayedCount}
        />
        <BluffButton
          isActive={isBluffWindow}
          timerEnd={gameState.bluffTimerEnd}
          onCallBluff={callBluff}
        />
      </div>

      {/* Player's hand */}
      <div className="shrink-0 border-t border-border bg-card/80 backdrop-blur-md pb-safe">
        <div className="flex items-center justify-between px-4 py-1.5">
          <span className="text-[11px] sm:text-xs text-muted-foreground font-medium">Your Hand</span>
          <button 
            onClick={() => setShowAllCards(true)}
            className="text-[11px] sm:text-xs font-mono text-primary font-bold hover:underline active:scale-95 transition-transform"
          >
            {myPlayer?.hand.length ?? 0} cards (View All)
          </button>
        </div>
        {myPlayer && (
          <PlayerHand
            cards={myPlayer.hand}
            isMyTurn={isMyTurn}
            onPlayCards={playCards}
          />
        )}
      </div>

      {/* Victory */}
      {winner && (
        <VictoryModal
          winnerName={winner.nickname}
          isMe={winner.id === currentPlayerId}
          onPlayAgain={() => { resetGame(); navigate("/"); }}
        />
      )}

      {/* Grid View Modal */}
      {myPlayer && (
        <AllCardsModal 
          isOpen={showAllCards} 
          onClose={() => setShowAllCards(false)} 
          cards={myPlayer.hand} 
        />
      )}
    </div>
  );
};

export default GameRoom;
