import { ConnectionBanner } from "@/components/shell/ConnectionBanner";
import { Splash } from "@/components/shell/Splash";
import { GameScreen } from "@/components/game/GameScreen";
import type { RoomController } from "@/hooks/useRoom";
import { GameOver } from "./GameOver";
import { JoinPanel } from "./JoinPanel";
import { Lobby } from "./Lobby";
import { RoomError } from "./RoomError";

/**
 * THE switch for a room: decides which screen to show from the controller's state.
 * Deliberately free of routing/hook logic so the dev harness can feed it a fake controller.
 */
export function RoomScreens({ room }: { room: RoomController }) {
  return (
    <>
      <ConnectionBanner offline={room.connection === "offline"} />
      <Screen room={room} />
    </>
  );
}

function Screen({ room }: { room: RoomController }) {
  if (room.error) return <RoomError room={room} error={room.error} />;
  if (room.loading) return <Splash />;
  if (room.preview) return <JoinPanel room={room} preview={room.preview} />;

  const view = room.view;
  if (!view) return <Splash />;

  switch (view.status) {
    case "lobby":
      return <Lobby room={room} view={view} />;
    case "finished":
      return <GameOver room={room} view={view} />;
    case "turn":
    case "challenge":
    case "reveal":
      return <GameScreen room={room} />;
    default:
      return <Splash />;
  }
}
