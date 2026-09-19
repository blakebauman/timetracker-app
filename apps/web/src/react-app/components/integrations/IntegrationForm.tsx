import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useCreateIntegration,
  useUpdateIntegration,
  useTestIntegration,
} from "@/hooks/useIntegrations";
import { mutationErrorMessage } from "@/lib/api";
import type {
  CreateIntegration,
  Integration,
  IntegrationType,
} from "@timetracker/core/schemas";

interface IntegrationFormProps {
  integration?: Integration;
  open: boolean;
  onClose: () => void;
}

const TYPE_LABELS: Record<IntegrationType, string> = {
  workfront: "Adobe Workfront",
  dynamics: "Microsoft Dynamics 365",
};

const BASE_URL_HINT: Record<IntegrationType, string> = {
  workfront: "e.g. acme.my.workfront.com",
  dynamics: "e.g. https://acme.crm.dynamics.com",
};

export function IntegrationForm({ integration, open, onClose }: IntegrationFormProps) {
  const isEdit = !!integration;
  const [type, setType] = useState<IntegrationType>(integration?.type ?? "workfront");
  const [name, setName] = useState(integration?.name ?? "");
  const [baseUrl, setBaseUrl] = useState(integration?.baseUrl ?? "");
  // Credentials are never returned from the server; blank means "keep existing".
  const [apiKey, setApiKey] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [testStatus, setTestStatus] = useState<{ ok: boolean; message: string } | null>(null);

  const createIntegration = useCreateIntegration();
  const updateIntegration = useUpdateIntegration();
  const testIntegration = useTestIntegration();
  const isPending = createIntegration.isPending || updateIntegration.isPending;

  const buildCredentials = ():
    | { apiKey: string }
    | { tenantId: string; clientId: string; clientSecret: string }
    | null => {
    if (type === "workfront") {
      return apiKey ? { apiKey } : null;
    }
    if (tenantId || clientId || clientSecret) {
      return { tenantId, clientId, clientSecret };
    }
    return null;
  };

  const credentialsComplete =
    type === "workfront"
      ? !!apiKey
      : !!(tenantId && clientId && clientSecret);

  // Create requires full credentials; edit only requires them if changing.
  const canSubmit =
    !!name.trim() &&
    !!baseUrl.trim() &&
    (isEdit || credentialsComplete) &&
    !isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    const credentials = buildCredentials();

    if (isEdit) {
      updateIntegration.mutate(
        {
          id: integration!.id,
          data: {
            name,
            baseUrl,
            ...(credentials ? { credentials } : {}),
          },
        },
        { onSuccess: onClose }
      );
    } else {
      // credentialsComplete guarantees credentials is non-null here.
      createIntegration.mutate(
        { type, name, baseUrl, credentials } as CreateIntegration,
        { onSuccess: onClose }
      );
    }
  };

  const handleTest = async () => {
    if (!integration) return;
    setTestStatus(null);
    try {
      const result = await testIntegration.mutateAsync(integration.id);
      setTestStatus(
        result.ok
          ? { ok: true, message: "Connection successful" }
          : { ok: false, message: result.error ?? "Connection failed" }
      );
    } catch (err) {
      // The hook has no onError of its own, so an unhandled rejection here was
      // a silent "Testing…" that simply stopped.
      toast.error(mutationErrorMessage(err, "Couldn't reach the integration"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit integration" : "Add integration"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Rename the connection or rotate its credentials."
              : "Connect a system you can push tracked time to."}
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4 py-2" onSubmit={handleSubmit} noValidate>
          {/* Type */}
          <div className="space-y-1.5">
            <Label htmlFor="integration-type">System</Label>
            {isEdit ? (
              <p className="text-sm text-muted-foreground">{TYPE_LABELS[type]}</p>
            ) : (
              <Select value={type} onValueChange={(v) => setType(v as IntegrationType)}>
                <SelectTrigger id="integration-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="workfront">{TYPE_LABELS.workfront}</SelectItem>
                  <SelectItem value="dynamics">{TYPE_LABELS.dynamics}</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="integration-name">Name</Label>
            <Input
              id="integration-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Workfront – Acme"
              autoFocus
            />
          </div>

          {/* Base URL */}
          <div className="space-y-1.5">
            <Label htmlFor="integration-base-url">
              {type === "workfront" ? "Workfront domain" : "Organization URL"}
            </Label>
            <Input
              id="integration-base-url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={BASE_URL_HINT[type]}
              autoComplete="off"
            />
          </div>

          {/* Credentials */}
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium leading-none">Credentials</legend>
            <p className="text-xs text-muted-foreground">
              {type === "workfront"
                ? "Create an API key in Workfront (Setup → System → API Keys), or reuse your personal API key."
                : "From your Microsoft Entra ID app registration: tenant ID, client ID, and a client secret."}
              {isEdit ? " Leave blank to keep the current credentials." : ""}
            </p>
            {/* Visible labels rather than placeholders: a placeholder vanishes
                on the first keystroke, and a pasted secret with no label is
                unverifiable — which one is the tenant id? */}
            {type === "workfront" ? (
              <div className="space-y-1.5">
                <Label htmlFor="integration-api-key">API key</Label>
                <Input
                  id="integration-api-key"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  autoComplete="off"
                />
              </div>
            ) : (
              <div className="space-y-2">
                <div className="space-y-1.5">
                  <Label htmlFor="integration-tenant-id">Tenant ID</Label>
                  <Input
                    id="integration-tenant-id"
                    value={tenantId}
                    onChange={(e) => setTenantId(e.target.value)}
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="integration-client-id">Client ID</Label>
                  <Input
                    id="integration-client-id"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="integration-client-secret">Client secret</Label>
                  <Input
                    id="integration-client-secret"
                    type="password"
                    value={clientSecret}
                    onChange={(e) => setClientSecret(e.target.value)}
                    autoComplete="off"
                  />
                </div>
              </div>
            )}
          </fieldset>

          {testStatus && (
            <p className={`text-xs ${testStatus.ok ? "text-success-ink" : "text-destructive"}`}>
              {testStatus.message}
            </p>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            {isEdit && (
              <Button
                type="button"
                variant="outline"
                onClick={handleTest}
                disabled={testIntegration.isPending}
                className="mr-auto gap-1.5"
              >
                {testIntegration.isPending && <Spinner size="sm" />}
                {testIntegration.isPending ? "Testing…" : "Test connection"}
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit} className="gap-1.5">
              {isPending && <Spinner size="sm" />}
              {isEdit ? "Save changes" : "Add integration"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
