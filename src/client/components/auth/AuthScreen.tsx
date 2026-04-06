import { useMemo, useState, type ReactNode } from "react";
import { KeyRound, LockKeyhole, LogIn } from "lucide-react";
import { useLogin, useRecoverPassphrase, useSetupAuth } from "@/api/auth";

interface AuthScreenProps {
  initialized: boolean;
  notice: string | null;
  onNoticeChange: (value: string | null) => void;
}

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
    <div className="flex min-h-dvh items-center justify-center bg-board-canvas p-6">
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
              <h1 className="text-xl font-semibold tracking-tight text-foreground">
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
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground"
          onClick={onDismiss}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

function SetupForm({
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
                  "Recovery key printed to the server console. Save it now, then log in with your new passphrase.",
                );
              },
            },
          );
        }}
      >
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-foreground">Passphrase</span>
          <input
            type="password"
            autoFocus
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
            value={passphrase}
            onChange={(event) => setPassphrase(event.target.value)}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-foreground">
            Confirm passphrase
          </span>
          <input
            type="password"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
            value={confirmPassphrase}
            onChange={(event) => setConfirmPassphrase(event.target.value)}
          />
        </label>
        {mismatch ? (
          <p className="text-sm text-destructive">Passphrases must match.</p>
        ) : null}
        {setupAuth.error ? (
          <p className="text-sm text-destructive">{setupAuth.error.message}</p>
        ) : null}
        <p className="text-sm text-muted-foreground">
          The recovery key will be shown once in the server console. Save it outside
          the app before continuing.
        </p>
        <button
          type="submit"
          disabled={setupAuth.isPending || !passphrase || mismatch}
          className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          <LockKeyhole className="size-4" aria-hidden />
          Create passphrase
        </button>
      </form>
    </AuthShell>
  );
}

function LoginForm({
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
            <input
              type="password"
              autoFocus
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
            />
          </label>
          {loginError ? (
            <p className="text-sm text-destructive">{loginError}</p>
          ) : null}
          <button
            type="submit"
            disabled={busy || !passphrase}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <LogIn className="size-4" aria-hidden />
            Log in
          </button>
          <button
            type="button"
            className="w-full rounded-md border border-border px-4 py-2 text-sm text-foreground hover:bg-muted"
            disabled={busy}
            onClick={() => {
              setShowRecovery(true);
              onNoticeChange(null);
            }}
          >
            Use recovery key instead
          </button>
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
            <input
              type="text"
              autoFocus
              className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm text-foreground"
              value={recoveryKey}
              onChange={(event) => setRecoveryKey(event.target.value)}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-foreground">
              New passphrase
            </span>
            <input
              type="password"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
              value={newPassphrase}
              onChange={(event) => setNewPassphrase(event.target.value)}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-foreground">
              Confirm new passphrase
            </span>
            <input
              type="password"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
              value={confirmNewPassphrase}
              onChange={(event) => setConfirmNewPassphrase(event.target.value)}
            />
          </label>
          {recoveryMismatch ? (
            <p className="text-sm text-destructive">Passphrases must match.</p>
          ) : null}
          {recoveryError ? (
            <p className="text-sm text-destructive">{recoveryError}</p>
          ) : null}
          <button
            type="submit"
            disabled={busy || !recoveryKey || !newPassphrase || recoveryMismatch}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <KeyRound className="size-4" aria-hidden />
            Reset passphrase
          </button>
          <button
            type="button"
            className="w-full rounded-md border border-border px-4 py-2 text-sm text-foreground hover:bg-muted"
            disabled={busy}
            onClick={() => {
              setShowRecovery(false);
              setRecoveryKey("");
              setNewPassphrase("");
              setConfirmNewPassphrase("");
            }}
          >
            Back to login
          </button>
        </form>
      )}
    </AuthShell>
  );
}

export function AuthScreen({
  initialized,
  notice,
  onNoticeChange,
}: AuthScreenProps) {
  if (!initialized) {
    return <SetupForm notice={notice} onNoticeChange={onNoticeChange} />;
  }
  return <LoginForm notice={notice} onNoticeChange={onNoticeChange} />;
}
