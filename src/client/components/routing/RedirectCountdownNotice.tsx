import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

const DEFAULT_SECONDS = 10;

export type RedirectCountdownNoticeProps = {
  title: string;
  description?: string;
  /** Extra detail (e.g. API error body) — shown below the description. */
  detail?: string;
  /** Navigation target (default home `/`). */
  to?: string;
  /** Countdown length in seconds. */
  seconds?: number;
  /**
   * Called immediately before navigation (e.g. invalidate queries when already on `/`
   * so the next paint can refetch).
   */
  onRedirect?: () => void;
};

/**
 * Full-area notice with optional error detail, live countdown, and immediate “home” action.
 * Used for missing boards, unknown routes, and other recoverable routing errors.
 */
export function RedirectCountdownNotice({
  title,
  description,
  detail,
  to = "/",
  seconds = DEFAULT_SECONDS,
  onRedirect,
}: RedirectCountdownNoticeProps) {
  const navigate = useNavigate();
  const onRedirectRef = useRef(onRedirect);
  onRedirectRef.current = onRedirect;
  const [remaining, setRemaining] = useState(seconds);

  const goNow = () => {
    onRedirectRef.current?.();
    navigate(to, { replace: true });
  };

  useEffect(() => {
    const id = window.setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          onRedirectRef.current?.();
          navigate(to, { replace: true });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [navigate, to]);

  return (
    <div
      className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-8 text-center"
      data-testid="redirect-countdown-notice"
    >
      <h1 className="text-balance text-lg font-medium text-foreground">{title}</h1>
      {description ? (
        <p className="max-w-md text-pretty text-sm text-muted-foreground">{description}</p>
      ) : null}
      {detail ? (
        <p
          className="max-w-xl whitespace-pre-wrap break-words text-left text-sm text-destructive"
          data-testid="redirect-countdown-detail"
        >
          {detail}
        </p>
      ) : null}
      <div
        className="redirect-countdown-loader shrink-0"
        aria-hidden
      />
      <p className="text-sm text-muted-foreground">
        Redirecting to home in{" "}
        <span className="font-medium tabular-nums text-foreground">{remaining}</span> second
        {remaining === 1 ? "" : "s"}…
      </p>
      <Button type="button" variant="secondary" onClick={goNow}>
        Go home now
      </Button>
    </div>
  );
}
