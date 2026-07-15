import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { CalendarDays, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useCalendarStatus, useDisconnectCalendar } from "@/hooks/useCalendarSync";

export function GoogleCalendarCard() {
  const [params, setParams] = useSearchParams();
  const { data: status, isLoading } = useCalendarStatus();
  const disconnect = useDisconnectCalendar();

  // Surface the OAuth round-trip result (redirected back to /settings?calendar=…).
  useEffect(() => {
    const result = params.get("calendar");
    if (!result) return;
    if (result === "connected") toast.success("Google Calendar connected");
    else if (result === "not_configured")
      toast.error("Calendar sync isn't configured on this server");
    else if (result === "error") toast.error("Couldn't connect Google Calendar");
    params.delete("calendar");
    setParams(params, { replace: true });
  }, [params, setParams]);

  const connect = () => {
    // Full-page navigation — the worker redirects to Google's consent screen.
    window.location.href = "/api/calendar/google/connect";
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarDays className="h-4 w-4" />
          Google Calendar
          {status?.connected && (
            <Badge variant="secondary" className="text-[10px]">
              Connected
            </Badge>
          )}
        </CardTitle>
        {!isLoading && status?.configured && (
          status.connected ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => disconnect.mutate()}
              disabled={disconnect.isPending}
            >
              {disconnect.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Disconnect"}
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={connect}>
              Connect
            </Button>
          )
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-4 w-64" />
        ) : !status?.configured ? (
          <p className="text-sm text-muted-foreground">
            Calendar sync isn't configured on this server yet.
          </p>
        ) : status.connected ? (
          <p className="text-sm text-muted-foreground">
            Syncing {status.accountEmail ? <span className="font-medium">{status.accountEmail}</span> : "your calendar"}.
            Your events show up on the <span className="font-medium">Calendar</span> as dashed blocks —
            click one to track it as a time entry.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Connect your Google Calendar to see your events on the calendar and turn
            them into tracked time with one click. Read-only — we never change your calendar.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
