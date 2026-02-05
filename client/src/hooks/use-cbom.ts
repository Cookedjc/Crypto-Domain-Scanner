import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { CbomFile, CbomComponent } from "@shared/schema";

export function useCbomFiles() {
  return useQuery<CbomFile[]>({
    queryKey: ["/api/cbom/files"],
  });
}

export function useCbomComponents() {
  return useQuery<CbomComponent[]>({
    queryKey: ["/api/cbom/components"],
  });
}

export function useUploadCbom() {
  return useMutation({
    mutationFn: async ({ filename, data }: { filename: string; data: any }) => {
      const response = await apiRequest("POST", "/api/cbom/upload", { filename, data });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cbom/files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cbom/components"] });
    },
  });
}

export function useDeleteCbomFile() {
  return useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/cbom/files/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cbom/files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cbom/components"] });
    },
  });
}

export function useDeduplicateCbom() {
  return useMutation({
    mutationFn: async (fields: string[]) => {
      const response = await apiRequest("POST", "/api/cbom/deduplicate", { fields });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cbom/files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cbom/components"] });
    },
  });
}
