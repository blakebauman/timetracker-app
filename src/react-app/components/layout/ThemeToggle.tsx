import { useTheme } from "next-themes";
import { SegmentedControl } from "@/components/ui/segmented-control";

const OPTIONS = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
] as const;

type ThemeValue = (typeof OPTIONS)[number]["value"];

/**
 * Theme is a three-state setting, so it shows all three states.
 *
 * It used to be a single unlabelled sun icon opening a menu: you could change
 * the theme but not see which of light/dark/system was active without opening
 * it — and the row directly below it on the same Settings card (time format)
 * was already a segmented control. Same shape for the same kind of choice.
 *
 * No mounted-guard here: the usual next-themes dance exists for server-rendered
 * apps, and this is a pure client-rendered SPA — the provider has already read
 * storage by the time anything renders.
 */
export function ThemeToggle() {
  const { setTheme, theme } = useTheme();

  return (
    <SegmentedControl
      label="Theme"
      options={[...OPTIONS]}
      value={(theme as ThemeValue) ?? "system"}
      onChange={setTheme}
    />
  );
}
