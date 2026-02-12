import { useState, useMemo, useCallback } from "react";
import Layout from "@/components/layout";
import { useReportDashboard, useReports, useCreateReport, useUpdateReport, useDeleteReport } from "@/hooks/use-reports";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import {
  BarChart3,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Package,
  Layers,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  Save,
  Plus,
  Trash2,
  Edit3,
  FileText,
  Clock,
  Download,
  Copy,
  ArrowLeft,
  RefreshCw,
  Lock,
  Eye,
} from "lucide-react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, Legend,
} from "recharts";
import type { Report, ReportStatus, RolePermission } from "@shared/schema";

const CHART_COLORS = [
  "hsl(var(--primary))",
  "hsl(142, 71%, 45%)",
  "hsl(38, 92%, 50%)",
  "hsl(0, 84%, 60%)",
  "hsl(217, 91%, 60%)",
  "hsl(271, 91%, 65%)",
  "hsl(173, 80%, 40%)",
  "hsl(326, 78%, 60%)",
];

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: "Draft", color: "text-amber-500", bg: "bg-amber-500/10" },
  final: { label: "Final", color: "text-emerald-500", bg: "bg-emerald-500/10" },
  archived: { label: "Archived", color: "text-muted-foreground", bg: "bg-muted/30" },
};

function useRolePermissions() {
  return useQuery<RolePermission[]>({
    queryKey: ["/api/settings/permissions"],
  });
}

function KpiCard({ title, value, subtitle, icon: Icon, color }: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: any;
  color: string;
}) {
  return (
    <Card data-testid={`kpi-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <CardContent className="pt-6 pb-4">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1">
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">{title}</p>
            <p className="text-2xl font-bold tabular-nums">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DashboardView({ onViewSnapshots }: { onViewSnapshots: () => void }) {
  const { data: dashboard, isLoading, refetch, isRefetching } = useReportDashboard();
  const { data: permissions } = useRolePermissions();
  const createMutation = useCreateReport();
  const { toast } = useToast();

  const canEdit = useMemo(() => {
    if (!permissions) return true;
    const reportPerms = permissions.filter(p => p.menuItem === "reports");
    if (reportPerms.length === 0) return true;
    return reportPerms.some(p => p.canEdit);
  }, [permissions]);

  const handleSaveSnapshot = useCallback(async () => {
    if (!dashboard) return;
    const now = new Date();
    const title = `Security Report - ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;

    const lines: string[] = [];
    lines.push("CIPHERGUARD SECURITY DASHBOARD REPORT");
    lines.push(`Generated: ${now.toISOString()}`);
    lines.push("=".repeat(60));
    lines.push("");

    lines.push("CBOM OVERVIEW");
    lines.push(`Total Components: ${dashboard.cbom.totalComponents}`);
    lines.push(`CBOM Files: ${dashboard.cbom.totalFiles}`);
    lines.push(`PQC Ready: ${dashboard.cbom.pqcReady} | Not Ready: ${dashboard.cbom.pqcNotReady}`);
    lines.push("");

    lines.push("COMPONENT TYPES");
    dashboard.cbom.byType.forEach(t => lines.push(`  ${t.type}: ${t.count}`));
    lines.push("");

    lines.push("QUANTUM SECURITY LEVELS");
    dashboard.cbom.byQuantumLevel.forEach(l => lines.push(`  ${l.level}: ${l.count}`));
    lines.push("");

    lines.push("COMPLIANCE SUMMARY");
    lines.push(`Active Policies: ${dashboard.compliance.activePolicies} / ${dashboard.compliance.totalPolicies}`);
    lines.push(`Compliance Rate: ${dashboard.compliance.complianceRate}%`);
    lines.push(`Compliant: ${dashboard.compliance.compliant} | Violations: ${dashboard.compliance.violations}`);
    lines.push("");

    if (dashboard.compliance.results.length > 0) {
      const violations = dashboard.compliance.results.filter(r => !r.compliant);
      if (violations.length > 0) {
        lines.push("VIOLATIONS");
        violations.forEach(v => {
          lines.push(`  ${v.componentName} -> ${v.policyName}`);
          v.violations.forEach(msg => lines.push(`    [!] ${msg}`));
        });
        lines.push("");
      }
    }

    lines.push("ALGORITHM INVENTORY");
    dashboard.cbom.algorithms.forEach(a => {
      lines.push(`  ${a.name} | ${a.type} | Mode: ${a.mode} | QSL: ${a.quantumLevel ?? "N/A"} | Count: ${a.count}`);
    });

    try {
      await createMutation.mutateAsync({
        title,
        content: lines.join("\n"),
        status: "final",
      });
      toast({ title: "Snapshot saved", description: "Dashboard report snapshot has been saved." });
    } catch {
      toast({ title: "Error saving snapshot", variant: "destructive" });
    }
  }, [dashboard, createMutation, toast]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="pt-6 pb-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card><CardContent className="pt-6"><Skeleton className="h-64 w-full" /></CardContent></Card>
          <Card><CardContent className="pt-6"><Skeleton className="h-64 w-full" /></CardContent></Card>
        </div>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <ShieldAlert className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-lg font-medium">No Data Available</p>
          <p className="text-sm text-muted-foreground mt-1">Upload CBOM files and configure security policies to see reports.</p>
        </CardContent>
      </Card>
    );
  }

  const { cbom, compliance } = dashboard;

  const pqcPieData = [
    { name: "PQC Ready", value: cbom.pqcReady },
    { name: "Not Ready", value: cbom.pqcNotReady },
  ].filter(d => d.value > 0);

  const compliancePieData = [
    { name: "Compliant", value: compliance.compliant },
    { name: "Violations", value: compliance.violations },
  ].filter(d => d.value > 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20">
              <BarChart3 className="w-5 h-5 text-primary" />
            </div>
            Reports Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Live cryptographic posture and quantum compliance overview</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isRefetching}
            data-testid="button-refresh-dashboard"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isRefetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSaveSnapshot}
              disabled={createMutation.isPending}
              data-testid="button-save-snapshot"
            >
              {createMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Save Snapshot
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={onViewSnapshots}
            data-testid="button-view-snapshots"
          >
            <FileText className="w-4 h-4 mr-2" />
            Saved Reports
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Total Components"
          value={cbom.totalComponents}
          subtitle={`${cbom.totalFiles} CBOM file${cbom.totalFiles !== 1 ? "s" : ""}`}
          icon={Package}
          color="bg-primary/10 text-primary"
        />
        <KpiCard
          title="PQC Ready"
          value={cbom.pqcReady}
          subtitle={cbom.totalComponents > 0 ? `${Math.round((cbom.pqcReady / cbom.totalComponents) * 100)}% of total` : "No components"}
          icon={ShieldCheck}
          color="bg-emerald-500/10 text-emerald-500"
        />
        <KpiCard
          title="Compliance Rate"
          value={`${compliance.complianceRate}%`}
          subtitle={`${compliance.activePolicies} active ${compliance.activePolicies === 1 ? "policy" : "policies"}`}
          icon={CheckCircle2}
          color={compliance.complianceRate >= 80 ? "bg-emerald-500/10 text-emerald-500" : compliance.complianceRate >= 50 ? "bg-amber-500/10 text-amber-500" : "bg-rose-500/10 text-rose-500"}
        />
        <KpiCard
          title="Violations"
          value={compliance.violations}
          subtitle={`${compliance.totalMatches} total matches`}
          icon={AlertTriangle}
          color={compliance.violations > 0 ? "bg-rose-500/10 text-rose-500" : "bg-emerald-500/10 text-emerald-500"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-mono text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-4 h-4" />
              Components by Type
            </CardTitle>
          </CardHeader>
          <CardContent>
            {cbom.byType.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={cbom.byType} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis dataKey="type" type="category" width={120} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <RechartsTooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground text-sm">No component data</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-mono text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" />
              PQC Readiness
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pqcPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={pqcPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={4}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    <Cell fill="hsl(142, 71%, 45%)" />
                    <Cell fill="hsl(0, 84%, 60%)" />
                  </Pie>
                  <RechartsTooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground text-sm">No component data</div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-mono text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Lock className="w-4 h-4" />
              Quantum Security Levels
            </CardTitle>
          </CardHeader>
          <CardContent>
            {cbom.byQuantumLevel.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={cbom.byQuantumLevel} margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="level" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <RechartsTooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {cbom.byQuantumLevel.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground text-sm">No quantum level data</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-mono text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <ShieldAlert className="w-4 h-4" />
              Compliance Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            {compliancePieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={compliancePieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={4}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    <Cell fill="hsl(142, 71%, 45%)" />
                    <Cell fill="hsl(0, 84%, 60%)" />
                  </Pie>
                  <RechartsTooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-muted-foreground text-sm">
                {compliance.activePolicies === 0 ? "No active policies" : "No compliance matches"}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {compliance.results.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-mono text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Policy Compliance Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-[400px]">
              <div className="space-y-2">
                {compliance.results.map((result, idx) => (
                  <div
                    key={`${result.componentId}-${result.policyId}-${idx}`}
                    className={`flex items-start gap-3 p-3 rounded-lg border ${result.compliant ? "border-emerald-500/20 bg-emerald-500/5" : "border-rose-500/20 bg-rose-500/5"}`}
                    data-testid={`compliance-result-${idx}`}
                  >
                    {result.compliant ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-500 mt-0.5 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{result.componentName}</span>
                        <span className="text-xs text-muted-foreground">vs</span>
                        <Badge variant="secondary" className="text-[10px]">{result.policyName}</Badge>
                      </div>
                      {result.violations.length > 0 && (
                        <ul className="mt-1.5 space-y-0.5">
                          {result.violations.map((v, vi) => (
                            <li key={vi} className="text-xs text-rose-400 flex items-start gap-1.5">
                              <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                              {v}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-mono text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Package className="w-4 h-4" />
            Algorithm Inventory ({cbom.algorithms.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {cbom.algorithms.length > 0 ? (
            <ScrollArea className="max-h-[400px]">
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="table-algorithms">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="py-2 pr-4 font-mono text-xs text-muted-foreground">Algorithm</th>
                      <th className="py-2 pr-4 font-mono text-xs text-muted-foreground">Type</th>
                      <th className="py-2 pr-4 font-mono text-xs text-muted-foreground">Mode</th>
                      <th className="py-2 pr-4 font-mono text-xs text-muted-foreground">QSL</th>
                      <th className="py-2 pr-4 font-mono text-xs text-muted-foreground text-right">Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cbom.algorithms.map((algo, idx) => (
                      <tr key={idx} className="border-b border-border/50 last:border-0" data-testid={`algo-row-${idx}`}>
                        <td className="py-2 pr-4 font-medium">{algo.name}</td>
                        <td className="py-2 pr-4">
                          <Badge variant="secondary" className="text-[10px]">{algo.type}</Badge>
                        </td>
                        <td className="py-2 pr-4 text-muted-foreground">{algo.mode}</td>
                        <td className="py-2 pr-4">
                          {algo.quantumLevel != null ? (
                            <Badge
                              variant="outline"
                              className={`text-[10px] ${algo.quantumLevel >= 3 ? "text-emerald-500 border-emerald-500/30" : algo.quantumLevel >= 1 ? "text-amber-500 border-amber-500/30" : "text-rose-500 border-rose-500/30"}`}
                            >
                              Level {algo.quantumLevel}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">N/A</span>
                          )}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums">{algo.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ScrollArea>
          ) : (
            <div className="py-8 text-center text-muted-foreground text-sm">No algorithms found. Upload CBOM data to populate.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SnapshotsView({ onBack, onEditReport }: { onBack: () => void; onEditReport: (report: Report) => void }) {
  const { data: reportsList, isLoading } = useReports();
  const deleteMutation = useDeleteReport();
  const { toast } = useToast();
  const { data: permissions } = useRolePermissions();

  const canEdit = useMemo(() => {
    if (!permissions) return true;
    const reportPerms = permissions.filter(p => p.menuItem === "reports");
    if (reportPerms.length === 0) return true;
    return reportPerms.some(p => p.canEdit);
  }, [permissions]);

  const canDelete = useMemo(() => {
    if (!permissions) return true;
    const reportPerms = permissions.filter(p => p.menuItem === "reports");
    if (reportPerms.length === 0) return true;
    return reportPerms.some(p => p.canDelete);
  }, [permissions]);

  const handleDelete = async (id: number) => {
    try {
      await deleteMutation.mutateAsync(id);
      toast({ title: "Report deleted" });
    } catch {
      toast({ title: "Error deleting report", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} data-testid="button-back-to-dashboard">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-display font-bold tracking-tight">Saved Reports</h1>
          <p className="text-sm text-muted-foreground mt-1">View and manage saved report snapshots</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : !reportsList?.length ? (
        <Card>
          <CardContent className="py-16 text-center">
            <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-lg font-medium">No Saved Reports</p>
            <p className="text-sm text-muted-foreground mt-1">Use "Save Snapshot" on the dashboard to capture report data.</p>
            <Button className="mt-4" onClick={onBack} data-testid="button-back-empty">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back to Dashboard
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {reportsList.map(report => {
            const statusCfg = STATUS_CONFIG[report.status] || STATUS_CONFIG.draft;
            const preview = report.content.substring(0, 200);
            return (
              <Card
                key={report.id}
                className="hover-elevate cursor-pointer transition-all"
                onClick={() => onEditReport(report)}
                data-testid={`card-report-${report.id}`}
              >
                <CardContent className="py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="font-medium text-sm truncate" data-testid={`text-report-title-${report.id}`}>
                          {report.title}
                        </h3>
                        <Badge variant="secondary" className={`text-[10px] ${statusCfg.color} ${statusCfg.bg}`}>
                          {statusCfg.label}
                        </Badge>
                      </div>
                      {preview && (
                        <p className="text-xs text-muted-foreground line-clamp-2 font-mono mt-1">{preview}...</p>
                      )}
                      <div className="flex items-center gap-3 mt-2 flex-wrap">
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {report.updatedAt ? formatDistanceToNow(new Date(report.updatedAt), { addSuffix: true }) : "Just now"}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {report.content.length} chars
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={e => { e.stopPropagation(); onEditReport(report); }}
                          data-testid={`button-edit-report-${report.id}`}
                        >
                          <Edit3 className="w-4 h-4" />
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-rose-500"
                          onClick={e => { e.stopPropagation(); handleDelete(report.id); }}
                          data-testid={`button-delete-report-${report.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                      {!canEdit && !canDelete && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={e => { e.stopPropagation(); onEditReport(report); }}
                          data-testid={`button-view-report-${report.id}`}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ReportEditor({ report, onBack }: { report: Report | null; onBack: () => void }) {
  const { toast } = useToast();
  const updateMutation = useUpdateReport();
  const createMutation = useCreateReport();
  const { data: permissions } = useRolePermissions();

  const [title, setTitle] = useState(report?.title || "");
  const [content, setContent] = useState(report?.content || "");
  const [status, setStatus] = useState<ReportStatus>((report?.status as ReportStatus) || "draft");
  const [isSaving, setIsSaving] = useState(false);

  const canEdit = useMemo(() => {
    if (!permissions) return true;
    const reportPerms = permissions.filter(p => p.menuItem === "reports");
    if (reportPerms.length === 0) return true;
    return reportPerms.some(p => p.canEdit);
  }, [permissions]);

  const handleSave = async () => {
    if (!title.trim()) {
      toast({ title: "Title required", variant: "destructive" });
      return;
    }
    setIsSaving(true);
    try {
      if (report) {
        await updateMutation.mutateAsync({ id: report.id, data: { title, content, status } });
      } else {
        await createMutation.mutateAsync({ title, content, status });
      }
      toast({ title: "Report saved" });
    } catch {
      toast({ title: "Error saving", variant: "destructive" });
    }
    setIsSaving(false);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    toast({ title: "Copied to clipboard" });
  };

  const handleExport = () => {
    const blob = new Blob([`${title}\n${"=".repeat(title.length)}\n\n${content}`], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_report.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} data-testid="button-back-from-editor">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-display font-bold tracking-tight">
            {canEdit ? (report ? "Edit Report" : "New Report") : "View Report"}
          </h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canEdit && (
            <Select value={status} onValueChange={v => setStatus(v as ReportStatus)}>
              <SelectTrigger className="w-[120px]" data-testid="select-report-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="final">Final</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" size="sm" onClick={handleCopy} data-testid="button-copy-content">
            <Copy className="w-4 h-4 mr-2" /> Copy
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} data-testid="button-export-report">
            <Download className="w-4 h-4 mr-2" /> Export
          </Button>
          {canEdit && (
            <Button size="sm" onClick={handleSave} disabled={isSaving} data-testid="button-save-report">
              {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Save
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <Input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Report Title..."
          className="text-lg font-semibold"
          readOnly={!canEdit}
          data-testid="input-report-title"
        />
        <div className="relative">
          <Textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="Report content..."
            className="min-h-[500px] font-mono text-sm leading-relaxed resize-y"
            readOnly={!canEdit}
            data-testid="textarea-report-content"
          />
          <div className="absolute bottom-3 right-3 text-xs text-muted-foreground font-mono">
            {content.length} chars
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const [view, setView] = useState<"dashboard" | "snapshots" | "editor">("dashboard");
  const [editingReport, setEditingReport] = useState<Report | null>(null);
  const { data: permissions } = useRolePermissions();

  const canView = useMemo(() => {
    if (!permissions) return true;
    const reportPerms = permissions.filter(p => p.menuItem === "reports");
    if (reportPerms.length === 0) return true;
    return reportPerms.some(p => p.canView);
  }, [permissions]);

  if (!canView) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <Card>
            <CardContent className="py-16 px-12 text-center">
              <ShieldX className="w-12 h-12 text-rose-500 mx-auto mb-4" />
              <p className="text-lg font-medium">Access Denied</p>
              <p className="text-sm text-muted-foreground mt-1">You do not have permission to view reports.</p>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      {view === "dashboard" && (
        <DashboardView onViewSnapshots={() => setView("snapshots")} />
      )}
      {view === "snapshots" && (
        <SnapshotsView
          onBack={() => setView("dashboard")}
          onEditReport={(report) => {
            setEditingReport(report);
            setView("editor");
          }}
        />
      )}
      {view === "editor" && (
        <ReportEditor
          report={editingReport}
          onBack={() => {
            setEditingReport(null);
            setView("snapshots");
          }}
        />
      )}
    </Layout>
  );
}
