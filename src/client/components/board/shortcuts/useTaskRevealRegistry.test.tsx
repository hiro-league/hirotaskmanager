/** @vitest-environment jsdom */
import { renderHook, act } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { useTaskRevealRegistry } from "./useTaskRevealRegistry";

describe("useTaskRevealRegistry", () => {
  test("revealTask returns false and does not set pending when no revealers are registered", () => {
    const { result } = renderHook(() => useTaskRevealRegistry());
    act(() => {
      expect(result.current.revealTask(1)).toBe(false);
    });
    expect(result.current.pendingRevealTaskIdRef.current).toBeNull();
  });

  test("first revealer that returns true wins and sets pending ref", () => {
    const { result } = renderHook(() => useTaskRevealRegistry());
    const spy1 = vi.fn().mockReturnValue(false);
    const spy2 = vi.fn().mockReturnValue(true);
    act(() => {
      result.current.registerTaskRevealer(spy1);
      result.current.registerTaskRevealer(spy2);
    });
    act(() => {
      expect(result.current.revealTask(99)).toBe(true);
    });
    expect(spy1).toHaveBeenCalledWith(99);
    expect(spy2).toHaveBeenCalledWith(99);
    expect(result.current.pendingRevealTaskIdRef.current).toBe(99);
  });

  test("unregister removes revealer so later reveal can fall through", () => {
    const { result } = renderHook(() => useTaskRevealRegistry());
    const spyOk = vi.fn().mockReturnValue(true);
    let unregister: () => void;
    act(() => {
      unregister = result.current.registerTaskRevealer(spyOk);
    });
    act(() => {
      unregister!();
    });
    act(() => {
      expect(result.current.revealTask(1)).toBe(false);
    });
    expect(spyOk).not.toHaveBeenCalled();
  });

  test("clearPendingReveal clears pending id", () => {
    const { result } = renderHook(() => useTaskRevealRegistry());
    act(() => {
      result.current.registerTaskRevealer(() => true);
    });
    act(() => {
      result.current.revealTask(5);
    });
    expect(result.current.pendingRevealTaskIdRef.current).toBe(5);
    act(() => {
      result.current.clearPendingReveal();
    });
    expect(result.current.pendingRevealTaskIdRef.current).toBeNull();
  });
});
