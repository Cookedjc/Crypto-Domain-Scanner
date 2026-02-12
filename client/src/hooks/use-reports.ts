import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Report, CreateReportRequest, UpdateReportRequest } from "@shared/schema";

export interface DashboardFilters {
  componentType?: string[];
  quantumLevel?: number[];
  fileId?: number[];
  complianceStatus?: string;
}

export interface DashboardData {
  cbom: {
    totalComponents: number;
    totalFiles: number;
    unfilteredTotal: number;
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
    cryptoFunctions: Array<{ name: string; count: number }>;
    typeByLevel: Array<Record<string, any>>;
    perFile: Array<{ fileId: number; filename: string; total: number; pqcReady: number; pqcNotReady: number }>;
    radarDimensions: Array<{ dimension: string; value: number }>;
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
      componentType: string;
      policyId: number;
      policyName: string;
      compliant: boolean;
      violations: string[];
      quantumLevel: number | null;
    }>;
  };
  filters: {
    availableTypes: string[];
    availableLevels: (number | null)[];
    availableFiles: Array<{ id: number; filename: string }>;
  };
  meta: {
    generatedAt: string;
    activeFilters: {
      componentType: string[];
      quantumLevel: number[];
      fileId: number[];
      complianceStatus: string;
    };
  };
}

function buildFilterQueryString(filters: DashboardFilters): string {
  const params = new URLSearchParams();
  if (filters.componentType?.length) params.set("componentType", filters.componentType.join(","));
  if (filters.quantumLevel?.length) params.set("quantumLevel", filters.quantumLevel.join(","));
  if (filters.fileId?.length) params.set("fileId", filters.fileId.join(","));
  if (filters.complianceStatus) params.set("complianceStatus", filters.complianceStatus);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function useReportDashboard(filters: DashboardFilters = {}, refreshInterval: number = 30000) {
  const qs = buildFilterQueryString(filters);
  const stableKey = JSON.stringify({
    t: filters.componentType || [],
    l: filters.quantumLevel || [],
    f: filters.fileId || [],
    c: filters.complianceStatus || "",
  });
  return useQuery<DashboardData>({
    queryKey: ["/api/reports/dashboard", stableKey],
    queryFn: async () => {
      const res = await fetch(`/api/reports/dashboard${qs}`);
      if (!res.ok) throw new Error("Failed to fetch dashboard");
      return res.json();
    },
    refetchInterval: refreshInterval > 0 ? refreshInterval : false,
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
