import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fixture } from "@/dev/fixtures";
import { api, ApiError } from "@/lib/api";
import { RoomSync } from "@/lib/roomSync";
import type { RoomView } from "@/lib/types";
import { toast } from "sonner";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    api: {
      getState: vi.fn(),
      play: vi.fn(),
      call: vi.fn(),
      pass: vi.fn(),
      joinRoom: vi.fn(),
      leave: vi.fn(),
    },
  };
});
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn() }) }));

const getState = vi.mocked(api.getState);
const view = (over: Partial<RoomView> = {}): RoomView => ({ ...(fixture("turn-theirs", Date.now()) as RoomView), ...over });

let sync: RoomSync;
const flush = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_800_000_000_000);
  vi.stubGlobal("document", { visibilityState: "visible", addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal("window", {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    location: { search: "" },
    localStorage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
  });
  vi.clearAllMocks();
  sync = new RoomSync("K7QXM2", "t".repeat(48));
});

afterEach(() => {
  sync.stop();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("RoomSync", () => {
  it("loads the room and exposes the view", async () => {
    getState.mockResolvedValue(view());
    sync.start();
    await flush();
    expect(sync.getSnapshot()).toMatchObject({ loading: false, error: null, preview: null, connection: "polling" });
    expect(sync.getSnapshot().view?.code).toBe("K7QXM2");
  });

  it("shows a preview (join screen) to someone who isn't in the room", async () => {
    getState.mockResolvedValue(fixture("preview"));
    sync.start();
    await flush();
    expect(sync.getSnapshot().preview?.host).toBe("Mira");
    expect(sync.getSnapshot().view).toBeNull();
  });

  it("polls again right after the server's due time (before the normal interval)", async () => {
    getState.mockResolvedValue(view({ now: Date.now(), due: Date.now() + 600 }));
    sync.start();
    await flush();
    expect(getState).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(560); // not yet: due + 60ms minimum
    expect(getState).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(400); // due + 60..300ms jitter has passed, the 1.5s fallback hasn't
    expect(getState).toHaveBeenCalledTimes(2);
  });

  it("falls back to the steady poll interval when nothing is due", async () => {
    getState.mockResolvedValue(view({ due: null }));
    sync.start();
    await flush();
    await vi.advanceTimersByTimeAsync(1400);
    expect(getState).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(200);
    expect(getState).toHaveBeenCalledTimes(2);
  });

  it("goes offline after repeated failures, backs off, and recovers", async () => {
    getState.mockRejectedValue(new ApiError("network"));
    sync.start();
    await flush();
    expect(sync.getSnapshot().connection).toBe("connecting"); // first failure: still trying
    await vi.advanceTimersByTimeAsync(1500);
    expect(sync.getSnapshot().connection).toBe("offline");
    expect(getState).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2900); // backoff doubled to 3s: not yet
    expect(getState).toHaveBeenCalledTimes(2);
    getState.mockResolvedValue(view());
    await vi.advanceTimersByTimeAsync(200);
    expect(getState).toHaveBeenCalledTimes(3);
    expect(sync.getSnapshot()).toMatchObject({ connection: "polling", error: null });
    expect(sync.getSnapshot().view).not.toBeNull();
  });

  it("surfaces an error when the very first load keeps failing, then clears it on recovery", async () => {
    getState.mockRejectedValue(new ApiError("network"));
    sync.start();
    await vi.advanceTimersByTimeAsync(6000);
    expect(sync.getSnapshot().error?.code).toBe("network");
    expect(sync.getSnapshot().loading).toBe(false);
    getState.mockResolvedValue(view());
    await vi.advanceTimersByTimeAsync(9000);
    expect(sync.getSnapshot().error).toBeNull();
    expect(sync.getSnapshot().view).not.toBeNull();
  });

  it("stops polling for a room that is gone, but an explicit refresh can revive it", async () => {
    getState.mockRejectedValue(new ApiError("room_not_found"));
    sync.start();
    await flush();
    expect(sync.getSnapshot().error?.code).toBe("room_not_found");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(getState).toHaveBeenCalledTimes(1); // no polling storm against a dead room

    getState.mockResolvedValue(view()); // e.g. the missing migration was applied / room recreated
    await sync.refresh();
    expect(sync.getSnapshot().error).toBeNull();
    expect(sync.getSnapshot().view).not.toBeNull();
    await vi.advanceTimersByTimeAsync(1600);
    expect(getState.mock.calls.length).toBeGreaterThan(2); // polling resumed
  });

  it("coalesces concurrent refreshes (single-flight)", async () => {
    let resolve!: (v: RoomView) => void;
    getState.mockImplementation(() => new Promise((r) => (resolve = r as (v: RoomView) => void)));
    const a = sync.refresh();
    const b = sync.refresh();
    const c = sync.refresh();
    expect(getState).toHaveBeenCalledTimes(1);
    resolve(view());
    getState.mockResolvedValue(view());
    await Promise.all([a, b, c]);
    expect(getState.mock.calls.length).toBeLessThanOrEqual(2); // one request + at most one re-run
  });

  it("ignores a stale response that resolves after a newer one", async () => {
    getState.mockResolvedValueOnce(view({ v: 10 })).mockResolvedValueOnce(view({ v: 5 })).mockResolvedValue(view({ v: 10 }));
    sync.start();
    await flush();
    await vi.advanceTimersByTimeAsync(1600);
    expect(getState.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(sync.getSnapshot().view?.v).toBe(10);
  });

  it("estimates the server clock offset", async () => {
    getState.mockResolvedValue(view({ now: Date.now() + 5000 }));
    sync.start();
    await flush();
    expect(Math.abs(sync.serverNow() - (Date.now() + 5000))).toBeLessThan(5);
  });

  it("applies the view returned by an action and blocks double submits", async () => {
    getState.mockResolvedValue(view({ v: 1 }));
    sync.start();
    await flush();
    let finish!: (v: RoomView) => void;
    vi.mocked(api.play).mockImplementation(() => new Promise((r) => (finish = r as (v: RoomView) => void)));
    const first = sync.play(["AS"]);
    expect(sync.getSnapshot().busy).toBe(true);
    expect(await sync.play(["AS"])).toBe(false); // second tap while the first is in flight
    expect(api.play).toHaveBeenCalledTimes(1);
    finish(view({ v: 2, pile: 9 }));
    expect(await first).toBe(true);
    expect(sync.getSnapshot()).toMatchObject({ busy: false });
    expect(sync.getSnapshot().view?.pile).toBe(9);
  });

  it("explains a failed action with a toast and resyncs", async () => {
    getState.mockResolvedValue(view({ v: 1 }));
    sync.start();
    await flush();
    vi.mocked(api.play).mockRejectedValue(new ApiError("not_your_turn"));
    expect(await sync.play(["AS"])).toBe(false);
    expect(toast).toHaveBeenCalledWith("It's not your turn.");
    expect(sync.getSnapshot().busy).toBe(false);
    await flush();
    expect(getState.mock.calls.length).toBeGreaterThanOrEqual(2); // refetched after the failure

    vi.mocked(api.play).mockRejectedValue(new ApiError("bad_cards"));
    await sync.play(["AS"]);
    expect(toast.error).toHaveBeenCalledWith("Pick 1–4 cards from your hand.");
  });

  it("treats leaving an already-gone room as success", async () => {
    vi.mocked(api.leave).mockRejectedValue(new ApiError("room_not_found"));
    expect(await sync.leave()).toBe(true);
    vi.mocked(api.leave).mockRejectedValue(new ApiError("network"));
    expect(await sync.leave()).toBe(false);
  });
});
