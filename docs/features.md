
## Why Hiro Task Manager

- Open Source Transparency and Control.
- Free, works on all Platforms: Windows, Linux, macOS.
- Easy to install and configure. You can ask your AI Agent to install it for you.
- Local First, runs on your own machine, with your own data and your own AI Agents.
- Your data is yours, you can export it and use it with other tools.
- If you want to change it, We have the documentation, agents, skill files to help your ai agents update it accurately for you.


## Features

### General

- Create Boards, Lists and tasks.
- Use Markdown for task details, the universal language of the AI Agents.
- Easy Navigation, Drag and Drop, Keyboard Shortcuts for hardcore developers.
- Organize your tasks with
  - Priorities
  - Groups

### Agents

- All Task Manager actions can be performed by CLI, as well as your AI Agents.
- Works with any AI Agent that can execute CLI commands.
- Predefined Agents.md and Skill files.
- Works with Cursor IDE, Claude Caude, Github Copilot.
- Control Access Levels for your AI Agents to specific boards and specific actions.
- Notification system to let you know what your agents and your users are doing.

### Search

- Full Text search.


### Statistics

- Watch Instant Status about Task Counts per list, open vs closed.





## Hiro Task Manager — feature overview (draft)

**One line**  
A Trello-style board for people who ship products—organized on your PC, with a clear path for you *and* your AI tools to read and update the same work.

---

### Your data stays local

- Boards, lists, and tasks live in a **SQLite database** on your machine—no vendor cloud account for your task data.
- You choose **where data lives** (configurable data directory for installs and backups).
- **Passphrase login** for the browser; a **recovery key** is shown once at setup—store it somewhere safe.

---

### Boards that fit product work

- **Multiple boards** so you can separate products, clients, or phases.
- **Lists as columns** with tasks grouped in **workflow status bands** (stacked vertically), so progress is visible at a glance.
- **Task types** and **filters** so you can focus on what matters on a busy board (e.g. by group, priority, dates—good for builders juggling many kinds of work).
- Optional **board-level stats** (where implemented) to see load and completion signals without leaving the board.

---

### Tasks you can actually use

- **Markdown** in task bodies—notes, specs, and checklists in one place.
- **Drag and drop** to reorder lists and move tasks between statuses and lists.
- **Fast, optimistic UI** so the board stays responsive while changes sync to the server.

---

### Search across everything you’ve written

- **Full-text search** over task titles and bodies (and related labels), so buried tasks resurface when you need them—globally or within a board.

---

### Automation and AI-friendly workflows

- **`hirotm` CLI** talks to the same local HTTP API as the app: list boards, add/update/move tasks, list statuses, and **search** from the terminal or scripts.
- **Per-board CLI access**—after you sign in in the browser, you grant automation tools only the boards they should touch.
- **Labeled clients** (e.g. “Cursor Agent”) so changes from tools show up clearly in **activity/notifications**—you can see what the web UI did vs. what an agent did.

---

### How to use this on the page

| Section | Suggested visual |
|--------|-------------------|
| Local data & login | Setup / data folder / login screen |
| Board layout | Full board with lists and status bands |
| Task detail | Markdown edit + preview |
| Drag and drop | Short GIF of moving a card |
| Search | Search UI + results |
| Agents / CLI | Terminal + notification or “who changed this” |

---
