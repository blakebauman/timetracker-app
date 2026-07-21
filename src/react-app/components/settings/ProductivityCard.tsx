import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUIStore } from "@/stores/uiStore";
import { useAssistantStore } from "@/stores/assistantStore";
import {
  requestNotifyPermission,
  notificationsSupported,
  canNotify,
} from "@/lib/notify";

const MINUTE_OPTIONS = [1, 3, 5, 10, 15, 20, 25, 30, 45, 60];

function MinuteSelect({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <Select
      value={String(value)}
      onValueChange={(v) => onChange(Number(v))}
      disabled={disabled}
    >
      <SelectTrigger className="w-28 text-sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {MINUTE_OPTIONS.map((m) => (
          <SelectItem key={m} value={String(m)}>
            {m} min
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// Device-local productivity preferences: idle detection, tracking reminders, and
// pomodoro. Reminders/pomodoro rely on the Web Notifications permission.
export function ProductivityCard() {
  const p = useUIStore((s) => s.productivity);
  const setProductivity = useUIStore((s) => s.setProductivity);
  const alertsEnabled = useAssistantStore((s) => s.alertsEnabled);
  const setAlertsEnabled = useAssistantStore((s) => s.setAlertsEnabled);
  const [granted, setGranted] = useState(canNotify());

  const enableNotifications = async () => {
    const ok = await requestNotifyPermission();
    setGranted(ok);
    toast[ok ? "success" : "error"](
      ok ? "Notifications enabled" : "Notifications permission was denied"
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Productivity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Notifications permission */}
        {notificationsSupported() && !granted && (
          <>
            <div className="flex items-center justify-between">
              <div className="pr-4">
                <Label>Browser notifications</Label>
                <p className="mt-1 text-xs leading-normal text-muted-foreground">
                  Required for reminders, pomodoro, and assistant alerts when the tab
                  is in the background.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={enableNotifications}>
                Enable
              </Button>
            </div>
            <Separator />
          </>
        )}

        {/* Idle detection */}
        <div className="flex items-center justify-between gap-3">
          <div className="pr-2">
            <Label htmlFor="pref-idle">Idle detection</Label>
            <p className="mt-1 text-xs leading-normal text-muted-foreground">
              Prompt to keep or discard time when you step away while tracking.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <MinuteSelect
              value={p.idleThresholdMinutes}
              onChange={(v) => setProductivity({ idleThresholdMinutes: v })}
              disabled={!p.idleEnabled}
            />
            <Switch
              id="pref-idle"
              checked={p.idleEnabled}
              onCheckedChange={(v) => setProductivity({ idleEnabled: v })}
            />
          </div>
        </div>

        <Separator />

        {/* Tracking reminders */}
        <div className="flex items-center justify-between gap-3">
          <div className="pr-2">
            <Label htmlFor="pref-reminder">Not-tracking reminders</Label>
            <p className="mt-1 text-xs leading-normal text-muted-foreground">
              Nudge me when no timer is running.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <MinuteSelect
              value={p.reminderIntervalMinutes}
              onChange={(v) => setProductivity({ reminderIntervalMinutes: v })}
              disabled={!p.reminderEnabled}
            />
            <Switch
              id="pref-reminder"
              checked={p.reminderEnabled}
              onCheckedChange={(v) => setProductivity({ reminderEnabled: v })}
            />
          </div>
        </div>

        <Separator />

        {/* Assistant nudge alerts */}
        <div className="flex items-center justify-between gap-3">
          <div className="pr-2">
            <Label htmlFor="pref-aski-alerts">Assistant nudge alerts</Label>
            <p className="mt-1 text-xs leading-normal text-muted-foreground">
              Toast when the assistant notices something new — untracked meetings,
              long-running timers. Each nudge alerts once.
            </p>
          </div>
          <Switch
            id="pref-aski-alerts"
            checked={alertsEnabled}
            onCheckedChange={setAlertsEnabled}
          />
        </div>

        <Separator />

        {/* Pomodoro */}
        <div className="flex items-center justify-between gap-3">
          <div className="pr-2">
            <Label htmlFor="pref-pomodoro">Pomodoro</Label>
            <p className="mt-1 text-xs leading-normal text-muted-foreground">
              Focus / break cycle alerts while a timer runs.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <MinuteSelect
              value={p.pomodoroWorkMinutes}
              onChange={(v) => setProductivity({ pomodoroWorkMinutes: v })}
              disabled={!p.pomodoroEnabled}
            />
            <span className="text-xs text-muted-foreground">/</span>
            <MinuteSelect
              value={p.pomodoroBreakMinutes}
              onChange={(v) => setProductivity({ pomodoroBreakMinutes: v })}
              disabled={!p.pomodoroEnabled}
            />
            <Switch
              id="pref-pomodoro"
              checked={p.pomodoroEnabled}
              onCheckedChange={(v) => setProductivity({ pomodoroEnabled: v })}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
