import { create } from "zustand";

interface SelectionState {
  selectedBoardId: string | null;
  setSelectedBoardId: (id: string | null) => void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  selectedBoardId: null,
  setSelectedBoardId: (id) => set({ selectedBoardId: id }),
}));
