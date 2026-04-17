/** @vitest-environment jsdom */
import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    // `TaskEditor` uses `useBlocker`; `MemoryRouter` has no data router (Phase 10 DOM smoke).
    useBlocker: () => ({
      state: "unblocked" as const,
      reset: vi.fn(),
      proceed: vi.fn(),
    }),
  };
});
import type { Status } from "../../../shared/models";
import * as queries from "@/api/queries";
import { ShortcutScopeProvider } from "@/components/board/shortcuts/ShortcutScopeContext";
import { TaskEditor } from "@/components/task/TaskEditor";
import { buildTaskEditorBoardData, buildTestBoard, buildTestTask } from "@/test/fixtures";
import { createTestQueryClient } from "@/test/renderWithProviders";

vi.mock("@/components/emoji/EmojiPickerMenuButton", () => ({
  EmojiPickerMenuButton: () => <span data-testid="emoji-mock" />,
}));

vi.mock("@/components/task/TaskMarkdownField", () => ({
  TaskMarkdownField: ({
    body,
    onBodyChange,
    disabled,
  }: {
    body: string;
    onBodyChange: (v: string) => void;
    disabled?: boolean;
  }) => (
    <textarea
      data-testid="task-markdown-mock"
      value={body}
      disabled={disabled}
      onChange={(e) => onBodyChange(e.target.value)}
    />
  ),
}));

vi.mock("@/gamification", () => ({
  useBoardTaskCompletionCelebrationOptional: () => null,
}));

const STATUS_FIXTURE: Status[] = [
  { statusId: "open", label: "Open", sortOrder: 0, isClosed: false },
  {
    statusId: "in-progress",
    label: "In Progress",
    sortOrder: 1,
    isClosed: false,
  },
  { statusId: "closed", label: "Closed", sortOrder: 2, isClosed: true },
];

afterEach(() => {
  vi.restoreAllMocks();
});

function setupQueryMocks() {
  vi.spyOn(queries, "useStatuses").mockReturnValue({
    data: STATUS_FIXTURE,
    isPending: false,
    isError: false,
    error: null,
    status: "success",
  } as unknown as ReturnType<typeof queries.useStatuses>);

  vi.spyOn(queries, "useStatusWorkflowOrder").mockReturnValue([
    "open",
    "in-progress",
    "closed",
  ]);
}

function renderTaskEditor(ui: ReactElement) {
  const qc = createTestQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ShortcutScopeProvider>{ui}</ShortcutScopeProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("TaskEditor", () => {
  beforeEach(() => {
    setupQueryMocks();
  });

  test("renders nothing when closed", () => {
    const onClose = vi.fn();
    renderTaskEditor(
      <TaskEditor
        board={buildTaskEditorBoardData(buildTestBoard())}
        open={false}
        onClose={onClose}
        mode="create"
        createContext={{ listId: 1, status: "open" }}
      />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("create mode shows dialog heading, metadata, and primary actions", async () => {
    const onClose = vi.fn();
    renderTaskEditor(
      <TaskEditor
        board={buildTaskEditorBoardData(buildTestBoard())}
        open
        onClose={onClose}
        mode="create"
        createContext={{ listId: 1, status: "open" }}
      />,
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /New task/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Title")).toBeEnabled();
    expect(screen.getByRole("button", { name: /^Cancel$/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /^Save$/i })).toBeEnabled();
    await waitFor(() => {
      expect(screen.getByTestId("task-markdown-mock")).toBeInTheDocument();
    });
  });

  test("edit mode shows task id, loads detail, shows Move to Trash", async () => {
    vi.spyOn(queries, "fetchTaskById").mockResolvedValue(
      buildTestTask({ taskId: 7, title: "Hello", body: "loaded body" }),
    );

    const onClose = vi.fn();
    const slim = buildTestTask({
      taskId: 7,
      title: "Hello",
      body: "slim",
    });

    renderTaskEditor(
      <TaskEditor
        board={buildTaskEditorBoardData(buildTestBoard())}
        open
        onClose={onClose}
        mode="edit"
        task={slim}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /Edit task #7/i }),
      ).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByTestId("task-markdown-mock")).toHaveValue("loaded body");
    });
    expect(screen.getByRole("button", { name: /Move to Trash/i })).toBeEnabled();
  });

  test("Cancel calls onClose when not dirty", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderTaskEditor(
      <TaskEditor
        board={buildTaskEditorBoardData(buildTestBoard())}
        open
        onClose={onClose}
        mode="create"
        createContext={{ listId: 1, status: "open" }}
      />,
    );

    await user.click(screen.getByRole("button", { name: /^Cancel$/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
