import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { SegmentedControl } from "@/components/ui/segmented-control";
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
import { Spinner } from "@/components/ui/spinner";
import { Download, Palette } from "lucide-react";
import { useEntries } from "@/hooks/useEntries";
import { exportToCSV } from "@/lib/exportUtils";
import { useUIStore } from "@/stores/uiStore";
import { useUpdateSettings } from "@/hooks/useSettings";
import { useRecolorProjects } from "@/hooks/useProjects";
import { CURRENCIES } from "@/lib/currency";
import { IntegrationsCard } from "@/components/integrations/IntegrationsCard";
import { GoogleCalendarCard } from "@/components/settings/GoogleCalendarCard";
import { ProductivityCard } from "@/components/settings/ProductivityCard";
import { DigestCard } from "@/components/settings/DigestCard";
import { AssistantMemoryCard } from "@/components/settings/AssistantMemoryCard";
import { RecurringEntriesCard } from "@/components/settings/RecurringEntriesCard";
import { TeamCard } from "@/components/settings/TeamCard";
import { AccountCard } from "@/components/settings/AccountCard";
import { SessionsCard } from "@/components/settings/SessionsCard";
import { ConnectedAccountsCard } from "@/components/settings/ConnectedAccountsCard";
import { PasskeysCard } from "@/components/settings/PasskeysCard";
import { DangerZoneCard } from "@/components/settings/DangerZoneCard";

import { getDefaultBillable, setDefaultBillable } from "@/lib/billable";
const TABS = ["general", "tracking", "workspace", "account"] as const;
type Tab = (typeof TABS)[number];

// ── Settings page ────────────────────────────────────────────────────────────

export function SettingsPage() {
  const { data: entries = [] } = useEntries(365);

  // — Preferences state
  const [defaultBillable, setDefaultBillableState] = useState<boolean>(getDefaultBillable);
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
    setDefaultBillableState(checked);
    setDefaultBillable(checked);
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

  // The active tab lives in the query string so a settings link can point at a
  // section and a reload lands where you were. Unknown values fall back rather
  // than rendering an empty page.
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("tab");
  const tab = TABS.includes(requested as Tab) ? (requested as Tab) : "general";
  const setTab = (next: string) => {
    const params = new URLSearchParams(searchParams);
    params.set("tab", next);
    setSearchParams(params, { replace: true });
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-xl font-semibold">Settings</h1>

      {/*
        Fifteen cards used to stack into one 3,808px scroll with 41 controls and
        no sectioning — the "config-everything settings screen" PRODUCT.md
        rejects by name. Four groups named for what you came to do, not for
        which subsystem owns the setting.

        The tab lives in the URL so /settings?tab=account is linkable and a
        reload doesn't dump you back at the top of General.
      */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="tracking">Tracking</TabsTrigger>
          <TabsTrigger value="workspace">Workspace</TabsTrigger>
          <TabsTrigger value="account">Account</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-4 space-y-4">
      {/* Appearance */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Appearance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Label>Theme</Label>
              <p className="mt-1 text-xs leading-normal text-muted-foreground">
                Choose light, dark, or system default
              </p>
            </div>
            <ThemeToggle />
          </div>

          <Separator />

          {/* Auto-assign colors */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="pr-2">
              <Label htmlFor="pref-autocolor" className="flex items-center gap-1.5">
                <Palette className="h-3.5 w-3.5" />
                Auto-assign colors
              </Label>
              <p className="mt-1 text-xs leading-normal text-muted-foreground">
                Give new projects a distinct color automatically. "Apply to existing"
                uses AI to color your current projects distinctly.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => recolorProjects.mutate()}
                // Reads as actionable while the setting it belongs to is off,
                // which is the one state where pressing it contradicts the
                // switch beside it.
                disabled={recolorProjects.isPending || !autoAssignColors}
                title={
                  autoAssignColors
                    ? "Spread distinct colors across your existing projects"
                    : "Turn on auto-assign colors to recolor existing projects"
                }
              >
                {recolorProjects.isPending ? (
                  <Spinner size="sm" />
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

      {/* Preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Preferences</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Default billable */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Label htmlFor="pref-billable">Default billable</Label>
              <p className="mt-1 text-xs leading-normal text-muted-foreground">
                New timers start billable unless the project says otherwise
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
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Label>Time display format</Label>
              <p className="mt-1 text-xs leading-normal text-muted-foreground">
                How times are shown throughout the app
              </p>
            </div>
            <SegmentedControl
              label="Time display format"
              options={[
                { value: "24h", label: "24h" },
                { value: "12h", label: "12h" },
              ]}
              value={timeFormat}
              onChange={handleTimeFormatChange}
            />
          </div>

          <Separator />

          {/* Currency */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Label htmlFor="pref-currency">Currency</Label>
              <p className="mt-1 text-xs leading-normal text-muted-foreground">
                Used for billable amounts in reports
              </p>
            </div>
            <Select value={currency} onValueChange={handleCurrencyChange}>
              <SelectTrigger className="w-48 text-sm" id="pref-currency">
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
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Label htmlFor="pref-week-start">Week starts on</Label>
              <p className="mt-1 text-xs leading-normal text-muted-foreground">
                First day of the week in the calendar and timesheet
              </p>
            </div>
            <Select value={String(weekStart)} onValueChange={handleWeekStartChange}>
              <SelectTrigger className="w-48 text-sm" id="pref-week-start">
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
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Label htmlFor="pref-weekends">Show weekends</Label>
              <p className="mt-1 text-xs leading-normal text-muted-foreground">
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

        </TabsContent>

        <TabsContent value="tracking" className="mt-4 space-y-4">
          <ProductivityCard />
          <DigestCard />
          <RecurringEntriesCard />
          <AssistantMemoryCard />
        </TabsContent>

        <TabsContent value="workspace" className="mt-4 space-y-4">
          <TeamCard />
          <GoogleCalendarCard />
          <IntegrationsCard />

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
        </TabsContent>

        <TabsContent value="account" className="mt-4 space-y-4">
          <AccountCard />
          <PasskeysCard />
          <ConnectedAccountsCard />
          <SessionsCard />
          <DangerZoneCard />
        </TabsContent>
      </Tabs>
    </div>
  );
}
