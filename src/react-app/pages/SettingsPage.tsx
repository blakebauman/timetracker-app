import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Download, Pencil, Check, X } from "lucide-react";
import { useEntries } from "@/hooks/useEntries";
import { exportToCSV } from "@/lib/exportUtils";
import { useAuth } from "@/hooks/useAuth";
import { authClient } from "@/lib/auth-client";

// ── Preferences helpers ──────────────────────────────────────────────────────

function getDefaultBillable(): boolean {
  return localStorage.getItem("pref_defaultBillable") === "true";
}

function getTimeFormat(): "24h" | "12h" {
  const v = localStorage.getItem("pref_timeFormat");
  return v === "12h" ? "12h" : "24h";
}

// ── Settings page ────────────────────────────────────────────────────────────

export function SettingsPage() {
  const { data: entries = [] } = useEntries(365);
  const { user } = useAuth();

  // — Preferences state
  const [defaultBillable, setDefaultBillable] = useState<boolean>(getDefaultBillable);
  const [timeFormat, setTimeFormat] = useState<"24h" | "12h">(getTimeFormat);

  // — Account / edit-name state
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(user?.name ?? "");
  const [nameStatus, setNameStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // — Account / change-password state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordStatus, setPasswordStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [passwordPending, setPasswordPending] = useState(false);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleExportAll = () => {
    exportToCSV(entries, "all-time-entries");
  };

  const handleDefaultBillableChange = (checked: boolean) => {
    setDefaultBillable(checked);
    localStorage.setItem("pref_defaultBillable", String(checked));
  };

  const handleTimeFormatChange = (value: "24h" | "12h") => {
    setTimeFormat(value);
    localStorage.setItem("pref_timeFormat", value);
  };

  const handleStartEditName = () => {
    setNameValue(user?.name ?? "");
    setNameStatus(null);
    setEditingName(true);
  };

  const handleCancelEditName = () => {
    setEditingName(false);
    setNameStatus(null);
  };

  const handleSaveName = async () => {
    const trimmed = nameValue.trim();
    if (!trimmed) return;
    try {
      const result = await authClient.updateUser({ name: trimmed });
      if (result.error) {
        setNameStatus({ type: "error", message: result.error.message ?? "Failed to update name." });
      } else {
        setNameStatus({ type: "success", message: "Name updated." });
        setEditingName(false);
      }
    } catch {
      setNameStatus({ type: "error", message: "An unexpected error occurred." });
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword) return;
    setPasswordPending(true);
    setPasswordStatus(null);
    try {
      const result = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: false,
      });
      if (result.error) {
        setPasswordStatus({ type: "error", message: result.error.message ?? "Failed to change password." });
      } else {
        setPasswordStatus({ type: "success", message: "Password changed successfully." });
        setCurrentPassword("");
        setNewPassword("");
      }
    } catch {
      setPasswordStatus({ type: "error", message: "An unexpected error occurred." });
    } finally {
      setPasswordPending(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">
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
              <p className="text-xs text-muted-foreground">
                Choose light, dark, or system default
              </p>
            </div>
            <ThemeToggle />
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
              <p className="text-xs text-muted-foreground">
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
              <p className="text-xs text-muted-foreground">
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
        </CardContent>
      </Card>

      {/* Account */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Edit name */}
          <div className="space-y-2">
            <Label>Name</Label>
            {editingName ? (
              <div className="flex items-center gap-2">
                <Input
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                  className="h-8 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveName();
                    if (e.key === "Escape") handleCancelEditName();
                  }}
                  autoFocus
                />
                <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={handleSaveName} title="Save">
                  <Check className="h-4 w-4 text-green-600" />
                </Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={handleCancelEditName} title="Cancel">
                  <X className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm">{user?.name ?? "—"}</span>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={handleStartEditName} title="Edit name">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
            {nameStatus && (
              <p className={`text-xs ${nameStatus.type === "success" ? "text-green-600" : "text-destructive"}`}>
                {nameStatus.message}
              </p>
            )}
          </div>

          <Separator />

          {/* Change password */}
          <div className="space-y-3">
            <div>
              <Label>Change password</Label>
            </div>
            <div className="space-y-2">
              <Input
                type="password"
                placeholder="Current password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="h-8 text-sm"
              />
              <Input
                type="password"
                placeholder="New password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleChangePassword}
              disabled={passwordPending || !currentPassword || !newPassword}
            >
              {passwordPending ? "Saving…" : "Change password"}
            </Button>
            {passwordStatus && (
              <p className={`text-xs ${passwordStatus.type === "success" ? "text-green-600" : "text-destructive"}`}>
                {passwordStatus.message}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
