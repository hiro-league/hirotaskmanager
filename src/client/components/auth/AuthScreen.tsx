import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Eye, EyeOff, KeyRound, LockKeyhole, LogIn } from "lucide-react";
import { useLogin, useRecoverPassphrase, useSetupAuth } from "@/api/auth";
// Shared Input/Button: focus-visible rings; passphrase fields use autoComplete=off (task: avoid browser/password-manager autofill).
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Passphrase row with reveal toggle; visibility state is per-field (login vs setup vs recovery). */
function PassphraseField({
  label,
  name,
  value,
  onChange,
  autoFocus,
  "aria-invalid": ariaInvalid,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
  "aria-invalid"?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <div className="relative">
        <Input
          type={visible ? "text" : "password"}
          name={name}
          // Product: do not suggest saved passphrases / autofill on local TaskManager unlock fields.
          autoComplete="off"
          autoFocus={autoFocus}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={ariaInvalid}
          className="pr-9"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          // Keep Tab order to inputs + primary actions only; reveal is mouse/touch (or screen-reader browse).
          tabIndex={-1}
          className="absolute top-0 right-0 text-muted-foreground hover:text-foreground"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide passphrase" : "Show passphrase"}
          aria-pressed={visible}
        >
          {visible ? (
            <EyeOff className="size-4" aria-hidden />
          ) : (
            <Eye className="size-4" aria-hidden />
          )}
        </Button>
      </div>
    </label>
  );
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

/**
 * Read `?setupToken=...` once at mount so the launcher's deep-link
 * (`http://host:port/?setupToken=...`) auto-fills the field. Strip the param
 * from the address bar immediately so the token does not survive in the
 * browser history / share sheet / referer header. See task #31338.
 */
function useInitialSetupTokenFromUrl(): string {
  const [value] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get("setupToken")?.trim() ?? "";
    } catch {
      return "";
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!value) return;
    try {
      const url = new URL(window.location.href);
      if (!url.searchParams.has("setupToken")) return;
      url.searchParams.delete("setupToken");
      const cleaned = `${url.pathname}${url.search}${url.hash}`;
      window.history.replaceState(window.history.state, "", cleaned);
    } catch {
      // Best-effort URL cleanup; not worth blocking setup on this.
    }
  }, [value]);

  return value;
}

export function SetupAuthScreen({
  notice,
  onNoticeChange,
}: {
  notice: string | null;
  onNoticeChange: (value: string | null) => void;
}) {
  const setupAuth = useSetupAuth();
  const initialToken = useInitialSetupTokenFromUrl();
  const [setupToken, setSetupToken] = useState<string>(initialToken);
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const mismatch =
    confirmPassphrase.length > 0 && passphrase !== confirmPassphrase;
  const tokenTrimmed = setupToken.trim();
  const canSubmit =
    !!passphrase && !mismatch && tokenTrimmed.length > 0;

  return (
    <AuthShell
      title="Set up TaskManager"
      subtitle="Create the passphrase that unlocks the web app on this machine."
    >
      <AuthNotice notice={notice} onDismiss={() => onNoticeChange(null)} />
      <form
        className="space-y-4"
        autoComplete="off"
        onSubmit={(event) => {
          event.preventDefault();
          if (!canSubmit) return;
          setupAuth.mutate(
            { passphrase, setupToken: tokenTrimmed },
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
          <span className="text-sm font-medium text-foreground">
            One-time setup token
          </span>
          <Input
            type="text"
            name="setup-token"
            autoComplete="off"
            spellCheck={false}
            autoFocus={!initialToken}
            className="font-mono"
            value={setupToken}
            onChange={(event) => setSetupToken(event.target.value)}
            aria-describedby="setup-token-hint"
          />
          <span
            id="setup-token-hint"
            className="block text-xs text-muted-foreground"
          >
            Printed once in the terminal running TaskManager. Required so a
            stranger cannot reach this URL first and squat the passphrase.
          </span>
        </label>
        <PassphraseField
          label="Passphrase"
          name="passphrase"
          autoFocus={!!initialToken}
          value={passphrase}
          onChange={setPassphrase}
          aria-invalid={mismatch}
        />
        <PassphraseField
          label="Confirm passphrase"
          name="confirm-passphrase"
          value={confirmPassphrase}
          onChange={setConfirmPassphrase}
          aria-invalid={mismatch}
        />
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
          disabled={setupAuth.isPending || !canSubmit}
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
          autoComplete="off"
          onSubmit={(event) => {
            event.preventDefault();
            if (!passphrase) return;
            login.mutate({ passphrase });
          }}
        >
          <PassphraseField
            label="Passphrase"
            name="passphrase"
            autoFocus
            value={passphrase}
            onChange={setPassphrase}
          />
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
          autoComplete="off"
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
          <PassphraseField
            label="New passphrase"
            name="new-passphrase"
            value={newPassphrase}
            onChange={setNewPassphrase}
            aria-invalid={recoveryMismatch}
          />
          <PassphraseField
            label="Confirm new passphrase"
            name="confirm-new-passphrase"
            value={confirmNewPassphrase}
            onChange={setConfirmNewPassphrase}
            aria-invalid={recoveryMismatch}
          />
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
