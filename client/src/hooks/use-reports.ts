import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Report, CreateReportRequest, UpdateReportRequest } from "@shared/schema";

export interface DashboardData {
  cbom: {
    totalComponents: number;
    totalFiles: number;
    byType: Array<{ type: string; count: number }>;
    byQuantumLevel: Array<{ level: string; count: number }>;
    pqcReady: number;
    pqcNotReady: number;
    algorithms: Array<{
      name: string;
      type: string;
      mode: string;
      quantumLevel: number | null;
      count: number;
    }>;
  };
  compliance: {
    totalMatches: number;
    compliant: number;
    violations: number;
    complianceRate: number;
    activePolicies: number;
    totalPolicies: number;
    results: Array<{
      componentId: number;
      componentName: string;
      policyId: number;
      policyName: string;
      compliant: boolean;
      violations: string[];
    }>;
  };
}

export function useReportDashboard() {
  return useQuery<DashboardData>({
    queryKey: ["/api/reports/dashboard"],
    refetchInterval: 30000,
  });
}

export function useReports() {
  return useQuery<Report[]>({
    queryKey: ["/api/reports"],
  });
}

export function useReport(id: number | null) {
  return useQuery<Report>({
    queryKey: ["/api/reports", id],
    enabled: id !== null && id > 0,
  });
}

export function useCreateReport() {
  return useMutation({
    mutationFn: async (data: CreateReportRequest) => {
      const response = await apiRequest("POST", "/api/reports", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
    },
  });
}

export function useUpdateReport() {
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: UpdateReportRequest }) => {
      const response = await apiRequest("PATCH", `/api/reports/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
    },
  });
}

export function useDeleteReport() {
  return useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/reports/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
    },
  });
}
