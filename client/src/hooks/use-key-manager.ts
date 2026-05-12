import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";

const BASE = "/api/keys";

export function useCryptoKeys() {
  return useQuery<any[]>({ queryKey: [BASE] });
}

export function useKeyAuditLog(keyId?: number) {
  return useQuery<any[]>({
    queryKey: keyId ? [BASE + "/audit", keyId] : [BASE + "/audit"],
    queryFn: async () => {
      const url = keyId ? `${BASE}/audit?keyId=${keyId}` : `${BASE}/audit`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch audit log");
      return res.json();
    },
  });
}

export function useGenerateKey() {
  return useMutation({
    mutationFn: (data: any) => apiRequest("POST", BASE + "/generate", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [BASE] });
      queryClient.invalidateQueries({ queryKey: [BASE + "/audit"] });
    },
  });
}

export function useActivateKey() {
  return useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `${BASE}/${id}/activate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [BASE] });
      queryClient.invalidateQueries({ queryKey: [BASE + "/audit"] });
    },
  });
}

export function useSuspendKey() {
  return useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `${BASE}/${id}/suspend`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [BASE] });
      queryClient.invalidateQueries({ queryKey: [BASE + "/audit"] });
    },
  });
}

export function useRevokeKey() {
  return useMutation({
    mutationFn: (id: number) => apiRequest("PATCH", `${BASE}/${id}/revoke`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [BASE] });
      queryClient.invalidateQueries({ queryKey: [BASE + "/audit"] });
    },
  });
}

export function useDestroyKey() {
  return useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `${BASE}/${id}/destroy`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [BASE] });
      queryClient.invalidateQueries({ queryKey: [BASE + "/audit"] });
    },
  });
}

export function useExportPublicKey() {
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${BASE}/${id}/export-public`);
      if (!res.ok) throw new Error("Export failed");
      return res.json();
    },
  });
}

export function useAzureKvConnections() {
  return useQuery<any[]>({ queryKey: [BASE + "/azure/connections"] });
}

export function useCreateAzureKvConnection() {
  return useMutation({
    mutationFn: (data: any) => apiRequest("POST", BASE + "/azure/connections", data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [BASE + "/azure/connections"] }),
  });
}

export function useDeleteAzureKvConnection() {
  return useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `${BASE}/azure/connections/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [BASE + "/azure/connections"] }),
  });
}

export function useTestAzureKvConnection() {
  return useMutation({
    mutationFn: (id: number) => apiRequest("POST", `${BASE}/azure/connections/${id}/test`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [BASE + "/azure/connections"] }),
  });
}

export function useAzureKvKeys(connectionId: number | null) {
  return useQuery<any[]>({
    queryKey: [BASE + "/azure/connections", connectionId, "keys"],
    enabled: connectionId !== null,
    queryFn: async () => {
      const res = await fetch(`${BASE}/azure/connections/${connectionId}/keys`);
      if (!res.ok) throw new Error("Failed to fetch Azure KV keys");
      return res.json();
    },
  });
}

export function useImportAzureKeyToCbom() {
  return useMutation({
    mutationFn: ({ connectionId, keyName }: { connectionId: number; keyName: string }) =>
      apiRequest("POST", `${BASE}/azure/connections/${connectionId}/import-to-cbom`, { keyName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [BASE + "/audit"] });
    },
  });
}
