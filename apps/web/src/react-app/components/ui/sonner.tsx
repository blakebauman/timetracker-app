import {
  CircleCheckIcon,
  InfoIcon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"

import { Spinner } from "@/components/ui/spinner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Spinner />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          // `richColors` (AppShell) otherwise paints Sonner's stock palette: a
          // cream warning at 3.1:1, a blue info, a mint success — hues outside
          // the rack and, for the warning, below AA. Every kind sits on the
          // popover like a plain toast; the kind is carried by the icon and by
          // text in the calibrated `-ink` tokens (DESIGN.md, The Derived-Ink
          // Rule), and by a hairline tinted toward its hue. Info is not a
          // colour at all here: it's the neutral toast with an icon.
          "--success-bg": "var(--popover)",
          "--success-text": "var(--success-ink)",
          "--success-border": "color-mix(in oklab, var(--success) 35%, var(--border))",
          "--info-bg": "var(--popover)",
          "--info-text": "var(--popover-foreground)",
          "--info-border": "var(--border)",
          "--warning-bg": "var(--popover)",
          "--warning-text": "var(--warning-ink)",
          "--warning-border": "color-mix(in oklab, var(--warning) 35%, var(--border))",
          "--error-bg": "var(--popover)",
          "--error-text": "var(--destructive)",
          "--error-border": "color-mix(in oklab, var(--destructive) 35%, var(--border))",
          // Toasts are overlay containers, so they take the container radius
          // rather than the data-cell one (DESIGN.md §5, The Geometry Rule).
          "--border-radius": "var(--radius-container)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          // Sonner styles its own action/cancel buttons, so they don't inherit
          // `Button` and were the one square-cornered control left in the app.
          actionButton: "rounded-full!",
          cancelButton: "rounded-full!",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
