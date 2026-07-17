import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type {
  Project,
  Client,
  CreateProject,
  CreateClient,
  UpdateClient,
} from "@shared/schemas";

export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: () => api.projects.list() as Promise<Project[]>,
    staleTime: 60_000,
  });
}

export function useAllProjects() {
  return useQuery({
    queryKey: ["projects", "all"],
    queryFn: () =>
      api.projects.list({ includeArchived: "true" }) as Promise<Project[]>,
    staleTime: 60_000,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateProject) =>
      api.projects.create(data as Record<string, unknown>) as Promise<Project>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Project created");
    },
    onError: () => toast.error("Failed to create project"),
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: Partial<CreateProject & { active: boolean }>;
    }) =>
      api.projects.update(
        id,
        data as Record<string, unknown>
      ) as Promise<Project>,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["projects"] }),
    onError: () => toast.error("Failed to update project"),
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.projects.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Project archived");
    },
    onError: () => toast.error("Failed to archive project"),
  });
}

// Assign distinct palette colors across all projects (AI-assisted, server-side).
export function useRecolorProjects() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.projects.recolor(),
    onSuccess: ({ recolored, usedAI }) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["time-entries"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      toast.success(
        recolored > 0
          ? `Recolored ${recolored} ${recolored === 1 ? "project" : "projects"}${usedAI ? " with AI" : ""}`
          : "No projects to recolor"
      );
    },
    onError: () => toast.error("Failed to recolor projects"),
  });
}

export function useClients() {
  return useQuery({
    queryKey: ["clients"],
    queryFn: () => api.clients.list() as Promise<Client[]>,
    staleTime: 60_000,
  });
}

export function useAllClients() {
  return useQuery({
    queryKey: ["clients", "all"],
    queryFn: () =>
      api.clients.list({ includeArchived: "true" }) as Promise<Client[]>,
    staleTime: 60_000,
  });
}

export function useClient(id: string | undefined) {
  return useQuery({
    queryKey: ["clients", id],
    queryFn: () => api.clients.get(id as string) as Promise<Client>,
    enabled: !!id,
  });
}

export function useCreateClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateClient) =>
      api.clients.create(data as Record<string, unknown>) as Promise<Client>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast.success("Client created");
    },
    onError: () => toast.error("Failed to create client"),
  });
}

export function useUpdateClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateClient }) =>
      api.clients.update(id, data as Record<string, unknown>) as Promise<Client>,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["clients"] }),
    onError: () => toast.error("Failed to update client"),
  });
}

export function useDeleteClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.clients.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast.success("Client archived");
    },
    onError: () => toast.error("Failed to archive client"),
  });
}

export function useTags() {
  return useQuery({
    queryKey: ["tags"],
    queryFn: () =>
      api.tags.list() as Promise<{ id: string; name: string; color: string }[]>,
    staleTime: 60_000,
  });
}

// name → color lookup for rendering tag swatches from an entry's tag names.
export function useTagColors() {
  const { data: tags = [] } = useTags();
  const map = new Map(tags.map((t) => [t.name, t.color]));
  return (name: string) => map.get(name) ?? "#64748b";
}

export function useUpdateTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, color }: { id: string; color: string }) =>
      api.tags.update(id, { color }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tags"] }),
    onError: () => toast.error("Failed to update tag color"),
  });
}
