import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  render,
  renderHook,
  type RenderHookOptions,
  type RenderOptions,
  type RenderResult,
} from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ShortcutScopeProvider } from "@/components/board/shortcuts/ShortcutScopeContext";

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

export type RenderWithProvidersOptions = Omit<RenderOptions, "wrapper"> & {
  /** Shared TanStack Query client; a fresh one is created when omitted. */
  queryClient?: QueryClient;
  /** Passed to {@link MemoryRouter} when set (enables `useParams`, `useLocation`, etc.). */
  initialEntries?: string[];
  /**
   * When set with `initialEntries`, wraps children in
   * `<Routes><Route path={routePath} element={children} /></Routes>`.
   */
  routePath?: string;
  /** Wraps with {@link ShortcutScopeProvider} (keyboard scope stack + board handler). */
  withShortcutScope?: boolean;
};

function TestProviders({
  children,
  queryClient,
  initialEntries,
  routePath,
  withShortcutScope,
}: {
  children: ReactNode;
  queryClient: QueryClient;
  initialEntries?: string[];
  routePath?: string;
  withShortcutScope?: boolean;
}) {
  let inner = children;
  if (withShortcutScope) {
    inner = <ShortcutScopeProvider>{inner}</ShortcutScopeProvider>;
  }

  if (initialEntries != null && initialEntries.length > 0) {
    const routed =
      routePath != null ? (
        <Routes>
          <Route path={routePath} element={inner} />
        </Routes>
      ) : (
        inner
      );
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={initialEntries}>{routed}</MemoryRouter>
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>{inner}</QueryClientProvider>
  );
}

export function renderWithProviders(
  ui: ReactElement,
  options: RenderWithProvidersOptions = {},
): RenderResult & { queryClient: QueryClient } {
  const {
    queryClient: qcIn,
    initialEntries,
    routePath,
    withShortcutScope,
    ...renderOptions
  } = options;
  const queryClient = qcIn ?? createTestQueryClient();
  return {
    queryClient,
    ...render(ui, {
      ...renderOptions,
      wrapper: ({ children }) => (
        <TestProviders
          queryClient={queryClient}
          initialEntries={initialEntries}
          routePath={routePath}
          withShortcutScope={withShortcutScope}
        >
          {children}
        </TestProviders>
      ),
    }),
  };
}

export type RenderHookWithProvidersOptions<TProps> = Omit<
  RenderHookOptions<TProps>,
  "wrapper"
> & {
  queryClient?: QueryClient;
  initialEntries?: string[];
  routePath?: string;
  withShortcutScope?: boolean;
};

export function renderHookWithProviders<TResult, TProps>(
  callback: (props: TProps) => TResult,
  options: RenderHookWithProvidersOptions<TProps> = {},
) {
  const {
    queryClient: qcIn,
    initialEntries,
    routePath,
    withShortcutScope,
    ...hookOptions
  } = options;
  const queryClient = qcIn ?? createTestQueryClient();
  return {
    queryClient,
    ...renderHook(callback, {
      ...hookOptions,
      wrapper: ({ children }) => (
        <TestProviders
          queryClient={queryClient}
          initialEntries={initialEntries}
          routePath={routePath}
          withShortcutScope={withShortcutScope}
        >
          {children}
        </TestProviders>
      ),
    }),
  };
}
