import { useParams } from "react-router-dom";
import { useRoom } from "@/hooks/useRoom";
import { CODE_LENGTH } from "@/lib/types";
import { normalizeCode } from "@/lib/utils";
import { NotFound } from "./NotFound";
import { RoomScreens } from "./RoomScreens";

/** `/r/:code` — the room link people share. */
export function RoomPage() {
  const { code = "" } = useParams();
  // A malformed code can never be a room: skip the network round-trip.
  if (normalizeCode(code).length !== CODE_LENGTH) return <NotFound />;
  return <ValidRoom code={code} />;
}

function ValidRoom({ code }: { code: string }) {
  const room = useRoom(code);
  return <RoomScreens room={room} />;
}
