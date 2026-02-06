import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { CbomFile, CbomComponent, OutputDirectory } from "@shared/schema";

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

export function useOutputDirectories() {
  return useQuery<OutputDirectory[]>({
    queryKey: ["/api/cbom/directories"],
  });
}

export function useCreateOutputDirectory() {
  return useMutation({
    mutationFn: async (data: { label: string; path: string; enabled?: boolean }) => {
      const response = await apiRequest("POST", "/api/cbom/directories", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cbom/directories"] });
    },
  });
}

export function useUpdateOutputDirectory() {
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: number; label?: string; path?: string; enabled?: boolean }) => {
      const response = await apiRequest("PATCH", `/api/cbom/directories/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cbom/directories"] });
    },
  });
}

export function useDeleteOutputDirectory() {
  return useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/cbom/directories/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cbom/directories"] });
    },
  });
}

export function useScanDirectories() {
  return useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/cbom/directories/scan", {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cbom/directories"] });
    },
  });
}

export function useImportDirectoryFile() {
  return useMutation({
    mutationFn: async (data: { fullPath: string; filename: string }) => {
      const response = await apiRequest("POST", "/api/cbom/directories/import", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cbom/files"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cbom/components"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cbom/directories"] });
    },
  });
}
