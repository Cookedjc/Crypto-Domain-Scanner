import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { type ScanRequest } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";

export function useScans() {
  return useQuery({
    queryKey: [api.scans.list.path],
    queryFn: async () => {
      const res = await fetch(api.scans.list.path);
      if (!res.ok) throw new Error("Failed to fetch scans");
      return api.scans.list.responses[200].parse(await res.json());
    },
    // Poll every 5 seconds to check for completed scans
    refetchInterval: 5000, 
  });
}

export function useScan(id: number) {
  return useQuery({
    queryKey: [api.scans.get.path, id],
    queryFn: async () => {
      const url = buildUrl(api.scans.get.path, { id });
      const res = await fetch(url);
      if (res.status === 404) throw new Error("Scan not found");
      if (!res.ok) throw new Error("Failed to fetch scan details");
      return api.scans.get.responses[200].parse(await res.json());
    },
    refetchInterval: (query) => {
      // Stop polling if we have a score (scan complete)
      const data = query.state.data;
      return data && data.score !== null ? false : 3000;
    },
  });
}

export function useCreateScan() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: ScanRequest) => {
      const res = await fetch(api.scans.create.path, {
        method: api.scans.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        if (res.status === 400) {
          const error = api.scans.create.responses[400].parse(await res.json());
          throw new Error(error.message);
        }
        throw new Error("Failed to start scan");
      }
      return api.scans.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.scans.list.path] });
      toast({
        title: "Scan Initiated",
        description: "The analysis engine has started processing your request.",
        variant: "default",
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

export function useDeleteScan() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.scans.delete.path, { id });
      const res = await fetch(url, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete scan");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.scans.list.path] });
      toast({
        title: "Scan Deleted",
        description: "The scan report has been removed.",
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
