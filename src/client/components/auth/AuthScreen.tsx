import { useMemo, useState, type ReactNode } from "react";
import { KeyRound, LockKeyhole, LogIn } from "lucide-react";
import { useLogin, useRecoverPassphrase, useSetupAuth } from "@/api/auth";
// Shared Input/Button: focus-visible rings, autocomplete, password-manager hints (web interface guidelines).
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 items-center justify-center bg-board-canvas p-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
        <div className="mb-6">
          <div className="mb-3 flex items-center gap-3">
            <img
              src="/hirologo.png"
              alt=""
              className="size-10 shrink-0 object-contain"
              width={40}
              height={40}
              decoding="async"
            />
            <div>
              <h1 className="text-balance text-xl font-semibold tracking-tight text-foreground">
                {title}
              </h1>
              <p className="text-sm text-muted-foreground">{subtitle}</p>
            </div>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

function AuthNotice({
  notice,
  onDismiss,
}: {
  notice: string | null;
  onDismiss: () => void;
}) {
  if (!notice) return null;
  return (
    <div className="mb-4 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-foreground">
      <div className="flex items-start justify-between gap-3">
        <span>{notice}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0 text-muted-foreground hover:text-foreground"
          onClick={onDismiss}
        >
          Dismiss
        </Button>
      </div>
    </div>
  );
}

export function SetupAuthScreen({
  notice,
  onNoticeChange,
}: {
  notice: string | null;
  onNoticeChange: (value: string | null) => void;
}) {
  const setupAuth = useSetupAuth();
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const mismatch =
    confirmPassphrase.length > 0 && passphrase !== confirmPassphrase;

  return (
    <AuthShell
      title="Set up TaskManager"
      subtitle="Create the passphrase that unlocks the web app on this machine."
    >
      <AuthNotice notice={notice} onDismiss={() => onNoticeChange(null)} />
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!passphrase || mismatch) return;
          setupAuth.mutate(
            { passphrase },
            {
              onSuccess: () => {
                onNoticeChange(
                  "Recovery key shown in the terminal running TaskManager. Save it now, then log in with your new passphrase.",
                );
              },
            },
          );
        }}
      >
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-foreground">Passphrase</span>
          <Input
            type="password"
            name="passphrase"
            autoComplete="new-password"
            autoFocus
            value={passphrase}
            onChange={(event) => setPassphrase(event.target.value)}
            aria-invalid={mismatch}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-foreground">
            Confirm passphrase
          </span>
          <Input
            type="password"
            name="confirm-passphrase"
            autoComplete="new-password"
            value={confirmPassphrase}
            onChange={(event) => setConfirmPassphrase(event.target.value)}
            aria-invalid={mismatch}
          />
        </label>
        {mismatch ? (
          <p className="text-sm text-destructive">Passphrases must match.</p>
        ) : null}
        {setupAuth.error ? (
          <p className="text-sm text-destructive">{setupAuth.error.message}</p>
        ) : null}
        <p className="text-sm text-muted-foreground">
          The recovery key will be shown once in the terminal running TaskManager.
          Save it outside the app before continuing.
        </p>
        <Button
          type="submit"
          className="w-full gap-2"
          disabled={setupAuth.isPending || !passphrase || mismatch}
        >
          <LockKeyhole className="size-4" aria-hidden />
          Create passphrase
        </Button>
      </form>
    </AuthShell>
  );
}

export function LoginScreen({
  notice,
  onNoticeChange,
}: {
  notice: string | null;
  onNoticeChange: (value: string | null) => void;
}) {
  const login = useLogin();
  const recover = useRecoverPassphrase();
  const [passphrase, setPassphrase] = useState("");
  const [showRecovery, setShowRecovery] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState("");
  const [newPassphrase, setNewPassphrase] = useState("");
  const [confirmNewPassphrase, setConfirmNewPassphrase] = useState("");
  const recoveryMismatch =
    confirmNewPassphrase.length > 0 && newPassphrase !== confirmNewPassphrase;

  const busy = login.isPending || recover.isPending;
  const loginError = login.error?.message ?? null;
  const recoveryError = recover.error?.message ?? null;
  const recoveryHint = useMemo(
    () =>
      "Use the saved recovery key to reset the passphrase. This signs out any active browser session.",
    [],
  );

  return (
    <AuthShell
      title="Log in to TaskManager"
      subtitle="A browser session is required before the web app can access your boards."
    >
      <AuthNotice notice={notice} onDismiss={() => onNoticeChange(null)} />
      {!showRecovery ? (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!passphrase) return;
            login.mutate({ passphrase });
          }}
        >
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-foreground">Passphrase</span>
            <Input
              type="password"
              name="passphrase"
              autoComplete="current-password"
              autoFocus
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
            />
          </label>
          {loginError ? (
            <p className="text-sm text-destructive">{loginError}</p>
          ) : null}
          <Button type="submit" className="w-full gap-2" disabled={busy || !passphrase}>
            <LogIn className="size-4" aria-hidden />
            Log in
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={busy}
            onClick={() => {
              setShowRecovery(true);
              onNoticeChange(null);
            }}
          >
            Use recovery key instead
          </Button>
        </form>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!recoveryKey || !newPassphrase || recoveryMismatch) return;
            recover.mutate(
              { recoveryKey, passphrase: newPassphrase },
              {
                onSuccess: () => {
                  setShowRecovery(false);
                  setRecoveryKey("");
                  setNewPassphrase("");
                  setConfirmNewPassphrase("");
                  onNoticeChange(
                    "Passphrase reset. Log in with your new passphrase.",
                  );
                },
              },
            );
          }}
        >
          <p className="text-sm text-muted-foreground">{recoveryHint}</p>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-foreground">Recovery key</span>
            <Input
              type="text"
              name="recovery-key"
              autoComplete="off"
              spellCheck={false}
              autoFocus
              className="font-mono"
              value={recoveryKey}
              onChange={(event) => setRecoveryKey(event.target.value)}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-foreground">
              New passphrase
            </span>
            <Input
              type="password"
              name="new-passphrase"
              autoComplete="new-password"
              value={newPassphrase}
              onChange={(event) => setNewPassphrase(event.target.value)}
              aria-invalid={recoveryMismatch}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-foreground">
              Confirm new passphrase
            </span>
            <Input
              type="password"
              name="confirm-new-passphrase"
              autoComplete="new-password"
              value={confirmNewPassphrase}
              onChange={(event) => setConfirmNewPassphrase(event.target.value)}
              aria-invalid={recoveryMismatch}
            />
          </label>
          {recoveryMismatch ? (
            <p className="text-sm text-destructive">Passphrases must match.</p>
          ) : null}
          {recoveryError ? (
            <p className="text-sm text-destructive">{recoveryError}</p>
          ) : null}
          <Button
            type="submit"
            className="w-full gap-2"
            disabled={busy || !recoveryKey || !newPassphrase || recoveryMismatch}
          >
            <KeyRound className="size-4" aria-hidden />
            Reset passphrase
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={busy}
            onClick={() => {
              setShowRecovery(false);
              setRecoveryKey("");
              setNewPassphrase("");
              setConfirmNewPassphrase("");
            }}
          >
            Back to login
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
