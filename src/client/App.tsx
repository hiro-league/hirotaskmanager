import { useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { useAuthSession } from "@/api/auth";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { AppShell } from "@/components/layout/AppShell";
import { Sidebar } from "@/components/layout/Sidebar";
import { SettingsPage } from "@/components/settings/SettingsPage";
import { BoardPage } from "@/components/routing/BoardPage";
import { HomeRedirect } from "@/components/routing/HomeRedirect";
import { NavigationRegistrar } from "@/components/routing/NavigationRegistrar";
import { BoardSearchProvider } from "@/context/BoardSearchContext";

function AppBootScreen() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-board-canvas p-6">
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
    <BrowserRouter>
      <BoardSearchProvider>
        <NavigationRegistrar />
        <AppShell sidebar={<Sidebar />}>
          <Routes>
            <Route path="/" element={<HomeRedirect />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/board/:boardId" element={<BoardPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppShell>
      </BoardSearchProvider>
    </BrowserRouter>
  );
}

export default function App() {
  const { data, isLoading, isError, error } = useAuthSession();
  const [notice, setNotice] = useState<string | null>(null);

  if (isLoading) {
    return <AppBootScreen />;
  }

  if (isError) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-board-canvas p-6">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
          <p className="text-sm text-destructive">
            {error instanceof Error ? error.message : "Failed to load auth session"}
          </p>
        </div>
      </div>
    );
  }

  if (!data?.authenticated) {
    return (
      <AuthScreen
        initialized={data?.initialized ?? false}
        notice={notice}
        onNoticeChange={setNotice}
      />
    );
  }

  return <AuthenticatedApp />;
}
