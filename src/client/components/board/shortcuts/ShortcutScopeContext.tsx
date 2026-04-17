import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { isEditableKeyboardTarget } from "./isEditableKeyboardTarget";
import type { ShortcutScope } from "./shortcutScopeTypes";

interface StackEntry {
  id: number;
  scope: ShortcutScope;
}

interface ShortcutScopeContextValue {
  /** Push a scope onto the stack; returns cleanup that removes this entry. */
  pushScope: (scope: ShortcutScope) => () => void;
  /** Register key handler for a scope (typically while a dialog/menu is open). */
  registerScopeKeyHandler: (
    scope: ShortcutScope,
    handler: (e: KeyboardEvent) => void,
  ) => () => void;
  /** Board scope uses the empty stack; this registers the board dispatcher. */
  registerBoardKeyHandler: (
    handler: (e: KeyboardEvent) => void,
  ) => () => void;
}

const ShortcutScopeContext = createContext<ShortcutScopeContextValue | null>(
  null,
);

export function useShortcutScope(): ShortcutScopeContextValue {
  const ctx = use(ShortcutScopeContext);
  if (!ctx) {
    throw new Error("useShortcutScope must be used within ShortcutScopeProvider");
  }
  return ctx;
}

export function useShortcutScopeOptional(): ShortcutScopeContextValue | null {
  return use(ShortcutScopeContext);
}

interface ProviderProps {
  children: ReactNode;
}

/**
 * One window `keydown` listener: dispatches to the topmost scope, or board when the stack is empty.
 * Phase 4: replaces per-dialog `window.addEventListener("keydown")` for registered overlays.
 */
export function ShortcutScopeProvider({ children }: ProviderProps) {
  const [stack, setStack] = useState<StackEntry[]>([]);
  const stackRef = useRef(stack);
  stackRef.current = stack;

  const nextIdRef = useRef(1);
  const boardHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {});
  const scopeHandlersRef = useRef<
    Partial<Record<ShortcutScope, (e: KeyboardEvent) => void>>
  >({});

  const pushScope = useCallback((scope: ShortcutScope) => {
    const id = nextIdRef.current++;
    setStack((prev) => [...prev, { id, scope }]);
    return () => {
      setStack((prev) => prev.filter((e) => e.id !== id));
    };
  }, []);

  const registerScopeKeyHandler = useCallback(
    (scope: ShortcutScope, handler: (e: KeyboardEvent) => void) => {
      scopeHandlersRef.current[scope] = handler;
      return () => {
        delete scopeHandlersRef.current[scope];
      };
    },
    [],
  );

  const registerBoardKeyHandler = useCallback(
    (handler: (e: KeyboardEvent) => void) => {
      boardHandlerRef.current = handler;
      return () => {
        boardHandlerRef.current = () => {};
      };
    },
    [],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const topEntry = stackRef.current[stackRef.current.length - 1];
      const top: ShortcutScope = topEntry?.scope ?? "board";

      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (top === "board") {
        if (isEditableKeyboardTarget(e.target)) return;
        boardHandlerRef.current(e);
        return;
      }

      const handler = scopeHandlersRef.current[top];
      handler?.(e);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const value = useMemo(
    (): ShortcutScopeContextValue => ({
      pushScope,
      registerScopeKeyHandler,
      registerBoardKeyHandler,
    }),
    [pushScope, registerScopeKeyHandler, registerBoardKeyHandler],
  );

  return (
    <ShortcutScopeContext.Provider value={value}>
      {children}
    </ShortcutScopeContext.Provider>
  );
}

/**
 * While `open`, pushes `scope` onto the stack and registers `handler` for that scope.
 * Cleans up both on close/unmount.
 */
export function useShortcutOverlay(
  open: boolean,
  scope: ShortcutScope,
  handler: (e: KeyboardEvent) => void,
): void {
  const { pushScope, registerScopeKeyHandler } = useShortcutScope();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!open) return;
    const popStack = pushScope(scope);
    const wrapped: (e: KeyboardEvent) => void = (e) => handlerRef.current(e);
    const unreg = registerScopeKeyHandler(scope, wrapped);
    return () => {
      unreg();
      popStack();
    };
  }, [open, scope, pushScope, registerScopeKeyHandler]);
}
