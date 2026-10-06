import { Toaster } from "sonner";

/** Glass toasts that match the neon theme. Sonner's own styling is disabled (`unstyled`). */
export function AppToaster() {
  return (
    <Toaster
      theme="dark"
      position="top-center"
      offset={{ top: "max(env(safe-area-inset-top), 12px)" }}
      mobileOffset={{ top: "max(env(safe-area-inset-top), 12px)", left: 12, right: 12 }}
      visibleToasts={3}
      duration={3600}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-[hsl(var(--surface-2)/0.98)] px-4 py-3 text-sm font-medium text-foreground shadow-2xl backdrop-blur-xl sm:w-[22rem]",
          title: "font-semibold leading-snug",
          description: "text-xs text-muted",
          icon: "shrink-0",
          content: "min-w-0 flex-1",
          success: "!border-trust/40 [&_[data-icon]]:text-trust",
          error: "!border-bluff/50 [&_[data-icon]]:text-bluff",
          warning: "!border-gold/50 [&_[data-icon]]:text-gold",
          info: "!border-primary/40 [&_[data-icon]]:text-primary",
          actionButton: "rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground",
          cancelButton: "rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold",
        },
      }}
    />
  );
}
