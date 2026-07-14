import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { authClient } from "@/lib/auth-client";
import { UserAvatar } from "@/components/layout/UserAvatar";
import { X, Mail } from "lucide-react";
import { toast } from "sonner";

export function TeamCard() {
  const { data: org, isPending, refetch } = authClient.useActiveOrganization();
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePending, setInvitePending] = useState(false);
  const [inviteError, setInviteError] = useState("");

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
      setInviteError(error.message ?? "Failed to send invite");
      return;
    }
    setInviteEmail("");
    refetch();
  };

  const handleCancelInvite = async (invitationId: string) => {
    const { error } = await authClient.organization.cancelInvitation({ invitationId });
    if (error) {
      toast.error(error.message ?? "Failed to cancel invitation");
      return;
    }
    toast.success("Invitation cancelled");
    refetch();
  };

  const handleRoleChange = async (memberId: string, role: string) => {
    const { error } = await authClient.organization.updateMemberRole({ memberId, role });
    if (error) {
      toast.error(error.message ?? "Failed to update role");
      return;
    }
    toast.success("Role updated");
    refetch();
  };

  const handleRemoveMember = async (memberId: string) => {
    const { error } = await authClient.organization.removeMember({ memberIdOrEmail: memberId });
    if (error) {
      toast.error(error.message ?? "Failed to remove member");
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
                            <SelectTrigger size="sm" className="h-7 w-24 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="member">member</SelectItem>
                              <SelectItem value="admin">admin</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                        {member.role !== "owner" && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => handleRemoveMember(member.id)}
                            title="Remove member"
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No members yet.</p>
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
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() => handleCancelInvite(invitation.id)}
                          title="Cancel invitation"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
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
    </Card>
  );
}
