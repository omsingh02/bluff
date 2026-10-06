import { useCallback, useRef } from "react";

/**
 * Radix only restores focus to a `<DialogTrigger>`. Our dialogs are opened programmatically from
 * ordinary buttons, so remember what had focus when the dialog opened and put it back on close
 * (keyboard users would otherwise land on <body>). Spread the result onto `<DialogContent>`.
 */
export function useReturnFocus() {
  const returnTo = useRef<HTMLElement | null>(null);

  // Fires just before Radix moves focus into the dialog, so activeElement is still the opener.
  const onOpenAutoFocus = useCallback(() => {
    returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }, []);

  const onCloseAutoFocus = useCallback((event: Event) => {
    event.preventDefault(); // skip Radix's "focus the trigger" (there is none)
    returnTo.current?.focus();
    returnTo.current = null;
  }, []);

  return { onOpenAutoFocus, onCloseAutoFocus };
}
