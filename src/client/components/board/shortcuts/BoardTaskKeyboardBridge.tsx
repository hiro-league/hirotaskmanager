import {
  createContext,
  use,
  useCallback,
  useRef,
  type ReactNode,
} from "react";

type OpenTaskHandler = (taskId: number) => boolean;
type EditTaskTitleHandler = (taskId: number) => boolean;

interface BoardTaskKeyboardBridgeValue {
  /** Columns register; first handler that returns true wins. */
  registerOpenTaskEditor: (handler: OpenTaskHandler) => () => void;
  requestOpenTaskEditor: (taskId: number) => void;
  /** Columns register; first handler that returns true starts inline title-only edit. */
  registerEditTaskTitle: (handler: EditTaskTitleHandler) => () => void;
  requestEditTaskTitle: (taskId: number) => void;
}

const BoardTaskKeyboardBridgeContext =
  createContext<BoardTaskKeyboardBridgeValue | null>(null);

export function BoardTaskKeyboardBridgeProvider({
  children,
}: {
  children: ReactNode;
}) {
  const openTaskHandlersRef = useRef(new Set<OpenTaskHandler>());
  const editTaskTitleHandlersRef = useRef(new Set<EditTaskTitleHandler>());

  const registerOpenTaskEditor = useCallback((handler: OpenTaskHandler) => {
    openTaskHandlersRef.current.add(handler);
    return () => {
      openTaskHandlersRef.current.delete(handler);
    };
  }, []);

  const requestOpenTaskEditor = useCallback((taskId: number) => {
    for (const fn of openTaskHandlersRef.current) {
      if (fn(taskId)) return;
    }
  }, []);

  const registerEditTaskTitle = useCallback((handler: EditTaskTitleHandler) => {
    editTaskTitleHandlersRef.current.add(handler);
    return () => {
      editTaskTitleHandlersRef.current.delete(handler);
    };
  }, []);

  const requestEditTaskTitle = useCallback((taskId: number) => {
    for (const fn of editTaskTitleHandlersRef.current) {
      if (fn(taskId)) return;
    }
  }, []);

  const value: BoardTaskKeyboardBridgeValue = {
    registerOpenTaskEditor,
    requestOpenTaskEditor,
    registerEditTaskTitle,
    requestEditTaskTitle,
  };

  return (
    <BoardTaskKeyboardBridgeContext.Provider value={value}>
      {children}
    </BoardTaskKeyboardBridgeContext.Provider>
  );
}

export function useBoardTaskKeyboardBridge(): BoardTaskKeyboardBridgeValue {
  const ctx = use(BoardTaskKeyboardBridgeContext);
  if (!ctx) {
    throw new Error(
      "useBoardTaskKeyboardBridge must be used within BoardTaskKeyboardBridgeProvider",
    );
  }
  return ctx;
}

export function useBoardTaskKeyboardBridgeOptional(): BoardTaskKeyboardBridgeValue | null {
  return use(BoardTaskKeyboardBridgeContext);
}
