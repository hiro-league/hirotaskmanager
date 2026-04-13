import { useCallback, useRef } from "react";

export interface UseBackdropDismissClickOptions {
  /** When true, backdrop does not dismiss (e.g. while saving). */
  disabled?: boolean;
}

/**
 * Backdrop dismiss that only runs when pointer down and click both hit the
 * backdrop. A mousedown inside the dialog panel followed by mouseup on the
 * backdrop would otherwise synthesize a click on the overlay and close the dialog.
 */
export function useBackdropDismissClick(
  onDismiss: () => void,
  options?: UseBackdropDismissClickOptions,
) {
  const pointerDownOnBackdrop = useRef(false);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (options?.disabled) return;
      pointerDownOnBackdrop.current = e.target === e.currentTarget;
    },
    [options?.disabled],
  );

  const onClick = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      if (options?.disabled) return;
      const fullClickOnBackdrop =
        e.target === e.currentTarget && pointerDownOnBackdrop.current;
      pointerDownOnBackdrop.current = false;
      if (!fullClickOnBackdrop) return;
      onDismiss();
    },
    [onDismiss, options?.disabled],
  );

  return { onPointerDown, onClick };
}
