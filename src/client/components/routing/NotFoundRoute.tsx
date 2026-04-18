import { RedirectCountdownNotice } from "./RedirectCountdownNotice";

/** Unknown in-app URL: show a clear message then send the user home (see `App` wildcard route). */
export function NotFoundRoute() {
  return (
    <RedirectCountdownNotice
      title="Page not found"
      description="This URL doesn’t match any page in the app."
    />
  );
}
