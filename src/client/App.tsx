import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { Sidebar } from "@/components/layout/Sidebar";
import { BoardPage } from "@/components/routing/BoardPage";
import { HomeRedirect } from "@/components/routing/HomeRedirect";
import { NavigationRegistrar } from "@/components/routing/NavigationRegistrar";

export default function App() {
  return (
    <BrowserRouter>
      <NavigationRegistrar />
      <AppShell sidebar={<Sidebar />}>
        <Routes>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/board/:boardId" element={<BoardPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}
