import { lazy, Suspense, useState } from "react";
import {
  createBrowserRouter,
  Navigate,
  Outlet,
  RouterProvider,
} from "react-router-dom";
import { useAuthSession } from "@/api/auth";
import {
  LoginScreen,
  SetupAuthScreen,
} from "@/components/auth/AuthScreen";
import { AppShell } from "@/components/layout/AppShell";
import { Sidebar } from "@/components/layout/Sidebar";
import { NavigationRegistrar } from "@/components/routing/NavigationRegistrar";
import { BoardSearchProvider } from "@/context/BoardSearchContext";

// Route-level code splitting (bundle-dynamic-imports): board/settings/trash/home defer heavy graphs until navigated.
const HomeRedirect = lazy(() =>
  import("@/components/routing/HomeRedirect").then((m) => ({
    default: m.HomeRedirect,
  })),
);
const BoardPage = lazy(() =>
  import("@/components/routing/BoardPage").then((m) => ({
    default: m.BoardPage,
  })),
);
const SettingsPage = lazy(() =>
  import("@/components/settings/SettingsPage").then((m) => ({
    default: m.SettingsPage,
  })),
);
const TrashPage = lazy(() =>
  import("@/components/trash/TrashPage").then((m) => ({
    default: m.TrashPage,
  })),
);

function RouteSuspenseFallback() {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center bg-board-canvas p-6">
      <div className="h-8 w-48 animate-pulse rounded-md bg-muted" />
      <div className="mt-4 h-4 w-72 animate-pulse rounded-md bg-muted" />
    </div>
  );
}

/** Data router so `useBlocker` works (e.g. unsaved task editor); `BrowserRouter` does not provide data router context. */
const authenticatedAppRouter = createBrowserRouter([
  {
    path: "/",
    element: (
      <BoardSearchProvider>
        <NavigationRegistrar />
        <AppShell sidebar={<Sidebar />}>
          <Suspense fallback={<RouteSuspenseFallback />}>
            <Outlet />
          </Suspense>
        </AppShell>
      </BoardSearchProvider>
    ),
    children: [
      { index: true, element: <HomeRedirect /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "trash", element: <TrashPage /> },
      { path: "board/:boardId", element: <BoardPage /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);

function AppBootScreen() {
  return (
    <div className="flex h-full min-h-0 items-center justify-center bg-board-canvas p-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
        <div className="h-7 w-44 animate-pulse rounded-md bg-muted" />
        <div className="mt-4 h-4 w-64 animate-pulse rounded-md bg-muted" />
        <div className="mt-8 h-10 animate-pulse rounded-md bg-muted" />
      </div>
    </div>
  );
}

function AuthenticatedApp() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <RouterProvider router={authenticatedAppRouter} />
    </div>
  );
}

export default function App() {
  const { data, isLoading, isError, error } = useAuthSession();
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <div className="h-full min-h-0">
      {isLoading ? (
        <AppBootScreen />
      ) : isError ? (
        <div className="flex h-full min-h-0 items-center justify-center bg-board-canvas p-6">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
            <p className="text-sm text-destructive">
              {error instanceof Error ? error.message : "Failed to load auth session"}
            </p>
          </div>
        </div>
      ) : !data?.authenticated ? (
        data?.initialized ?? false ? (
          <LoginScreen notice={notice} onNoticeChange={setNotice} />
        ) : (
          <SetupAuthScreen notice={notice} onNoticeChange={setNotice} />
        )
      ) : (
        <AuthenticatedApp />
      )}
    </div>
  );
}
