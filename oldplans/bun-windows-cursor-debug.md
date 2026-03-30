# Bun on Windows + Cursor: full-stack debug (`bun: command not found`)

Use this guide when **Run and Debug → “Full stack: Debug API + Chrome client”** fails because the **Bun** API debug session or the integrated terminal reports **`bun: command not found`**.

That compound (see [`.vscode/launch.json`](../.vscode/launch.json)) starts **“Bun: Debug API server”**, which needs the **Bun runtime** available and the **official Bun extension** so Cursor can use the `bun` debug type.

---

## 1. Install the Bun runtime (required)

1. Open **Windows PowerShell** (not Git Bash).
2. Run:

   ```powershell
   irm https://bun.sh/install.ps1 | iex
   ```

3. **Quit Cursor completely** and reopen it so it picks up the updated user **PATH**.

4. In a **new** integrated terminal, run:

   ```bash
   bun --version
   ```

   You should see a version number. If you still get **command not found**, continue with step 2 before relying on the debugger.

---

## 2. Fix PATH if `bun` still isn’t found

Default install location (replace `YourUser` with your Windows username):

`C:\Users\YourUser\.bun\bin\bun.exe`

### Windows user PATH (GUI)

1. Press **Win**, type **environment variables**, open **Edit the system environment variables** → **Environment Variables…** (or **Edit environment variables for your account**).
2. Under **User variables**, select **Path** → **Edit** → **New**.
3. Add: `C:\Users\YourUser\.bun\bin`
4. Confirm with **OK**, then **restart Cursor** fully.

### Git Bash only

If `bun` works in PowerShell but not in **Git Bash**:

1. Open or create `~/.bashrc` in your home directory (e.g. `C:\Users\YourUser\.bashrc`).
2. Append:

   ```bash
   export BUN_INSTALL="$HOME/.bun"
   export PATH="$BUN_INSTALL/bin:$PATH"
   ```

3. Open a **new** Git Bash terminal and run `bun --version` again.

---

## 3. Install the Bun extension (required for `type: "bun"` launches)

1. In Cursor: **Extensions** (**Ctrl+Shift+X**).
2. Search for **`bun-vscode`** or install by id: **`oven.bun-vscode`**.
3. Install **Bun** published by **Oven** (verified).

   - Marketplace: [Bun for Visual Studio Code](https://marketplace.visualstudio.com/items?itemName=oven.bun-vscode)

4. **Reload the window**: **Ctrl+Shift+P** → **Developer: Reload Window**.

---

## 4. If the debugger still can’t find Bun: set `bun.runtime`

1. **Ctrl+Shift+P** → **Preferences: Open User Settings (JSON)**.
2. Add (adjust the path to your machine; use **double backslashes** in JSON):

   ```json
   "bun.runtime": "C:\\Users\\YourUser\\.bun\\bin\\bun.exe"
   ```

3. Save, reload the window, then try **Full stack** again.

---

## 5. Run full stack again

1. **Run and Debug** (**Ctrl+Shift+D**).
2. Select **“Full stack: Debug API + Chrome client”**.
3. Start debugging (green play).

Expected behavior:

- A debug session runs the **API** with Bun (`src/server/index.ts`).
- **Chrome** opens **http://localhost:5173** after the **dev:client (background)** task starts Vite.

---

## Troubleshooting

| Symptom | What to check |
|--------|----------------|
| **`bun: command not found`** in the terminal | User **PATH** (step 2) and/or **Git Bash `~/.bashrc`** (step 2). Restart Cursor after changing PATH. |
| Debugger / extension can’t start Bun | **`oven.bun-vscode`** installed and window reloaded (step 3). |
| Still fails in debug only | **`bun.runtime`** absolute path to `bun.exe` (step 4). |

If **Vite** fails but Bun is fine, that is separate: ensure **`npm run dev:client`** works and see [setup.md](./setup.md) for general dev commands.

---

## Related

- General environment: [setup.md](./setup.md)
- Launch / task definitions: [`.vscode/launch.json`](../.vscode/launch.json), [`.vscode/tasks.json`](../.vscode/tasks.json)

Official Bun VS Code debugging notes: [Debugging Bun with the VS Code extension](https://bun.com/docs/guides/runtime/vscode-debugger).
