import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

interface DialogContentProps extends Omit<React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>, "title"> {
  /** Required for accessibility (rendered as the dialog heading). */
  title: React.ReactNode;
  description?: React.ReactNode;
  hideClose?: boolean;
}

/**
 * Accessible modal (focus trap, Esc to close, scroll lock) styled for the neon theme.
 * Focus returns to whatever opened it — Radix only does that for a <DialogTrigger>, but we mostly
 * open dialogs programmatically. Pass your own onOpen/CloseAutoFocus (and preventDefault) to override.
 */
export const DialogContent = React.forwardRef<HTMLDivElement, DialogContentProps>(
  ({ className, children, title, description, hideClose, onOpenAutoFocus, onCloseAutoFocus, ...props }, ref) => {
    const opener = React.useRef<HTMLElement | null>(null);
    return (
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
        <DialogPrimitive.Content
          ref={ref}
          // No description → tell Radix not to expect one (otherwise it warns). With one, keep its automatic link.
          {...(description ? {} : { "aria-describedby": undefined })}
          onOpenAutoFocus={(e) => {
            opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            onOpenAutoFocus?.(e);
          }}
          onCloseAutoFocus={(e) => {
            onCloseAutoFocus?.(e);
            if (!e.defaultPrevented && opener.current?.isConnected) {
              e.preventDefault();
              opener.current.focus();
            }
            opener.current = null;
          }}
          className={cn(
            "glass-strong fixed left-1/2 top-1/2 z-50 max-h-[88dvh] w-[calc(100vw-1.5rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-3xl p-5 shadow-2xl sm:p-7",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:slide-in-from-bottom-2",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
            className,
          )}
          {...props}
        >
          <DialogPrimitive.Title className="pr-10 font-display text-xl font-bold tracking-tight">{title}</DialogPrimitive.Title>
          {description ? (
            <DialogPrimitive.Description className="mt-1.5 text-sm text-muted">{description}</DialogPrimitive.Description>
          ) : null}
          <div className="mt-4">{children}</div>
          {!hideClose && (
            <DialogPrimitive.Close
              aria-label="Close"
              className="absolute right-3.5 top-3.5 grid h-9 w-9 place-items-center rounded-full text-muted transition-colors hover:bg-white/10 hover:text-foreground"
            >
              <X className="h-5 w-5" aria-hidden />
            </DialogPrimitive.Close>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    );
  },
);
DialogContent.displayName = "DialogContent";
