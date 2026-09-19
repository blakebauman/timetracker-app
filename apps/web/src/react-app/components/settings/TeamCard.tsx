import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { authClient } from "@/lib/auth-client";
import { mutationErrorMessage } from "@/lib/api";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { UserAvatar } from "@/components/layout/UserAvatar";
import { X, Mail } from "lucide-react";
import { toast } from "sonner";

export function TeamCard() {
  const { data: org, isPending, refetch } = authClient.useActiveOrganization();
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePending, setInvitePending] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [removingMember, setRemovingMember] = useState<{ id: string; name: string } | null>(
    null
  );
  const [cancellingInvite, setCancellingInvite] = useState<{ id: string; email: string } | null>(
    null
  );

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInvitePending(true);
    setInviteError("");
    const { error } = await authClient.organization.inviteMember({
      email: inviteEmail.trim(),
      role: "member",
    });
    setInvitePending(false);
    if (error) {
      // Better Auth's error is a plain object, never an ApiError, so every
      // handler below lands on its curated line — the server's wording never
      // reaches the UI.
      setInviteError(mutationErrorMessage(error, "Couldn't send that invitation"));
      return;
    }
    setInviteEmail("");
    refetch();
  };

  const handleCancelInvite = async (invitationId: string) => {
    const { error } = await authClient.organization.cancelInvitation({ invitationId });
    if (error) {
      toast.error(mutationErrorMessage(error, "Couldn't cancel that invitation"));
      return;
    }
    toast.success("Invitation cancelled");
    refetch();
  };

  const handleRoleChange = async (memberId: string, role: string) => {
    const { error } = await authClient.organization.updateMemberRole({ memberId, role });
    if (error) {
      toast.error(mutationErrorMessage(error, "Couldn't change that role"));
      return;
    }
    toast.success("Role updated");
    refetch();
  };

  const handleRemoveMember = async (memberId: string) => {
    const { error } = await authClient.organization.removeMember({ memberIdOrEmail: memberId });
    if (error) {
      toast.error(mutationErrorMessage(error, "Couldn't remove that member"));
      return;
    }
    toast.success("Member removed");
    refetch();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Team</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {isPending ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-2/3" />
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <Label>Members</Label>
              {org?.members?.length ? (
                <div className="space-y-2">
                  {org.members.map((member) => (
                    <div key={member.id} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <UserAvatar
                          name={member.user?.name}
                          email={member.user?.email}
                          image={member.user?.image}
                          className="h-7 w-7"
                        />
                        <div className="min-w-0">
                          <span className="font-medium">{member.user?.name ?? member.user?.email}</span>
                          <span className="ml-2 text-muted-foreground">{member.user?.email}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {member.role === "owner" ? (
                          <Badge variant="secondary">owner</Badge>
                        ) : (
                          <Select
                            value={member.role}
                            onValueChange={(role) => handleRoleChange(member.id, role)}
                          >
                            <SelectTrigger
                              size="sm"
                              className="h-7 w-24 text-xs"
                              aria-label={`Role for ${member.user?.name ?? member.user?.email}`}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="member">member</SelectItem>
                              <SelectItem value="admin">admin</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                        {member.role !== "owner" && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="icon-xs"
                                variant="ghost"
                                onClick={() =>
                                  setRemovingMember({
                                    id: member.id,
                                    name: member.user?.name ?? member.user?.email ?? "this member",
                                  })
                                }
                                aria-label="Remove member"
                                title="Remove member"
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Remove member</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm leading-normal text-muted-foreground">No members yet.</p>
              )}
            </div>

            {org?.invitations?.some((i) => i.status === "pending") && (
              <>
                <Separator />
                <div className="space-y-2">
                  <Label>Pending invitations</Label>
                  {org.invitations
                    .filter((i) => i.status === "pending")
                    .map((invitation) => (
                      <div key={invitation.id} className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <Mail className="h-3.5 w-3.5" />
                          {invitation.email}
                        </span>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon-xs"
                              variant="ghost"
                              onClick={() =>
                                setCancellingInvite({ id: invitation.id, email: invitation.email })
                              }
                              aria-label="Cancel invitation"
                              title="Cancel invitation"
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Cancel invitation</TooltipContent>
                        </Tooltip>
                      </div>
                    ))}
                </div>
              </>
            )}

            <Separator />

            <form onSubmit={handleInvite} className="space-y-2">
              <Label htmlFor="invite-email">Invite by email</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="invite-email"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="teammate@example.com"
                  className="h-8 text-sm"
                />
                <Button type="submit" size="sm" variant="outline" disabled={invitePending}>
                  {invitePending ? "Sending…" : "Invite"}
                </Button>
              </div>
              {inviteError && <p className="text-xs text-destructive">{inviteError}</p>}
            </form>
          </>
        )}
      </CardContent>

      <ConfirmDialog
        open={removingMember !== null}
        onOpenChange={(open) => !open && setRemovingMember(null)}
        title={`Remove ${removingMember?.name ?? "this member"} from the workspace?`}
        description="They lose access straight away. Time they tracked stays in the workspace."
        confirmLabel="Remove"
        onConfirm={() => {
          if (removingMember) handleRemoveMember(removingMember.id);
          setRemovingMember(null);
        }}
      />
      <ConfirmDialog
        open={cancellingInvite !== null}
        onOpenChange={(open) => !open && setCancellingInvite(null)}
        title={`Withdraw the invitation to ${cancellingInvite?.email ?? "this address"}?`}
        description="The link in their email stops working. You can invite them again any time."
        confirmLabel="Withdraw invitation"
        onConfirm={() => {
          if (cancellingInvite) handleCancelInvite(cancellingInvite.id);
          setCancellingInvite(null);
        }}
      />
    </Card>
  );
}
