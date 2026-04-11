
## Why Hiro Task Manager

- Free and Open Source 
  Use it, modify it, and extend it. We provide you with Docs and Agentic Skills to change it however you want.
- Works on Any Platform, 
  Windows, Linux, and macOS are supported.
- Works with Any AI Agent.
  Cursor IDE, Claude Caude, Github Copilot, Open Claw and more
- Get Started Quickly
  One line installer. or Install via AI Agents. It takes a minute.  
- Your Data, Your Machine, Your Models.
  Total Privacy, your choice to make.


## Explore


- Boards & Lists
  Simplify your workflow
  
  - Create Unlimited Boards, Lists and Tasks.
  - Organize Your Tasks
    - Use Priorities, Statuses, and Groups to organize your tasks.
  - Customize your View
    - Board Themes, Custom Task Groups, Custom Statuses, Emojis, Multiple Board/Task Views.

- Agentic workflow

  The **web app** is for people: boards, settings, and a clear view of work. The **`hirotm` CLI** is the path for **AI agents** (and scripts) to inspect and manage the same boards, lists, and tasks—**convenience**, **automation**, and **delegation** without a separate copy of your data.

  - Manage boards, lists, and tasks through agents
    Agents use the CLI to align with how you organize work in the UI.
  - Control agent access
    Per-board policy in the web app defines what automation may read or change.
  - Works with any agent that can run CLI commands
    Cursor, Claude Code, GitHub Copilot, and similar setups.
  - Web notifications
    Stay informed when agents change work you care about.

- Productivity
  - Keyboard Shortcuts
    Developer First, Desktop First, Keyboard Shortcuts for hardcore developers.
  - Search and Filter
    Filter by Any Field, Full Text Search.
  - Instant Statistics
    See Task Counts per list, per status.

## Features

### General

- Use Markdown for task details, the universal language of the AI Agents.
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

- **`hirotm`** shares the same local service as the app so people and agents work on **one** set of boards, lists, and tasks—inspect, update, and search from the terminal or agent sessions.
- **Per-board CLI access** is configured in the **browser** after sign-in: you choose what automation may do on each board.
- **Labeled clients** (e.g. “Cursor Agent”) so activity and notifications reflect **who** changed what—the UI vs. an agent or script.

---

### How to use this on the page

| Section | Suggested visual |
|--------|-------------------|
| Local data & login | Setup / data folder / login screen |
| Board layout | Full board with lists and status bands |
| Task detail | Markdown edit + preview |
| Drag and drop | Short GIF of moving a card |
| Search | Search UI + results |
| Agents / CLI | Web UI plus terminal or agent—same boards; policy and labels showing who acted |

---
