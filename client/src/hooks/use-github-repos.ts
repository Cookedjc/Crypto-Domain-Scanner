import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { githubReposApi, buildUrl } from "@shared/routes";
import { type CreateGithubRepoRequest } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

export function useGithubRepos() {
  return useQuery({
    queryKey: [githubReposApi.repos.list.path],
    queryFn: async () => {
      const res = await fetch(githubReposApi.repos.list.path);
      if (!res.ok) throw new Error("Failed to fetch repositories");
      return res.json();
    },
    refetchInterval: (query) => {
      const data = query.state.data as any[];
      const hasScanning = data?.some((r: any) => r.status === "scanning");
      return hasScanning ? 3000 : false;
    },
  });
}

export function useGithubRepo(id: number) {
  return useQuery({
    queryKey: [githubReposApi.repos.list.path, id],
    queryFn: async () => {
      const url = buildUrl(githubReposApi.repos.get.path, { id });
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch repository");
      return res.json();
    },
    refetchInterval: (query) => {
      const data = query.state.data as any;
      return data?.status === "scanning" ? 3000 : false;
    },
  });
}

export function useCreateGithubRepo() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: CreateGithubRepoRequest) => {
      const res = await fetch(githubReposApi.repos.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to add repository");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [githubReposApi.repos.list.path] });
      toast({
        title: "Repository Added",
        description: "GitHub repository has been added successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to Add Repository",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useDeleteGithubRepo() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(githubReposApi.repos.delete.path, { id });
      const res = await fetch(url, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete repository");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [githubReposApi.repos.list.path] });
      toast({
        title: "Repository Removed",
        description: "GitHub repository has been removed.",
      });
    },
    onError: (error) => {
      toast({
        title: "Deletion Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useScanGithubRepo() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(githubReposApi.repos.scan.path, { id });
      const res = await fetch(url, { method: "POST" });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to start scan");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [githubReposApi.repos.list.path] });
      toast({
        title: "Scan Started",
        description: "Repository scan is now in progress.",
      });
    },
    onError: (error) => {
      toast({
        title: "Scan Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}
