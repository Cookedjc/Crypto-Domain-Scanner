import { useState, useMemo, useCallback, useEffect } from "react";
import Layout from "@/components/layout";
import { useReportDashboard, useReports, useCreateReport, useUpdateReport, useDeleteReport } from "@/hooks/use-reports";
import type { DashboardFilters, DashboardData } from "@/hooks/use-reports";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import {
  BarChart3, ShieldCheck, ShieldAlert, ShieldX, Package, Layers,
  AlertTriangle, CheckCircle2, XCircle, Loader2, Save, Trash2,
  Edit3, FileText, Clock, Download, Copy, ArrowLeft, RefreshCw,
  Lock, Eye, Filter, X, Maximize2, ChevronDown, ChevronRight,
  Activity, TrendingUp, Search, ArrowUpDown, FileDown, Timer,
} from "lucide-react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, Legend,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Treemap, AreaChart, Area, RadialBarChart, RadialBar,
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

const REFRESH_OPTIONS = [
  { label: "Off", value: 0 },
  { label: "10s", value: 10000 },
  { label: "30s", value: 30000 },
  { label: "1m", value: 60000 },
  { label: "5m", value: 300000 },
];

const TOOLTIP_STYLE = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  fontSize: 12,
};

function useRolePermissions() {
  return useQuery<RolePermission[]>({
    queryKey: ["/api/settings/permissions"],
  });
}

function KpiCard({ title, value, subtitle, icon: Icon, color, trend, testId }: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: any;
  color: string;
  trend?: { direction: "up" | "down" | "neutral"; label: string };
  testId?: string;
}) {
  return (
    <Card data-testid={testId || `kpi-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1 min-w-0">
            <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider truncate">{title}</p>
            <p className="text-2xl font-bold tabular-nums">{value}</p>
            <div className="flex items-center gap-2 flex-wrap">
              {subtitle && <p className="text-[10px] text-muted-foreground">{subtitle}</p>}
              {trend && (
                <span className={`text-[10px] flex items-center gap-0.5 ${trend.direction === "up" ? "text-emerald-500" : trend.direction === "down" ? "text-rose-500" : "text-muted-foreground"}`}>
                  {trend.direction === "up" ? <TrendingUp className="w-3 h-3" /> : trend.direction === "down" ? <TrendingUp className="w-3 h-3 rotate-180" /> : <Activity className="w-3 h-3" />}
                  {trend.label}
                </span>
              )}
            </div>
          </div>
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
            <Icon className="w-4 h-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ChartCard({ title, icon: Icon, children, chartData, chartName, onExpand }: {
  title: string;
  icon: any;
  children: React.ReactNode;
  chartData?: any[];
  chartName?: string;
  onExpand?: () => void;
}) {
  const { toast } = useToast();

  const handleExportCSV = () => {
    if (!chartData || chartData.length === 0) return;
    const headers = Object.keys(chartData[0]);
    const csv = [headers.join(","), ...chartData.map(row => headers.map(h => JSON.stringify(row[h] ?? "")).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(chartName || title).replace(/\s+/g, "_").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "CSV exported" });
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-xs font-mono text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Icon className="w-3.5 h-3.5" />
            {title}
          </CardTitle>
          <div className="flex items-center gap-1" style={{ visibility: "visible" }}>
            {chartData && chartData.length > 0 && (
              <Button variant="ghost" size="icon" onClick={handleExportCSV} data-testid={`button-export-${(chartName || title).replace(/\s+/g, "-").toLowerCase()}`}>
                <FileDown className="w-3.5 h-3.5" />
              </Button>
            )}
            {onExpand && (
              <Button variant="ghost" size="icon" onClick={onExpand} data-testid={`button-expand-${(chartName || title).replace(/\s+/g, "-").toLowerCase()}`}>
                <Maximize2 className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function FilterPanel({ filters, onFiltersChange, availableTypes, availableLevels, availableFiles, isOpen, onToggle }: {
  filters: DashboardFilters;
  onFiltersChange: (f: DashboardFilters) => void;
  availableTypes: string[];
  availableLevels: (number | null)[];
  availableFiles: Array<{ id: number; filename: string }>;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const activeFilterCount = (filters.componentType?.length || 0) + (filters.quantumLevel?.length || 0) + (filters.fileId?.length || 0) + (filters.complianceStatus ? 1 : 0);

  const toggleType = (type: string) => {
    const current = filters.componentType || [];
    const next = current.includes(type) ? current.filter(t => t !== type) : [...current, type];
    onFiltersChange({ ...filters, componentType: next.length > 0 ? next : undefined });
  };

  const toggleLevel = (level: number) => {
    const current = filters.quantumLevel || [];
    const next = current.includes(level) ? current.filter(l => l !== level) : [...current, level];
    onFiltersChange({ ...filters, quantumLevel: next.length > 0 ? next : undefined });
  };

  const toggleFile = (fileId: number) => {
    const current = filters.fileId || [];
    const next = current.includes(fileId) ? current.filter(f => f !== fileId) : [...current, fileId];
    onFiltersChange({ ...filters, fileId: next.length > 0 ? next : undefined });
  };

  const clearAll = () => onFiltersChange({});

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Button variant="outline" size="sm" onClick={onToggle} data-testid="button-toggle-filters">
          <Filter className="w-4 h-4 mr-2" />
          Filters
          {activeFilterCount > 0 && (
            <Badge variant="secondary" className="ml-2 text-[10px]">{activeFilterCount}</Badge>
          )}
          {isOpen ? <ChevronDown className="w-3 h-3 ml-1" /> : <ChevronRight className="w-3 h-3 ml-1" />}
        </Button>
        {activeFilterCount > 0 && (
          <Button variant="ghost" size="sm" onClick={clearAll} data-testid="button-clear-filters">
            <X className="w-3 h-3 mr-1" /> Clear All
          </Button>
        )}
      </div>

      {isOpen && (
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Component Type</p>
                <div className="flex flex-wrap gap-1">
                  {availableTypes.length > 0 ? availableTypes.map(type => (
                    <Badge
                      key={type}
                      variant={filters.componentType?.includes(type) ? "default" : "outline"}
                      className="cursor-pointer text-[10px] toggle-elevate"
                      onClick={() => toggleType(type)}
                      data-testid={`filter-type-${type}`}
                    >
                      {type}
                    </Badge>
                  )) : <span className="text-xs text-muted-foreground">No types available</span>}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Quantum Level</p>
                <div className="flex flex-wrap gap-1">
                  {availableLevels.map(level => {
                    const val = level ?? -1;
                    const label = level != null ? `Level ${level}` : "Not Assessed";
                    return (
                      <Badge
                        key={val}
                        variant={filters.quantumLevel?.includes(val) ? "default" : "outline"}
                        className="cursor-pointer text-[10px] toggle-elevate"
                        onClick={() => toggleLevel(val)}
                        data-testid={`filter-level-${val}`}
                      >
                        {label}
                      </Badge>
                    );
                  })}
                  {availableLevels.length === 0 && <span className="text-xs text-muted-foreground">No levels available</span>}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">CBOM File</p>
                <div className="flex flex-wrap gap-1">
                  {availableFiles.length > 0 ? availableFiles.map(file => (
                    <Badge
                      key={file.id}
                      variant={filters.fileId?.includes(file.id) ? "default" : "outline"}
                      className="cursor-pointer text-[10px] toggle-elevate"
                      onClick={() => toggleFile(file.id)}
                      data-testid={`filter-file-${file.id}`}
                    >
                      {file.filename.length > 20 ? file.filename.substring(0, 20) + "..." : file.filename}
                    </Badge>
                  )) : <span className="text-xs text-muted-foreground">No files available</span>}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Compliance</p>
                <div className="flex flex-wrap gap-1">
                  {["all", "compliant", "violation"].map(status => (
                    <Badge
                      key={status}
                      variant={(filters.complianceStatus || "") === (status === "all" ? "" : status) ? "default" : "outline"}
                      className="cursor-pointer text-[10px] toggle-elevate"
                      onClick={() => onFiltersChange({ ...filters, complianceStatus: status === "all" ? undefined : status })}
                      data-testid={`filter-compliance-${status}`}
                    >
                      {status === "all" ? "All" : status === "compliant" ? "Compliant" : "Violations"}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function OverviewTab({ dashboard, onChartClick }: { dashboard: DashboardData; onChartClick: (filterKey: string, value: string) => void }) {
  const { cbom, compliance } = dashboard;

  const pqcPieData = [
    { name: "PQC Ready", value: cbom.pqcReady },
    { name: "Not Ready", value: cbom.pqcNotReady },
  ].filter(d => d.value > 0);

  const compliancePieData = [
    { name: "Compliant", value: compliance.compliant },
    { name: "Violations", value: compliance.violations },
  ].filter(d => d.value > 0);

  const gaugeData = [{ name: "Compliance", value: compliance.complianceRate, fill: compliance.complianceRate >= 80 ? "hsl(142, 71%, 45%)" : compliance.complianceRate >= 50 ? "hsl(38, 92%, 50%)" : "hsl(0, 84%, 60%)" }];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          title="Total Components"
          value={cbom.totalComponents}
          subtitle={cbom.unfilteredTotal !== cbom.totalComponents ? `${cbom.unfilteredTotal} unfiltered` : `${cbom.totalFiles} file${cbom.totalFiles !== 1 ? "s" : ""}`}
          icon={Package}
          color="bg-primary/10 text-primary"
          trend={cbom.unfilteredTotal !== cbom.totalComponents ? { direction: "neutral", label: "Filtered" } : undefined}
        />
        <KpiCard
          title="PQC Ready"
          value={cbom.pqcReady}
          subtitle={cbom.totalComponents > 0 ? `${Math.round((cbom.pqcReady / cbom.totalComponents) * 100)}% of total` : "No components"}
          icon={ShieldCheck}
          color="bg-emerald-500/10 text-emerald-500"
          trend={cbom.pqcReady > 0 ? { direction: "up", label: `${cbom.pqcReady} quantum-safe` } : undefined}
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
          trend={compliance.violations > 0 ? { direction: "down", label: `${compliance.violations} issues` } : { direction: "up", label: "Clean" }}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <ChartCard title="Compliance Gauge" icon={Activity} chartData={gaugeData} chartName="compliance-gauge">
          <div className="h-[200px] flex items-center justify-center relative">
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart
                cx="50%" cy="60%" innerRadius="60%" outerRadius="90%"
                startAngle={180} endAngle={0}
                data={gaugeData}
              >
                <RadialBar dataKey="value" cornerRadius={8} background={{ fill: "hsl(var(--muted))" }} />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pt-4">
              <span className="text-3xl font-bold tabular-nums">{compliance.complianceRate}%</span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Compliance</span>
            </div>
          </div>
        </ChartCard>

        <ChartCard title="PQC Readiness" icon={ShieldCheck} chartData={pqcPieData} chartName="pqc-readiness">
          {pqcPieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pqcPieData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={4} dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  onClick={(_, idx) => {
                    if (idx === 0) onChartClick("quantumLevel", "3,4,5");
                    else onChartClick("quantumLevel", "-1,0,1,2");
                  }}
                  className="cursor-pointer"
                >
                  <Cell fill="hsl(142, 71%, 45%)" />
                  <Cell fill="hsl(0, 84%, 60%)" />
                </Pie>
                <RechartsTooltip contentStyle={TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">No data</div>
          )}
        </ChartCard>

        <ChartCard title="Compliance Overview" icon={ShieldAlert} chartData={compliancePieData} chartName="compliance-overview">
          {compliancePieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={compliancePieData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={4} dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  onClick={(_, idx) => onChartClick("complianceStatus", idx === 0 ? "compliant" : "violation")}
                  className="cursor-pointer"
                >
                  <Cell fill="hsl(142, 71%, 45%)" />
                  <Cell fill="hsl(0, 84%, 60%)" />
                </Pie>
                <RechartsTooltip contentStyle={TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
              {compliance.activePolicies === 0 ? "No active policies" : "No matches"}
            </div>
          )}
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <ChartCard title="Security Posture Radar" icon={Activity} chartData={cbom.radarDimensions} chartName="security-radar">
          <ResponsiveContainer width="100%" height={280}>
            <RadarChart data={cbom.radarDimensions} cx="50%" cy="50%" outerRadius="70%">
              <PolarGrid stroke="hsl(var(--border))" />
              <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
              <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
              <Radar name="Score" dataKey="value" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.25} strokeWidth={2} />
              <RechartsTooltip contentStyle={TOOLTIP_STYLE} />
            </RadarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Components by Type" icon={Layers} chartData={cbom.byType} chartName="components-by-type">
          {cbom.byType.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={cbom.byType} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis dataKey="type" type="category" width={100} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <RechartsTooltip contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]}
                  onClick={(data) => onChartClick("componentType", data.type)}
                  className="cursor-pointer"
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">No data</div>
          )}
        </ChartCard>
      </div>
    </div>
  );
}

function ChartsTab({ dashboard, onChartClick, onExpandChart }: {
  dashboard: DashboardData;
  onChartClick: (filterKey: string, value: string) => void;
  onExpandChart: (chart: { title: string; content: React.ReactNode }) => void;
}) {
  const { cbom } = dashboard;

  const treemapData = useMemo(() => {
    if (cbom.byType.length === 0) return [];
    return cbom.byType.map((item, idx) => ({
      name: item.type,
      size: item.count,
      fill: CHART_COLORS[idx % CHART_COLORS.length],
    }));
  }, [cbom.byType]);

  const allQLevels = useMemo(() => {
    const levels = new Set<string>();
    cbom.typeByLevel.forEach(item => {
      Object.keys(item).forEach(k => { if (k !== "type") levels.add(k); });
    });
    return Array.from(levels).sort();
  }, [cbom.typeByLevel]);

  const TreemapContent = ({ x, y, width, height, name, size }: any) => {
    if (width < 40 || height < 30) return null;
    return (
      <g>
        <rect x={x} y={y} width={width} height={height} rx={4} style={{ fill: CHART_COLORS[treemapData.findIndex(d => d.name === name) % CHART_COLORS.length], stroke: "hsl(var(--background))", strokeWidth: 2, opacity: 0.85 }} />
        <text x={x + width / 2} y={y + height / 2 - 6} textAnchor="middle" fill="white" fontSize={11} fontWeight={600}>{name}</text>
        <text x={x + width / 2} y={y + height / 2 + 10} textAnchor="middle" fill="white" fontSize={10} opacity={0.8}>{size}</text>
      </g>
    );
  };

  const qslChart = (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={cbom.byQuantumLevel} margin={{ left: 10, right: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="level" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
        <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
        <RechartsTooltip contentStyle={TOOLTIP_STYLE} />
        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
          {cbom.byQuantumLevel.map((_, idx) => (
            <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );

  const stackedAreaChart = cbom.typeByLevel.length > 0 ? (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={cbom.typeByLevel} margin={{ left: 10, right: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="type" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
        <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
        <RechartsTooltip contentStyle={TOOLTIP_STYLE} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {allQLevels.map((level, idx) => (
          <Area key={level} type="monotone" dataKey={level} stackId="1" stroke={CHART_COLORS[idx % CHART_COLORS.length]} fill={CHART_COLORS[idx % CHART_COLORS.length]} fillOpacity={0.4} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  ) : (
    <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">No cross-tabulation data</div>
  );

  const fileComparisonChart = cbom.perFile.length > 0 ? (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={cbom.perFile} margin={{ left: 10, right: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="filename" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
        <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
        <RechartsTooltip contentStyle={TOOLTIP_STYLE} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="pqcReady" name="PQC Ready" fill="hsl(142, 71%, 45%)" stackId="a" radius={[0, 0, 0, 0]} />
        <Bar dataKey="pqcNotReady" name="Not Ready" fill="hsl(0, 84%, 60%)" stackId="a" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  ) : (
    <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">No file data</div>
  );

  const cryptoFnChart = cbom.cryptoFunctions.length > 0 ? (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={cbom.cryptoFunctions.slice(0, 10)} layout="vertical" margin={{ left: 10, right: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
        <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
        <RechartsTooltip contentStyle={TOOLTIP_STYLE} />
        <Bar dataKey="count" fill="hsl(271, 91%, 65%)" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  ) : (
    <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">No crypto function data</div>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <ChartCard title="Quantum Security Levels" icon={Lock} chartData={cbom.byQuantumLevel} chartName="quantum-levels"
          onExpand={() => onExpandChart({ title: "Quantum Security Levels", content: qslChart })}
        >
          {cbom.byQuantumLevel.length > 0 ? qslChart : (
            <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">No data</div>
          )}
        </ChartCard>

        <ChartCard title="Component Treemap" icon={Layers} chartData={treemapData} chartName="component-treemap"
          onExpand={() => onExpandChart({ title: "Component Treemap", content: (
            <ResponsiveContainer width="100%" height={400}>
              <Treemap data={treemapData} dataKey="size" nameKey="name" aspectRatio={4/3} content={<TreemapContent />} />
            </ResponsiveContainer>
          )})}
        >
          {treemapData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <Treemap data={treemapData} dataKey="size" nameKey="name" aspectRatio={4/3} content={<TreemapContent />} />
            </ResponsiveContainer>
          ) : (
            <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">No data</div>
          )}
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <ChartCard title="Type vs Quantum Level" icon={BarChart3} chartData={cbom.typeByLevel} chartName="type-vs-level"
          onExpand={() => onExpandChart({ title: "Type vs Quantum Level (Stacked Area)", content: stackedAreaChart })}
        >
          {stackedAreaChart}
        </ChartCard>

        <ChartCard title="CBOM File Comparison" icon={FileText} chartData={cbom.perFile} chartName="file-comparison"
          onExpand={() => onExpandChart({ title: "CBOM File Comparison", content: fileComparisonChart })}
        >
          {fileComparisonChart}
        </ChartCard>
      </div>

      <ChartCard title="Crypto Functions Distribution" icon={Lock} chartData={cbom.cryptoFunctions} chartName="crypto-functions"
        onExpand={() => onExpandChart({ title: "Crypto Functions Distribution", content: cryptoFnChart })}
      >
        {cryptoFnChart}
      </ChartCard>
    </div>
  );
}

function ComplianceTab({ dashboard }: { dashboard: DashboardData }) {
  const { compliance } = dashboard;
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<string>("componentName");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);
  const pageSize = 15;

  const filtered = useMemo(() => {
    let results = compliance.results;
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      results = results.filter(r =>
        r.componentName.toLowerCase().includes(lower) ||
        r.policyName.toLowerCase().includes(lower) ||
        r.violations.some(v => v.toLowerCase().includes(lower))
      );
    }
    results = [...results].sort((a, b) => {
      let cmp = 0;
      if (sortField === "componentName") cmp = a.componentName.localeCompare(b.componentName);
      else if (sortField === "policyName") cmp = a.policyName.localeCompare(b.policyName);
      else if (sortField === "compliant") cmp = Number(a.compliant) - Number(b.compliant);
      else if (sortField === "componentType") cmp = a.componentType.localeCompare(b.componentType);
      return sortDir === "desc" ? -cmp : cmp;
    });
    return results;
  }, [compliance.results, searchTerm, sortField, sortDir]);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paged = filtered.slice(page * pageSize, (page + 1) * pageSize);

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  useEffect(() => { setPage(0); }, [searchTerm]);

  const SortBtn = ({ field, label }: { field: string; label: string }) => (
    <button className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground uppercase tracking-wider hover:text-foreground" onClick={() => toggleSort(field)}>
      {label}
      <ArrowUpDown className={`w-3 h-3 ${sortField === field ? "text-primary" : ""}`} />
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard title="Compliant" value={compliance.compliant} icon={CheckCircle2} color="bg-emerald-500/10 text-emerald-500" testId="kpi-compliant" />
        <KpiCard title="Violations" value={compliance.violations} icon={XCircle} color="bg-rose-500/10 text-rose-500" testId="kpi-violations-detail" />
        <KpiCard title="Active Policies" value={compliance.activePolicies} subtitle={`${compliance.totalPolicies} total`} icon={ShieldCheck} color="bg-primary/10 text-primary" testId="kpi-active-policies" />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-xs font-mono text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5" />
              Policy Compliance Details ({filtered.length})
            </CardTitle>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Search components, policies..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-8 text-sm"
                data-testid="input-compliance-search"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {paged.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="table-compliance">
                  <thead>
                    <tr className="border-b">
                      <th className="py-2 pr-3 text-left"><SortBtn field="componentName" label="Component" /></th>
                      <th className="py-2 pr-3 text-left"><SortBtn field="componentType" label="Type" /></th>
                      <th className="py-2 pr-3 text-left"><SortBtn field="policyName" label="Policy" /></th>
                      <th className="py-2 pr-3 text-left"><SortBtn field="compliant" label="Status" /></th>
                      <th className="py-2 pr-3 text-left text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((result, idx) => (
                      <tr key={`${result.componentId}-${result.policyId}-${idx}`} className="border-b border-border/50 last:border-0" data-testid={`compliance-row-${idx}`}>
                        <td className="py-2 pr-3 font-medium text-sm">{result.componentName}</td>
                        <td className="py-2 pr-3"><Badge variant="secondary" className="text-[10px]">{result.componentType}</Badge></td>
                        <td className="py-2 pr-3 text-sm">{result.policyName}</td>
                        <td className="py-2 pr-3">
                          {result.compliant ? (
                            <Badge variant="outline" className="text-[10px] text-emerald-500 border-emerald-500/30">Compliant</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] text-rose-500 border-rose-500/30">Violation</Badge>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-xs text-muted-foreground max-w-[200px]">
                          {result.violations.length > 0 ? result.violations.join("; ") : "Meets requirements"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-3 gap-2">
                  <span className="text-xs text-muted-foreground">
                    Showing {page * pageSize + 1}-{Math.min((page + 1) * pageSize, filtered.length)} of {filtered.length}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)} data-testid="button-prev-page">Prev</Button>
                    <span className="text-xs text-muted-foreground px-2">{page + 1} / {totalPages}</span>
                    <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} data-testid="button-next-page">Next</Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="py-8 text-center text-muted-foreground text-sm">
              {searchTerm ? "No matches found" : compliance.activePolicies === 0 ? "No active policies configured" : "No compliance data available"}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DetailsTab({ dashboard }: { dashboard: DashboardData }) {
  const { cbom } = dashboard;
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const filtered = useMemo(() => {
    let algos = cbom.algorithms;
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      algos = algos.filter(a =>
        a.name.toLowerCase().includes(lower) ||
        a.type.toLowerCase().includes(lower) ||
        a.mode.toLowerCase().includes(lower)
      );
    }
    algos = [...algos].sort((a, b) => {
      let cmp = 0;
      if (sortField === "name") cmp = a.name.localeCompare(b.name);
      else if (sortField === "type") cmp = a.type.localeCompare(b.type);
      else if (sortField === "mode") cmp = a.mode.localeCompare(b.mode);
      else if (sortField === "quantumLevel") cmp = (a.quantumLevel ?? -1) - (b.quantumLevel ?? -1);
      else if (sortField === "count") cmp = a.count - b.count;
      return sortDir === "desc" ? -cmp : cmp;
    });
    return algos;
  }, [cbom.algorithms, searchTerm, sortField, sortDir]);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const paged = filtered.slice(page * pageSize, (page + 1) * pageSize);

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  useEffect(() => { setPage(0); }, [searchTerm]);

  const SortBtn = ({ field, label }: { field: string; label: string }) => (
    <button className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground uppercase tracking-wider hover:text-foreground" onClick={() => toggleSort(field)}>
      {label}
      <ArrowUpDown className={`w-3 h-3 ${sortField === field ? "text-primary" : ""}`} />
    </button>
  );

  const { toast } = useToast();
  const handleExportAll = () => {
    if (cbom.algorithms.length === 0) return;
    const headers = ["Algorithm", "Type", "Mode", "QuantumLevel", "Count"];
    const csv = [headers.join(","), ...cbom.algorithms.map(a => [JSON.stringify(a.name), JSON.stringify(a.type), JSON.stringify(a.mode), a.quantumLevel ?? "", a.count].join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const el = document.createElement("a");
    el.href = url;
    el.download = "algorithm_inventory.csv";
    el.click();
    URL.revokeObjectURL(url);
    toast({ title: "Algorithm inventory exported" });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiCard title="Unique Algorithms" value={cbom.algorithms.length} icon={Lock} color="bg-primary/10 text-primary" testId="kpi-unique-algos" />
        <KpiCard title="CBOM Files" value={cbom.totalFiles} icon={FileText} color="bg-amber-500/10 text-amber-500" testId="kpi-cbom-files" />
        <KpiCard
          title="Crypto Functions"
          value={cbom.cryptoFunctions.length}
          subtitle={cbom.cryptoFunctions.length > 0 ? `Top: ${cbom.cryptoFunctions[0]?.name}` : undefined}
          icon={Activity}
          color="bg-purple-500/10 text-purple-500"
          testId="kpi-crypto-fns"
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-xs font-mono text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Package className="w-3.5 h-3.5" />
              Algorithm Inventory ({filtered.length})
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative w-full sm:w-56">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search algorithms..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="pl-8 text-sm"
                  data-testid="input-algo-search"
                />
              </div>
              <Button variant="outline" size="sm" onClick={handleExportAll} disabled={cbom.algorithms.length === 0} data-testid="button-export-algorithms">
                <Download className="w-3.5 h-3.5 mr-1" /> CSV
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {paged.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="table-algorithms">
                  <thead>
                    <tr className="border-b">
                      <th className="py-2 pr-3 text-left"><SortBtn field="name" label="Algorithm" /></th>
                      <th className="py-2 pr-3 text-left"><SortBtn field="type" label="Type" /></th>
                      <th className="py-2 pr-3 text-left"><SortBtn field="mode" label="Mode" /></th>
                      <th className="py-2 pr-3 text-left"><SortBtn field="quantumLevel" label="QSL" /></th>
                      <th className="py-2 pr-3 text-right"><SortBtn field="count" label="Count" /></th>
                    </tr>
                  </thead>
                  <tbody>
                    {paged.map((algo, idx) => (
                      <tr key={idx} className="border-b border-border/50 last:border-0" data-testid={`algo-row-${idx}`}>
                        <td className="py-2 pr-3 font-medium">{algo.name}</td>
                        <td className="py-2 pr-3"><Badge variant="secondary" className="text-[10px]">{algo.type}</Badge></td>
                        <td className="py-2 pr-3 text-muted-foreground">{algo.mode}</td>
                        <td className="py-2 pr-3">
                          {algo.quantumLevel != null ? (
                            <Badge variant="outline" className={`text-[10px] ${algo.quantumLevel >= 3 ? "text-emerald-500 border-emerald-500/30" : algo.quantumLevel >= 1 ? "text-amber-500 border-amber-500/30" : "text-rose-500 border-rose-500/30"}`}>
                              Level {algo.quantumLevel}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">N/A</span>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">{algo.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-3 gap-2">
                  <span className="text-xs text-muted-foreground">
                    Showing {page * pageSize + 1}-{Math.min((page + 1) * pageSize, filtered.length)} of {filtered.length}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)} data-testid="button-algo-prev">Prev</Button>
                    <span className="text-xs text-muted-foreground px-2">{page + 1} / {totalPages}</span>
                    <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} data-testid="button-algo-next">Next</Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="py-8 text-center text-muted-foreground text-sm">
              {searchTerm ? "No matching algorithms" : "No algorithm data. Upload CBOM files to populate."}
            </div>
          )}
        </CardContent>
      </Card>

      {cbom.perFile.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-mono text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <FileText className="w-3.5 h-3.5" />
              CBOM File Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="table-files">
                <thead>
                  <tr className="border-b">
                    <th className="py-2 pr-3 text-left text-[10px] font-mono text-muted-foreground uppercase tracking-wider">File</th>
                    <th className="py-2 pr-3 text-right text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Total</th>
                    <th className="py-2 pr-3 text-right text-[10px] font-mono text-muted-foreground uppercase tracking-wider">PQC Ready</th>
                    <th className="py-2 pr-3 text-right text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Not Ready</th>
                    <th className="py-2 pr-3 text-right text-[10px] font-mono text-muted-foreground uppercase tracking-wider">PQC %</th>
                  </tr>
                </thead>
                <tbody>
                  {cbom.perFile.map((file) => (
                    <tr key={file.fileId} className="border-b border-border/50 last:border-0" data-testid={`file-row-${file.fileId}`}>
                      <td className="py-2 pr-3 font-medium truncate max-w-[200px]">{file.filename}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{file.total}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-emerald-500">{file.pqcReady}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-rose-500">{file.pqcNotReady}</td>
                      <td className="py-2 pr-3 text-right">
                        <Badge variant="outline" className={`text-[10px] ${file.total > 0 && (file.pqcReady / file.total) >= 0.5 ? "text-emerald-500 border-emerald-500/30" : "text-amber-500 border-amber-500/30"}`}>
                          {file.total > 0 ? Math.round((file.pqcReady / file.total) * 100) : 0}%
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function DashboardView({ onViewSnapshots }: { onViewSnapshots: () => void }) {
  const [filters, setFilters] = useState<DashboardFilters>({});
  const [filterOpen, setFilterOpen] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(30000);
  const [expandedChart, setExpandedChart] = useState<{ title: string; content: React.ReactNode } | null>(null);
  const [activeTab, setActiveTab] = useState("overview");

  const { data: dashboard, isLoading, refetch, isRefetching, dataUpdatedAt } = useReportDashboard(filters, refreshInterval);
  const { data: permissions } = useRolePermissions();
  const createMutation = useCreateReport();
  const { toast } = useToast();

  const canEdit = useMemo(() => {
    if (!permissions) return true;
    const reportPerms = permissions.filter(p => p.menuItem === "reports");
    if (reportPerms.length === 0) return true;
    return reportPerms.some(p => p.canEdit);
  }, [permissions]);

  const lastRefreshed = dataUpdatedAt ? new Date(dataUpdatedAt) : null;

  const handleChartClick = useCallback((filterKey: string, value: string) => {
    if (filterKey === "componentType") {
      setFilters(f => ({ ...f, componentType: [value] }));
    } else if (filterKey === "quantumLevel") {
      setFilters(f => ({ ...f, quantumLevel: value.split(",").map(Number) }));
    } else if (filterKey === "complianceStatus") {
      setFilters(f => ({ ...f, complianceStatus: value }));
    }
    setFilterOpen(true);
  }, []);

  const handleSaveSnapshot = useCallback(async () => {
    if (!dashboard) return;
    const now = new Date();
    const title = `Security Report - ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;

    const lines: string[] = [];
    lines.push("CIPHERGUARD SECURITY DASHBOARD REPORT");
    lines.push(`Generated: ${now.toISOString()}`);
    lines.push("=".repeat(60));
    lines.push("");

    const activeFilterDesc = [];
    if (filters.componentType?.length) activeFilterDesc.push(`Types: ${filters.componentType.join(", ")}`);
    if (filters.quantumLevel?.length) activeFilterDesc.push(`Levels: ${filters.quantumLevel.join(", ")}`);
    if (filters.fileId?.length) activeFilterDesc.push(`Files: ${filters.fileId.join(", ")}`);
    if (filters.complianceStatus) activeFilterDesc.push(`Compliance: ${filters.complianceStatus}`);
    if (activeFilterDesc.length > 0) {
      lines.push("ACTIVE FILTERS");
      activeFilterDesc.forEach(f => lines.push(`  ${f}`));
      lines.push("");
    }

    lines.push("CBOM OVERVIEW");
    lines.push(`Total Components: ${dashboard.cbom.totalComponents}${dashboard.cbom.unfilteredTotal !== dashboard.cbom.totalComponents ? ` (${dashboard.cbom.unfilteredTotal} unfiltered)` : ""}`);
    lines.push(`CBOM Files: ${dashboard.cbom.totalFiles}`);
    lines.push(`PQC Ready: ${dashboard.cbom.pqcReady} | Not Ready: ${dashboard.cbom.pqcNotReady}`);
    lines.push("");

    lines.push("SECURITY POSTURE");
    dashboard.cbom.radarDimensions.forEach(d => lines.push(`  ${d.dimension}: ${d.value}%`));
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

    const violations = dashboard.compliance.results.filter(r => !r.compliant);
    if (violations.length > 0) {
      lines.push("VIOLATIONS");
      violations.forEach(v => {
        lines.push(`  ${v.componentName} (${v.componentType}) -> ${v.policyName}`);
        v.violations.forEach(msg => lines.push(`    [!] ${msg}`));
      });
      lines.push("");
    }

    lines.push("ALGORITHM INVENTORY");
    dashboard.cbom.algorithms.forEach(a => {
      lines.push(`  ${a.name} | ${a.type} | Mode: ${a.mode} | QSL: ${a.quantumLevel ?? "N/A"} | Count: ${a.count}`);
    });

    if (dashboard.cbom.cryptoFunctions.length > 0) {
      lines.push("");
      lines.push("CRYPTO FUNCTIONS");
      dashboard.cbom.cryptoFunctions.forEach(f => lines.push(`  ${f.name}: ${f.count}`));
    }

    try {
      await createMutation.mutateAsync({ title, content: lines.join("\n"), status: "final" });
      toast({ title: "Snapshot saved", description: "Dashboard report snapshot has been saved." });
    } catch {
      toast({ title: "Error saving snapshot", variant: "destructive" });
    }
  }, [dashboard, filters, createMutation, toast]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="pt-5 pb-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20 shrink-0">
            <BarChart3 className="w-4 h-4 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-display font-bold tracking-tight" data-testid="text-dashboard-title">Reports Dashboard</h1>
            <div className="flex items-center gap-3 flex-wrap">
              <p className="text-[10px] text-muted-foreground">
                {lastRefreshed && `Last refreshed: ${lastRefreshed.toLocaleTimeString()}`}
              </p>
              {dashboard.cbom.unfilteredTotal !== dashboard.cbom.totalComponents && (
                <Badge variant="secondary" className="text-[10px]">
                  Filtered: {dashboard.cbom.totalComponents} / {dashboard.cbom.unfilteredTotal}
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 border rounded-md px-2 py-1">
            <Timer className="w-3.5 h-3.5 text-muted-foreground" />
            <Select value={String(refreshInterval)} onValueChange={v => setRefreshInterval(Number(v))}>
              <SelectTrigger className="border-0 h-7 w-16 text-xs p-0 focus:ring-0" data-testid="select-refresh-interval">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REFRESH_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching} data-testid="button-refresh-dashboard">
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isRefetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          {canEdit && (
            <Button variant="outline" size="sm" onClick={handleSaveSnapshot} disabled={createMutation.isPending} data-testid="button-save-snapshot">
              {createMutation.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
              Save Snapshot
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onViewSnapshots} data-testid="button-view-snapshots">
            <FileText className="w-3.5 h-3.5 mr-1.5" />
            Saved Reports
          </Button>
        </div>
      </div>

      <FilterPanel
        filters={filters}
        onFiltersChange={setFilters}
        availableTypes={dashboard.filters.availableTypes}
        availableLevels={dashboard.filters.availableLevels}
        availableFiles={dashboard.filters.availableFiles}
        isOpen={filterOpen}
        onToggle={() => setFilterOpen(o => !o)}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList data-testid="tabs-dashboard">
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="charts" data-testid="tab-charts">Charts</TabsTrigger>
          <TabsTrigger value="compliance" data-testid="tab-compliance">Compliance</TabsTrigger>
          <TabsTrigger value="details" data-testid="tab-details">Details</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <OverviewTab dashboard={dashboard} onChartClick={handleChartClick} />
        </TabsContent>

        <TabsContent value="charts" className="mt-4">
          <ChartsTab dashboard={dashboard} onChartClick={handleChartClick} onExpandChart={setExpandedChart} />
        </TabsContent>

        <TabsContent value="compliance" className="mt-4">
          <ComplianceTab dashboard={dashboard} />
        </TabsContent>

        <TabsContent value="details" className="mt-4">
          <DetailsTab dashboard={dashboard} />
        </TabsContent>
      </Tabs>

      <Dialog open={!!expandedChart} onOpenChange={() => setExpandedChart(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="text-sm font-mono uppercase tracking-wider">{expandedChart?.title}</DialogTitle>
          </DialogHeader>
          <div className="min-h-[400px]">
            {expandedChart?.content}
          </div>
        </DialogContent>
      </Dialog>
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
          <h1 className="text-xl font-display font-bold tracking-tight">Saved Reports</h1>
          <p className="text-xs text-muted-foreground mt-0.5">View and manage saved report snapshots</p>
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
                        <Button variant="ghost" size="icon" onClick={e => { e.stopPropagation(); onEditReport(report); }} data-testid={`button-edit-report-${report.id}`}>
                          <Edit3 className="w-4 h-4" />
                        </Button>
                      )}
                      {canDelete && (
                        <Button variant="ghost" size="icon" className="text-rose-500" onClick={e => { e.stopPropagation(); handleDelete(report.id); }} data-testid={`button-delete-report-${report.id}`}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                      {!canEdit && !canDelete && (
                        <Button variant="ghost" size="icon" onClick={e => { e.stopPropagation(); onEditReport(report); }} data-testid={`button-view-report-${report.id}`}>
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
          <h1 className="text-xl font-display font-bold tracking-tight">
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
            <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} data-testid="button-export-report">
            <Download className="w-3.5 h-3.5 mr-1.5" /> Export
          </Button>
          {canEdit && (
            <Button size="sm" onClick={handleSave} disabled={isSaving} data-testid="button-save-report">
              {isSaving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
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
