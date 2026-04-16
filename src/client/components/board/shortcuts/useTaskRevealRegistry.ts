import { useCallback, useRef, type MutableRefObject } from "react";

interface TaskRevealRegistryResult {
  pendingRevealTaskIdRef: MutableRefObject<number | null>;
  registerTaskRevealer: (reveal: (taskId: number) => boolean) => () => void;
  revealTask: (taskId: number) => boolean;
  clearPendingReveal: () => void;
}

export function useTaskRevealRegistry(): TaskRevealRegistryResult {
  const taskRevealersRef = useRef<Map<number, (taskId: number) => boolean>>(new Map());
  const nextTaskRevealerIdRef = useRef(1);
  const pendingRevealTaskIdRef = useRef<number | null>(null);

  const registerTaskRevealer = useCallback((reveal: (taskId: number) => boolean) => {
    const id = nextTaskRevealerIdRef.current++;
    taskRevealersRef.current.set(id, reveal);
    return () => {
      taskRevealersRef.current.delete(id);
    };
  }, []);

  const revealTask = useCallback((taskId: number) => {
    for (const reveal of taskRevealersRef.current.values()) {
      if (!reveal(taskId)) continue;
      pendingRevealTaskIdRef.current = taskId;
      return true;
    }
    return false;
  }, []);

  const clearPendingReveal = useCallback(() => {
    pendingRevealTaskIdRef.current = null;
  }, []);

  return {
    pendingRevealTaskIdRef,
    registerTaskRevealer,
    revealTask,
    clearPendingReveal,
  };
}
