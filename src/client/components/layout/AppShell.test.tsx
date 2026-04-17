/** @vitest-environment jsdom */
import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, test, vi } from "vitest";
import { createTestQueryClient } from "@/test/renderWithProviders";
import { AppShell } from "./AppShell";

vi.mock("@/api/useBoardChangeStream", () => ({
  useBoardChangeStream: vi.fn(),
}));

describe("AppShell", () => {
  test("renders skip link, header, sidebar slot, and main landmark", () => {
    const qc = createTestQueryClient();
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/"]}>
          <AppShell sidebar={<div>Sidebar fixture</div>}>
            <div>Page body</div>
          </AppShell>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByText("Sidebar fixture")).toBeInTheDocument();
    expect(screen.getByText("Page body")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /skip to main content/i })).toHaveAttribute(
      "href",
      "#main-content",
    );
    expect(document.getElementById("main-content")).not.toBeNull();
  });
});
