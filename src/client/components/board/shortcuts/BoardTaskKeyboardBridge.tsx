import {
  createContext,
  useCallback,
  useContext,
  useRef,
  type ReactNode,
} from "react";

type OpenTaskHandler = (taskId: number) => boolean;

interface BoardTaskKeyboardBridgeValue {
  /** Columns register; first handler that returns true wins. */
  registerOpenTaskEditor: (handler: OpenTaskHandler) => () => void;
  requestOpenTaskEditor: (taskId: number) => void;
}

const BoardTaskKeyboardBridgeContext =
  createContext<BoardTaskKeyboardBridgeValue | null>(null);

export function BoardTaskKeyboardBridgeProvider({
  children,
}: {
  children: ReactNode;
}) {
  const handlersRef = useRef(new Set<OpenTaskHandler>());

  const registerOpenTaskEditor = useCallback((handler: OpenTaskHandler) => {
    handlersRef.current.add(handler);
    return () => {
      handlersRef.current.delete(handler);
    };
  }, []);

  const requestOpenTaskEditor = useCallback((taskId: number) => {
    for (const fn of handlersRef.current) {
      if (fn(taskId)) return;
    }
  }, []);

  const value: BoardTaskKeyboardBridgeValue = {
    registerOpenTaskEditor,
    requestOpenTaskEditor,
  };

  return (
    <BoardTaskKeyboardBridgeContext.Provider value={value}>
      {children}
    </BoardTaskKeyboardBridgeContext.Provider>
  );
}

export function useBoardTaskKeyboardBridge(): BoardTaskKeyboardBridgeValue {
  const ctx = useContext(BoardTaskKeyboardBridgeContext);
  if (!ctx) {
    throw new Error(
      "useBoardTaskKeyboardBridge must be used within BoardTaskKeyboardBridgeProvider",
    );
  }
  return ctx;
}
