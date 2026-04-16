# Coverage review (LCOV + HTML on Windows)

Short workflow for **generating LCOV** with Bun and **viewing it in the browser** with `genhtml` on Windows.

---

## 1. Generate `coverage/lcov.info`

From the repo root (`hirotaskmanager/`):

**CLI tree only** (matches the usual CLI-focused review scope; trailing slash avoids pulling in `src/client`):

```bash
bun test --coverage --coverage-reporter=lcov --coverage-dir=coverage ./src/cli/
```

**Entire test suite** (all discovered `*.test.ts`):

```bash
bun test --coverage --coverage-reporter=lcov --coverage-dir=coverage
```

Bun writes **`coverage/lcov.info`** (and related coverage files under `coverage/`).

---

## 2. Install `genhtml` on Windows

`genhtml` ships with **lcov** (Perl). Pick **one** of these approaches.

### If Windows says “Choose an app” / “How do you want to open this file?”

The file named `genhtml` has **no `.exe`**. Windows does **not** treat it as a program. That dialog appears when the OS (or **PowerShell as the default terminal in Cursor**) tries to “launch” the file instead of running it through **Perl**.

**Fix:** always run it as:

```powershell
perl "$env:LOCALAPPDATA\lcov\bin\genhtml" --version
```

(Adjust the path if you installed lcov somewhere else.) Do **not** double‑click `genhtml` in File Explorer. After you add the optional **`genhtml.cmd`** shim below, typing `genhtml` in **CMD or PowerShell** can work like a normal command.

**Git Bash:** you can run **`genhtml` from bash** instead; the shell honors the script’s shebang, so you usually avoid the “choose an app” dialog. From the repo root:

```bash
# Explicit path (no PATH setup required; replace <you> with your Windows user folder name)
perl /c/Users/<you>/AppData/Local/lcov/bin/genhtml coverage/lcov.info -o coverage/html
```

Or add **`…/AppData/Local/lcov/bin`** to `PATH` in **`~/.bashrc`** (see §2b), then:

```bash
genhtml coverage/lcov.info -o coverage/html
```

### Option A — lcov 1.16 tarball (works with Git for Windows Perl)

Git Bash’s Perl is minimal. **lcov 2.x** expects extra CPAN modules (e.g. `DateTime`); **lcov 1.16** runs with the modules that ship there.

1. Download **[lcov 1.16](https://github.com/linux-test-project/lcov/releases/download/v1.16/lcov-1.16.tar.gz)** and extract the archive (keep the full folder layout: `bin/` and `lib/` must stay together).
2. Move the extracted tree to a fixed location, for example:
   - `%LOCALAPPDATA%\lcov`  
   - i.e. `C:\Users\<you>\AppData\Local\lcov`  
   The folder that must end up on `PATH` is the **`bin`** directory inside that tree:  
   **`%LOCALAPPDATA%\lcov\bin`**.

### Option B — Chocolatey

If you use [Chocolatey](https://chocolatey.org/):

```powershell
choco install lcov -y
```

Use an **elevated** shell. After install, locate the directory that contains **`genhtml`** (often under `C:\ProgramData\chocolatey\lib\lcov\`, e.g. a `tools\bin` subfolder). **Add that directory** to your `PATH` using the same steps as below (or keep using `perl` + full path to `genhtml` — see **PowerShell / CMD**).

---

## 2b. Add `genhtml` to `PATH` (so it runs from any directory)

`genhtml` is a **Perl script with no `.exe`**. **PowerShell and CMD never treat it as runnable by name** (and may trigger the “open with app” flow). **Git Bash** can run `./genhtml` if `bin` is on `PATH` and the shebang works. The approach that always works in every shell is **`perl` + full path** (section 2, above).

### Optional: `genhtml.cmd` shim (so `genhtml` works in CMD / PowerShell)

In the same folder as the real script (e.g. `%LOCALAPPDATA%\lcov\bin\`), create a new file **`genhtml.cmd`** with:

```bat
@echo off
perl "%~dp0genhtml" %*
```

Save it next to the extensionless `genhtml` file. Add **`…\lcov\bin`** to your user **Path** (see below), restart the terminal, then:

```powershell
genhtml --version
```

Windows finds **`genhtml.cmd`** via `PATHEXT`; the shim calls Perl on the real script.

If **`perl` is not recognized** in PowerShell, install [Git for Windows](https://git-scm.com/download/win) (includes Perl) and add **`C:\Program Files\Git\usr\bin`** to your user **Path**, or call Perl by full path, e.g. **`"C:\Program Files\Git\usr\bin\perl.exe"`** instead of `perl`.

Replace `C:\Users\<you>` with your Windows username (or use `%LOCALAPPDATA%` in CMD / `$env:LOCALAPPDATA` in PowerShell).

**Directory to add (Option A — manual lcov 1.16):**

`C:\Users\<you>\AppData\Local\lcov\bin`

### Windows Settings (applies to PowerShell, CMD, Git Bash, and new terminals)

1. Press **Win**, type **environment variables**, open **Edit environment variables for your account**.
2. Under **User variables**, select **Path** → **Edit**.
3. **New** → paste the full path to the **`bin`** folder, e.g.  
   `C:\Users\<you>\AppData\Local\lcov\bin`
4. **OK** on all dialogs.
5. **Close every open terminal and Cursor/VS Code** (or at least open a **new** terminal tab). Windows only picks up user `PATH` changes in new processes.

### PowerShell — append user `PATH` without the GUI

Run once (adjust the path if your lcov folder is elsewhere):

```powershell
$lcovBin = Join-Path $env:LOCALAPPDATA "lcov\bin"
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath -notlike "*$lcovBin*") {
  [Environment]::SetEnvironmentVariable("Path", "$userPath;$lcovBin", "User")
}
```

Open a **new** PowerShell window, then test **with `perl`** (reliable on Windows):

```powershell
perl "$env:LOCALAPPDATA\lcov\bin\genhtml" --version
```

### Git Bash — persist `PATH` for terminal sessions

Add this line to **`~/.bashrc`** (create the file if needed). Replace **`<you>`** with your Windows profile folder name (same as in `C:\Users\<you>\...`; in Git Bash you can run `echo $USERNAME` as a hint):

```bash
export PATH="$PATH:/c/Users/<you>/AppData/Local/lcov/bin"
```

Save, then **`source ~/.bashrc`** or open a **new** Git Bash window.

```bash
genhtml --version
```

If that still fails, use Perl explicitly (same as PowerShell — works in Git Bash):

```bash
perl /c/Users/<you>/AppData/Local/lcov/bin/genhtml --version
```

### PowerShell / CMD — run without relying on `PATH`

If `genhtml` is still “not found”, call Perl explicitly:

```powershell
perl "$env:LOCALAPPDATA\lcov\bin\genhtml" --version
```

```bat
perl "%LOCALAPPDATA%\lcov\bin\genhtml" --version
```

Use the same `perl ...\genhtml` prefix in place of `genhtml` in the commands in section 3 if you stay in CMD/PowerShell.

---

## 3. Produce HTML and open the report

From the repo root.

**Recommended on Windows (any terminal, including Cursor’s default PowerShell):**

```powershell
perl "$env:LOCALAPPDATA\lcov\bin\genhtml" coverage/lcov.info -o coverage/html
```

**If you added `genhtml.cmd`** (section 2b) and `…\lcov\bin` is on `Path`:**

```powershell
genhtml coverage/lcov.info -o coverage/html
```

**Git Bash** (if `bin` is on `PATH` and `genhtml` runs — otherwise use `perl` + full path like above):

```bash
genhtml coverage/lcov.info -o coverage/html
```

Open **`coverage/html/index.html`** in a browser.

`--quiet` reduces log noise:

```powershell
perl "$env:LOCALAPPDATA\lcov\bin\genhtml" coverage/lcov.info -o coverage/html --quiet
```

```bash
genhtml coverage/lcov.info -o coverage/html --quiet
```

---

## See also

- `docs/cli-testing.md` — CLI test commands and the same coverage line for `./src/cli/`.
- `docs/testing-strategy.md` — broader testing direction for the repo.
