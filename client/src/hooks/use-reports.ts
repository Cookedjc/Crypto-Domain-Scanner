import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Report, CreateReportRequest, UpdateReportRequest } from "@shared/schema";

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
