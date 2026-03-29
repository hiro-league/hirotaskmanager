import { Plus } from "lucide-react";
import { useBoard } from "@/api/queries";
import { useCreateList } from "@/api/mutations";
import { MatrixGrid } from "./MatrixGrid";

interface BoardViewProps {
  boardId: string | null;
}

export function BoardView({ boardId }: BoardViewProps) {
  const { data, isLoading, isError, error, isFetching } = useBoard(boardId);
  const createList = useCreateList();

  if (!boardId) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
        <p className="text-lg font-medium text-foreground">No board selected</p>
        <p className="max-w-sm text-sm">
          Choose a board from the sidebar or create a new one.
        </p>
      </div>
    );
  }

  if (isLoading || (isFetching && !data)) {
    return (
      <div className="p-8">
        <div className="h-8 w-48 animate-pulse rounded-md bg-muted" />
        <div className="mt-4 h-4 w-72 animate-pulse rounded-md bg-muted" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="p-8">
        <p className="text-destructive">
          {error instanceof Error ? error.message : "Could not load this board."}
        </p>
      </div>
    );
  }

  const hasLists = data.lists.length > 0;

  return (
    <div className="p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {data.name}
        </h1>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          disabled={createList.isPending}
          onClick={() => createList.mutate(data.id)}
        >
          <Plus className="size-4" aria-hidden />
          New list
        </button>
      </div>

      {!hasLists ? (
        <p className="mt-8 text-sm text-muted-foreground">
          No lists yet. Add a list to start organizing work in columns.
        </p>
      ) : (
        <MatrixGrid board={data} />
      )}
    </div>
  );
}
