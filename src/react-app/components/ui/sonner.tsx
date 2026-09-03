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
