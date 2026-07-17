import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, Palette, Loader2 } from "lucide-react";
import { useEntries } from "@/hooks/useEntries";
import { exportToCSV } from "@/lib/exportUtils";
import { useUIStore } from "@/stores/uiStore";
import { useUpdateSettings } from "@/hooks/useSettings";
import { useRecolorProjects } from "@/hooks/useProjects";
import { CURRENCIES } from "@/lib/currency";
import { IntegrationsCard } from "@/components/integrations/IntegrationsCard";
import { GoogleCalendarCard } from "@/components/settings/GoogleCalendarCard";
import { ProductivityCard } from "@/components/settings/ProductivityCard";
import { RecurringEntriesCard } from "@/components/settings/RecurringEntriesCard";
import { TeamCard } from "@/components/settings/TeamCard";
import { AccountCard } from "@/components/settings/AccountCard";
import { SessionsCard } from "@/components/settings/SessionsCard";
import { ConnectedAccountsCard } from "@/components/settings/ConnectedAccountsCard";
import { TwoFactorCard } from "@/components/settings/TwoFactorCard";
import { PasskeysCard } from "@/components/settings/PasskeysCard";
import { DangerZoneCard } from "@/components/settings/DangerZoneCard";

// ── Preferences helpers ──────────────────────────────────────────────────────

function getDefaultBillable(): boolean {
  return localStorage.getItem("pref_defaultBillable") === "true";
}

// ── Settings page ────────────────────────────────────────────────────────────

export function SettingsPage() {
  const { data: entries = [] } = useEntries(365);

  // — Preferences state
  const [defaultBillable, setDefaultBillable] = useState<boolean>(getDefaultBillable);
  const timeFormat = useUIStore((s) => s.timeFormat);
  const setTimeFormatStore = useUIStore((s) => s.setTimeFormat);
  const currency = useUIStore((s) => s.currency);
  const setCurrencyStore = useUIStore((s) => s.setCurrency);
  const weekStart = useUIStore((s) => s.weekStart);
  const setWeekStartStore = useUIStore((s) => s.setWeekStart);
  const showWeekends = useUIStore((s) => s.showWeekends);
  const setShowWeekendsStore = useUIStore((s) => s.setShowWeekends);
  const autoAssignColors = useUIStore((s) => s.autoAssignColors);
  const setAutoAssignColorsStore = useUIStore((s) => s.setAutoAssignColors);
  const updateSettings = useUpdateSettings();
  const recolorProjects = useRecolorProjects();

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleExportAll = () => {
    exportToCSV(entries, "all-time-entries");
  };

  const handleDefaultBillableChange = (checked: boolean) => {
    setDefaultBillable(checked);
    localStorage.setItem("pref_defaultBillable", String(checked));
  };

  const handleTimeFormatChange = (value: "24h" | "12h") => {
    setTimeFormatStore(value); // optimistic; server confirms via mutation
    updateSettings.mutate({ timeFormat: value });
  };

  const handleCurrencyChange = (value: string) => {
    setCurrencyStore(value); // optimistic; server confirms via mutation
    updateSettings.mutate({ currency: value });
  };

  const handleWeekStartChange = (value: string) => {
    const n = Number(value);
    setWeekStartStore(n); // optimistic; server confirms via mutation
    updateSettings.mutate({ weekStart: n });
  };

  const handleShowWeekendsChange = (checked: boolean) => {
    setShowWeekendsStore(checked); // optimistic; server confirms via mutation
    updateSettings.mutate({ showWeekends: checked });
  };

  const handleAutoAssignColorsChange = (checked: boolean) => {
    setAutoAssignColorsStore(checked); // optimistic; server confirms via mutation
    updateSettings.mutate({ autoAssignColors: checked });
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-sm leading-normal text-muted-foreground">
          App preferences and data management
        </p>
      </div>

      {/* Appearance */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Appearance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Theme</Label>
              <p className="text-xs leading-normal text-muted-foreground">
                Choose light, dark, or system default
              </p>
            </div>
            <ThemeToggle />
          </div>

          <Separator />

          {/* Auto-assign colors */}
          <div className="flex items-center justify-between gap-3">
            <div className="pr-2">
              <Label htmlFor="pref-autocolor" className="flex items-center gap-1.5">
                <Palette className="h-3.5 w-3.5" />
                Auto-assign colors
              </Label>
              <p className="text-xs leading-normal text-muted-foreground">
                Give new projects a distinct color automatically. "Apply to existing"
                uses AI to color your current projects distinctly.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => recolorProjects.mutate()}
                disabled={recolorProjects.isPending}
                title="Spread distinct colors across your existing projects"
              >
                {recolorProjects.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  "Apply to existing"
                )}
              </Button>
              <Switch
                id="pref-autocolor"
                checked={autoAssignColors}
                onCheckedChange={handleAutoAssignColorsChange}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Keyboard shortcuts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Keyboard shortcuts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Start / Stop timer</span>
            <kbd className="rounded border bg-muted px-2 py-0.5 font-mono text-xs">
              Alt+Shift+S
            </kbd>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Discard running timer</span>
            <kbd className="rounded border bg-muted px-2 py-0.5 font-mono text-xs">
              Alt+Shift+X
            </kbd>
          </div>
        </CardContent>
      </Card>

      {/* Data export */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Data export</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-muted-foreground">
            Export all your time entries as a CSV file.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={handleExportAll}
          >
            <Download className="h-4 w-4" />
            Export all entries (CSV)
          </Button>
        </CardContent>
      </Card>

      {/* Preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Preferences</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Default billable */}
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="pref-billable">Default billable</Label>
              <p className="text-xs leading-normal text-muted-foreground">
                New time entries are billable by default
              </p>
            </div>
            <Switch
              id="pref-billable"
              checked={defaultBillable}
              onCheckedChange={handleDefaultBillableChange}
            />
          </div>

          <Separator />

          {/* Time display format */}
          <div className="flex items-center justify-between">
            <div>
              <Label>Time display format</Label>
              <p className="text-xs leading-normal text-muted-foreground">
                How times are shown throughout the app
              </p>
            </div>
            <div className="flex items-center gap-1 rounded-md border p-0.5">
              <button
                type="button"
                onClick={() => handleTimeFormatChange("24h")}
                className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                  timeFormat === "24h"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                24h
              </button>
              <button
                type="button"
                onClick={() => handleTimeFormatChange("12h")}
                className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                  timeFormat === "12h"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                12h
              </button>
            </div>
          </div>

          <Separator />

          {/* Currency */}
          <div className="flex items-center justify-between">
            <div>
              <Label>Currency</Label>
              <p className="text-xs leading-normal text-muted-foreground">
                Used for billable amounts in reports
              </p>
            </div>
            <Select value={currency} onValueChange={handleCurrencyChange}>
              <SelectTrigger className="w-48 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Week start */}
          <div className="flex items-center justify-between">
            <div>
              <Label>Week starts on</Label>
              <p className="text-xs leading-normal text-muted-foreground">
                First day of the week in the calendar and timesheet
              </p>
            </div>
            <Select value={String(weekStart)} onValueChange={handleWeekStartChange}>
              <SelectTrigger className="w-48 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Sunday</SelectItem>
                <SelectItem value="1">Monday</SelectItem>
                <SelectItem value="6">Saturday</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Show weekends */}
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="pref-weekends">Show weekends</Label>
              <p className="text-xs leading-normal text-muted-foreground">
                Include Saturday and Sunday columns on the calendar
              </p>
            </div>
            <Switch
              id="pref-weekends"
              checked={showWeekends}
              onCheckedChange={handleShowWeekendsChange}
            />
          </div>
        </CardContent>
      </Card>

      {/* Productivity */}
      <ProductivityCard />

      {/* Recurring entries */}
      <RecurringEntriesCard />

      {/* Team */}
      <TeamCard />

      {/* Calendar sync */}
      <GoogleCalendarCard />

      {/* Integrations */}
      <IntegrationsCard />

      {/* Account */}
      <AccountCard />

      {/* Security */}
      <TwoFactorCard />
      <PasskeysCard />
      <ConnectedAccountsCard />
      <SessionsCard />

      {/* Danger zone */}
      <DangerZoneCard />
    </div>
  );
}
