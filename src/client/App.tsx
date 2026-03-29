import { AppShell } from "@/components/layout/AppShell";
import { Sidebar } from "@/components/layout/Sidebar";
import { BoardView } from "@/components/board/BoardView";
import { useSelectionStore } from "@/store/selection";

export default function App() {
  const selectedBoardId = useSelectionStore((s) => s.selectedBoardId);

  return (
    <AppShell sidebar={<Sidebar />}>
      <div className="flex min-h-0 flex-1 flex-col">
        <BoardView boardId={selectedBoardId} />
      </div>
    </AppShell>
  );
}
