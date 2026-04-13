# Local Board App — Requirements and Proposed Architecture

## One-line product summary

A browser-based, local-only task board app with Trello-like visual boards, global task-type switching, global status rows, Markdown-first tasks, and file-based local storage.

## Requirements

- Browser-based only. No desktop app.
- Local-only usage.
- Trello is only a **visual reference** for boards, lists, and draggable task cards.
- The internal model should **not** copy Trello unless it naturally fits the product.
- Markdown is a core part of the app. Task content can stay simple and Markdown-first.
- The app supports **many boards**.
- Each board contains **lists**.
- Lists can be **reordered horizontally** inside a board.
- Tasks can be **reordered inside a list**.
- A task belongs to a list, but the board has a **global viewing mode** for task type.
- Task type switching is **global across the whole board**, not per list.
- Example task types include:
  - Features
  - Bugs
  - Enhancements
  - More types can be added later
- The board should let the user view:
  - all lists by Features
  - all lists by Bugs
  - all lists by Enhancements
  - other task types later
- Status display is also **global across the whole board**.
- The board is split **vertically by task status across the whole set of lists**, not inside each list independently.
- The user must be able to choose which statuses are visible, for example:
  - Open only
  - Closed only
  - Open + Closed
  - Open + In Progress
  - Other combinations later
- Open and completed items should be visually separated by that global status layout.
- Optional counts inside lists would be useful.
- Tasks and/or lists can use colors or backgrounds for distinction.
- Boards should support a **background image**.
- Export is needed, but only for:
  - Markdown
  - JSON
- Reporting is **not** part of v1.
- Optional tags are **not wanted**.
- The solution should remain friendly for future AI usage, including the possibility of Cursor reading open tasks or working with them later.

---

## Product interpretation

This product is best understood as a **2D board**:

- **Columns** = lists
- **Rows** = currently visible statuses
- **Global board mode** = currently selected task type

That means the app is not just “lists with cards” in the Trello sense.

Instead, the board behaves like a visual matrix:

- all lists stay visible horizontally
- the board can switch globally between Features / Bugs / Enhancements / etc.
- visible statuses define the horizontal status bands/rows across the entire board
- tasks appear in the cell matching:
  - selected type
  - current list
  - current status

---

## Feature breakdown

### 1. Boards

- Create board
- Rename board
- Delete board
- Open/switch board
- Board background image
- Board-level settings for:
  - active task type mode
  - visible statuses
  - optional counts display

### 2. Lists

- Create list
- Rename list
- Delete list
- Reorder lists horizontally
- Each list has:
  - title
  - order
  - optional accent/color styling

### 3. Tasks

- Create task
- Edit task
- Delete task
- Move task between lists
- Reorder task inside a list/status cell
- Task fields:
  - title
  - Markdown body
  - type
  - status
  - optional color/background style
  - created timestamp
  - updated timestamp

### 4. Global task-type mode

A single board-level mode controls what type is shown across all lists.

Examples:

- Features mode
- Bugs mode
- Enhancements mode

This is a core product idea and should be treated as a first-class feature, not as a workaround.

### 5. Global visible statuses

A board-level status selector controls which status rows are currently visible across the entire board.

Examples:

- Open only
- Closed only
- Open + Closed
- Open + In Progress

This should remain flexible so future statuses can be added without redesigning the board.

### 6. Markdown-first editing

- Markdown editor for task content
- Preview mode
- Keep the model simple and text-first
- Avoid rich-text complexity in v1

### 7. Visual distinction

- Task colors/backgrounds
- List accent styling
- Board background image
- Optional counts inside list headers or row sections

### 8. Export

- Export current board to Markdown
- Export current board to JSON
- Export current filtered view to Markdown
- Export current filtered view to JSON
- Export all boards as a Markdown/JSON bundle later if needed

---

