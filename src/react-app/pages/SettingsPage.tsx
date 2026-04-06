import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { useEntries } from "@/hooks/useEntries";
import { exportToCSV } from "@/lib/exportUtils";
import type { TimeEntry } from "@shared/schemas";

export function SettingsPage() {
  const { data: entries = [] } = useEntries(365);

  const handleExportAll = () => {
    exportToCSV(entries as TimeEntry[], "all-time-entries");
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          App preferences and data management
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Appearance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Theme</Label>
              <p className="text-xs text-muted-foreground">
                Choose light, dark, or system default
              </p>
            </div>
            <ThemeToggle />
          </div>
        </CardContent>
      </Card>

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
    </div>
  );
}
