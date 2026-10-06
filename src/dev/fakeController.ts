import type { RoomController } from "@/hooks/useRoom";
import type { RoomPreview, RoomView } from "@/lib/types";

/**
 * A `RoomController` backed by a static snapshot — actions just log and resolve true.
 * Lets screens be developed/screenshotted without any backend (see `src/dev/fixtures.ts`).
 */
export function fakeController(data: RoomView | RoomPreview, overrides: Partial<RoomController> = {}): RoomController {
  const isPreview = "preview" in data;
  const act = (name: string) => async (...args: unknown[]) => {
    console.info(`[fake controller] ${name}`, ...args);
    return true;
  };
  return {
    code: data.code,
    loading: false,
    view: isPreview ? null : data,
    preview: isPreview ? data : null,
    error: null,
    connection: "live",
    busy: false,
    serverNow: () => Date.now(),
    join: act("join"),
    play: act("play"),
    call: act("call"),
    pass: act("pass"),
    resume: act("resume"),
    start: act("start"),
    addBot: act("addBot"),
    removePlayer: act("removePlayer"),
    setSpeed: act("setSpeed"),
    rematch: act("rematch"),
    leave: act("leave"),
    refresh: async () => undefined,
    ...overrides,
  };
}
