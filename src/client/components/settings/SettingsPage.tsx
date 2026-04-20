import {
  useCliGlobalPolicy,
  usePatchCliGlobalPolicy,
} from "@/api/cliGlobalPolicy";
import { APP_VERSION } from "@/lib/appVersion";

export function SettingsPage() {
  const { data: globalPolicy, isLoading: globalLoading } = useCliGlobalPolicy();
  const patchGlobal = usePatchCliGlobalPolicy();

  return (
    <div className="mx-auto flex min-h-0 max-w-2xl flex-1 flex-col gap-6 overflow-y-auto p-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Global options for the local hirotm CLI. Per-board CLI permissions are configured in{" "}
          <span className="font-medium text-foreground">Edit board</span> for each board.
        </p>
        <p
          translate="no"
          className="mt-2 text-xs text-muted-foreground/60"
          aria-label={`Application version ${APP_VERSION}`}
        >
          ({APP_VERSION})
        </p>
      </div>

      <section
        id="cli-global"
        className="scroll-mt-4 rounded-xl border border-border bg-card p-4 shadow-sm"
      >
        <h2 className="text-base font-semibold text-foreground">Global CLI</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Applies to unauthenticated local API clients (CLI principal).
        </p>
        {globalLoading ? (
          <p className="mt-3 text-sm text-muted-foreground">Loading…</p>
        ) : (
          <label className="mt-4 flex cursor-pointer gap-3">
            <input
              type="checkbox"
              className="mt-0.5 size-4 shrink-0 rounded border-input"
              checked={globalPolicy?.createBoard ?? true}
              disabled={patchGlobal.isPending}
              onChange={(e) =>
                patchGlobal.mutate({ createBoard: e.target.checked })
              }
            />
            <span>
              <span className="text-sm font-medium text-foreground">
                Allow CLI to create boards
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                When off, new boards must be created from this web app.
              </span>
            </span>
          </label>
        )}
      </section>
    </div>
  );
}
