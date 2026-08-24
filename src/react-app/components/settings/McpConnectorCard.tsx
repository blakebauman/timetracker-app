import { useState } from "react";
import { Check, Copy, KeyRound, Plug, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useApiKeys, useCreateApiKey, useRevokeApiKey } from "@/hooks/useApiKeys";
import { formatShortDate } from "@/lib/dateUtils";
import type { ApiKey, ApiKeyScope } from "@shared/schemas";

const MCP_URL = `${window.location.origin}/mcp`;

/** Copy-to-clipboard that says so, rather than looking like nothing happened. */
function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-success-ink" /> : <Copy className="h-3.5 w-3.5" />}
    </Button>
  );
}

function KeyRow({ apiKey, onRevoke }: { apiKey: ApiKey; onRevoke: (id: string) => void }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="flex items-center gap-3 rounded-lg border px-3 py-2">
      <KeyRound className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{apiKey.name}</span>
          <Badge variant="outline" className="text-micro">
            {apiKey.scope === "read_write" ? "Read + write" : "Read only"}
          </Badge>
        </div>
        <p className="mt-0.5 font-mono text-micro text-muted-foreground">
          {apiKey.prefix}…{" "}
          <span className="font-sans">
            · created {formatShortDate(apiKey.createdAt)} ·{" "}
            {apiKey.lastUsedAt
              ? `last used ${formatShortDate(apiKey.lastUsedAt)}`
              : "never used"}
          </span>
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        className="text-muted-foreground"
        onClick={() => setConfirming(true)}
        aria-label={`Revoke ${apiKey.name}`}
        title="Revoke"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Revoke "${apiKey.name}"?`}
        description="Anything using this key stops working immediately. This can't be undone."
        confirmLabel="Revoke"
        onConfirm={() => onRevoke(apiKey.id)}
      />
    </div>
  );
}

/**
 * The MCP connector: point Claude, ChatGPT or any other MCP client at this
 * workspace's time data and ask it questions in plain language.
 *
 * The card leads with the endpoint and the key because that is the entire
 * setup — there is nothing to configure beyond a credential the user can revoke
 * here the moment they want to.
 */
export function McpConnectorCard() {
  const { data: keys = [], isLoading } = useApiKeys();
  const createKey = useCreateApiKey();
  const revokeKey = useRevokeApiKey();

  const [name, setName] = useState("");
  const [scope, setScope] = useState<ApiKeyScope>("read");
  // Held only in component state, and only until the card is left: the server
  // cannot return it again.
  const [freshKey, setFreshKey] = useState<string | null>(null);

  const create = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    createKey.mutate(
      { name: trimmed, scope },
      {
        onSuccess: ({ plaintext }) => {
          setFreshKey(plaintext);
          setName("");
        },
      }
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Plug className="h-4 w-4" />
          MCP connector
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <p className="text-xs leading-normal text-muted-foreground">
            Connect Claude, ChatGPT, or any MCP client to this workspace and ask about
            your time in plain language — hours by client, where a project stands
            against its budget, what you worked on last Thursday. A read + write key
            can also start and stop timers and log entries.
          </p>
          <div className="mt-3">
            <Label>Server URL</Label>
            <div className="mt-1 flex items-center gap-2">
              <code className="flex-1 truncate rounded-md border bg-muted px-2 py-1.5 font-mono text-xs">
                {MCP_URL}
              </code>
              <CopyButton value={MCP_URL} label="Copy the MCP server URL" />
            </div>
            <p className="mt-1.5 text-micro text-muted-foreground">
              Streamable HTTP. Authenticate with{" "}
              <code className="font-mono">Authorization: Bearer &lt;your key&gt;</code>.
            </p>
          </div>
        </div>

        {freshKey && (
          <Alert>
            <AlertTitle>Copy this key now</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>
                It is shown once and cannot be recovered. If you lose it, revoke it and
                make another.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 overflow-x-auto rounded-md border bg-background px-2 py-1.5 font-mono text-xs">
                  {freshKey}
                </code>
                <CopyButton value={freshKey} label="Copy the new API key" />
              </div>
              <Button variant="outline" size="sm" onClick={() => setFreshKey(null)}>
                Done
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <Separator />

        <div className="space-y-2">
          <Label htmlFor="key-name">New key</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="key-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && create()}
              placeholder="What will use it? e.g. Claude Desktop"
              className="h-9 flex-1"
            />
            <Select value={scope} onValueChange={(v) => setScope(v as ApiKeyScope)}>
              <SelectTrigger className="h-9 w-40 text-sm" aria-label="Key permissions">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="read">Read only</SelectItem>
                <SelectItem value="read_write">Read + write</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              className="h-9"
              onClick={create}
              disabled={!name.trim() || createKey.isPending}
            >
              {createKey.isPending ? <Spinner size="sm" /> : "Create key"}
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-4">
            <Spinner className="text-muted-foreground" />
          </div>
        ) : keys.length > 0 ? (
          <div className="space-y-2">
            {keys.map((k) => (
              <KeyRow key={k.id} apiKey={k} onRevoke={(id) => revokeKey.mutate(id)} />
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            No keys yet. Nothing outside this browser can reach your data.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
