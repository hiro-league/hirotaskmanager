/** @vitest-environment jsdom */
import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, test } from "vitest";
import { createTestQueryClient } from "@/test/renderWithProviders";
import { AppHeader } from "./AppHeader";

describe("AppHeader", () => {
  test("renders app title and sidebar toggle with accessible name", () => {
    const qc = createTestQueryClient();
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/"]}>
          <AppHeader />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByText("Hiro Task Manager")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /collapse sidebar/i }),
    ).toBeInTheDocument();
  });
});
