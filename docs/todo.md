1. - after bun install, it should tell us what to do next.

PS C:\Users\GF> bun install -g @hiroleague/taskmanager
bun add v1.3.11 (af24e281)

installed @hiroleague/taskmanager@0.0.1 with binaries:
 - hirotaskmanager
 - hirotm

736 packages installed [80.95s]
PS C:\Users\GF>


2. running hirotaskmanager, what about autostart? any other hints?:

PS C:\Users\GF> hirotaskmanager
TaskManager first-run setup
Port [3001]:
Data directory [C:\Users\GF\.taskmanager\profiles\default\data]:
Open browser automatically [Y/n]:
Saved launcher config to C:\Users\GF\.taskmanager\profiles\default\config.json
TaskManager server listening on http://localhost:3001
TaskManager running at http://127.0.0.1:3001
TaskManager recovery key (shown once):
589B-F6E4-71E4-A28F-B03E-1F13-80F2-BF99
Save this recovery key somewhere safe outside the app.

3. default groups, keep ? they have no emojis too.

4. first release ever, need to add one in order to allow a default. auto save auto assign settings?


6. what happens when running in foreground and ctrl+c?

TaskManager running at http://127.0.0.1:3001
PS C:\Users\GF> {"error":"Server exited unexpectedly","code":"server_exited","childExitCode":130}
PS C:\Users\GF> hirotaskmanager
TaskManager server listening on http://localhost:3001
TaskManager running at http://127.0.0.1:3001
PS C:\Users\GF> {"error":"Server exited unexpectedly","code":"server_exited","childExitCode":58}
PS C:\Users\GF>


different error codes, but it goes back to prompt this time..



8. what happens when existing profiles exist from previous installs? should uninstall remove profiles? option?
