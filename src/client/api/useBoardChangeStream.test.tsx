/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { useBoardChangeStream } from "./useBoardChangeStream";

vi.mock("@/store/notificationUi", () => ({
  useNotificationUiStore: (
    selector: (s: {
      panelOpen: boolean;
      pushToast: () => void;
      pushSystemToast: () => void;
    }) => unknown,
  ) =>
    selector({
      panelOpen: false,
      pushToast: vi.fn(),
      pushSystemToast: vi.fn(),
    }),
}));

vi.mock("./devDirectApiOrigin", () => ({
  devDirectApiOrigin: () => "http://localhost:3002",
}));

/** Captures listeners so tests can emit synthetic SSE events after the hook opens the stream. */
class MockEventSource {
  static last: MockEventSource | null = null;
  private listeners = new Map<string, Array<(e: Event) => void>>();
  constructor(public url: string) {
    MockEventSource.last = this;
  }
  addEventListener(name: string, fn: (e: Event) => void) {
    const arr = this.listeners.get(name) ?? [];
    arr.push(fn);
    this.listeners.set(name, arr);
    if (name === "open") {
      queueMicrotask(() => fn(new Event("open")));
    }
  }
  removeEventListener() {}
  close() {}
  emit(eventName: string, data: string) {
    const ev = new MessageEvent(eventName, { data });
    for (const fn of this.listeners.get(eventName) ?? []) fn(ev);
  }
}

function createWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

describe("useBoardChangeStream", () => {
  beforeEach(() => {
    vi.stubGlobal("EventSource", MockEventSource);
    MockEventSource.last = null;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test("board-index-changed invalidates the board index query (shell stream)", async () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries");

    const { unmount } = renderHook(() => useBoardChangeStream(null, null), {
      wrapper: createWrapper(qc),
    });

    await waitFor(() => {
      expect(MockEventSource.last).not.toBeNull();
    });

    MockEventSource.last!.emit("board-index-changed", "");

    await waitFor(() => {
      expect(spy).toHaveBeenCalledWith({
        queryKey: ["boards"],
        exact: true,
      });
    });

    unmount();
  });
});
