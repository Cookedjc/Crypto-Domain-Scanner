import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { SecurityPolicy, CreateSecurityPolicyRequest, UpdateSecurityPolicyRequest } from "@shared/schema";

export function usePolicies() {
  return useQuery<SecurityPolicy[]>({
    queryKey: ["/api/policies"],
  });
}

export function usePolicy(id: number) {
  return useQuery<SecurityPolicy>({
    queryKey: ["/api/policies", id],
    enabled: id > 0,
  });
}

export function useCreatePolicy() {
  return useMutation({
    mutationFn: async (data: CreateSecurityPolicyRequest) => {
      const response = await apiRequest("POST", "/api/policies", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/policies"] });
    },
  });
}

export function useUpdatePolicy() {
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: UpdateSecurityPolicyRequest }) => {
      const response = await apiRequest("PATCH", `/api/policies/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/policies"] });
    },
  });
}

export function useDeletePolicy() {
  return useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/policies/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/policies"] });
    },
  });
}

export function useMatchPolicies() {
  return useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/policies/match");
      return response.json();
    },
  });
}
