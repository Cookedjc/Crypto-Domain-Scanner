import { useScans, useDeleteScan } from "@/hooks/use-scans";
import Layout from "@/components/layout";
import { CreateScanDialog } from "@/components/create-scan-dialog";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import {
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  ArrowRight,
  Server,
  Lock,
  Activity,
  Search,
  Clock,
  Loader2,
  Trash2,
  FileJson,
  Terminal,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Package
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useState, useEffect } from "react";
import type { Scan, CbomComponent, ScriptExecution, ScheduledScript } from "@shared/schema";
import { useQueryClient, useQuery } from "@tanstack/react-query";

// Helper for status colors
const getScoreColor = (score: number | null) => {
  if (score === null) return "text-muted-foreground bg-muted";
  if (score >= 80) return "text-emerald-500 bg-emerald-500/10 border-emerald-500/20";
  if (score >= 50) return "text-amber-500 bg-amber-500/10 border-amber-500/20";
  return "text-rose-500 bg-rose-500/10 border-rose-500/20";
};

const getPqcBadge = (status: string | null) => {
  if (!status) return null;
  const colors = {
    "Ready": "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    "Partial": "bg-amber-500/10 text-amber-500 border-amber-500/20",
    "Not Ready": "bg-rose-500/10 text-rose-500 border-rose-500/20",
    "Error": "bg-rose-500/10 text-rose-500 border-rose-500/20",
  };
  return (
    <Badge variant="outline" className={`font-mono text-[10px] uppercase ${colors[status as keyof typeof colors] || "text-muted-foreground"}`}>
      {status}
    </Badge>
  );
};

export default function Dashboard() {
  const queryClient = useQueryClient();
  const { data: scans, isLoading } = useScans();
  const [search, setSearch] = useState("");

  // CBOM data
  const { data: cbomComponents } = useQuery<CbomComponent[]>({
    queryKey: ["/api/cbom/components"],
  });

  // Scripts data
  const { data: scripts } = useQuery<ScheduledScript[]>({
    queryKey: ["/api/scripts"],
  });

  const { data: executions } = useQuery<ScriptExecution[]>({
    queryKey: ["/api/scripts/executions"],
  });

  // Auto-refresh when scans are in progress (missing protocol/score)
  const isScanning = scans?.some(s => !s.protocolVersion && s.score === null);
  
  useEffect(() => {
    if (isScanning) {
      const interval = setInterval(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/scans"] });
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [isScanning, queryClient]);

  const filteredScans = scans?.filter(s => 
    s.domain.toLowerCase().includes(search.toLowerCase())
  ) || [];

  // Sort by date desc
  filteredScans.sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());

  // Stats calculation
  const completedScans = scans?.filter(s => s.score !== null) || [];
  const avgScore = completedScans.length > 0 
    ? Math.round(completedScans.reduce((acc, s) => acc + (s.score || 0), 0) / completedScans.length)
    : 0;
  const criticalVulns = completedScans.filter(s => (s.score || 0) < 50).length;

  // CBOM stats
  const totalComponents = cbomComponents?.length || 0;
  const algorithms = cbomComponents?.filter(c => c.componentType === "algorithm") || [];
  const lowQuantumSecurity = algorithms.filter(a => a.nistQuantumSecurityLevel !== null && a.nistQuantumSecurityLevel < 3);

  // Scripts stats
  const totalScripts = scripts?.length || 0;
  const recentExecutions = executions?.slice(0, 5) || [];
  const failedExecutions = executions?.filter(e => e.status === "failed") || [];

  return (
    <Layout>
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-display font-bold text-white mb-2">Security Overview</h1>
          <p className="text-muted-foreground font-mono text-sm">Monitor cryptographic posture across your infrastructure.</p>
        </div>
        <div className="flex items-center gap-4">
          {isScanning && (
            <div className="flex items-center gap-2 text-primary font-mono text-xs animate-pulse">
              <Loader2 className="w-4 h-4 animate-spin" />
              SCAN IN PROGRESS...
            </div>
          )}
          <CreateScanDialog />
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatsCard 
          title="Average Security Score"
          value={`${avgScore}/100`}
          icon={ShieldCheck}
          trend="+2.5% this week"
          color="text-primary"
        />
        <StatsCard 
          title="Total Scanned Domains"
          value={scans?.length.toString() || "0"}
          icon={Server}
          trend="Active Monitoring"
          color="text-blue-500"
        />
        <StatsCard 
          title="Critical Vulnerabilities"
          value={criticalVulns.toString()}
          icon={ShieldAlert}
          trend="Requires Attention"
          color="text-rose-500"
        />
      </div>

      {/* CBOM & Scripts Summary Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CBOM Manager Summary */}
        <Card className="border-border/50">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <FileJson className="w-4 h-4 text-primary" />
              CBOM Manager
            </CardTitle>
            <Link href="/cbom">
              <Button variant="ghost" size="sm" data-testid="link-cbom-details">
                View All <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-muted/30 rounded-lg p-3 border border-border/50">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <Package className="w-3 h-3" />
                  Total Components
                </div>
                <div className="text-2xl font-mono font-bold">{totalComponents}</div>
              </div>
              <div className="bg-muted/30 rounded-lg p-3 border border-border/50">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <Lock className="w-3 h-3" />
                  Algorithms
                </div>
                <div className="text-2xl font-mono font-bold">{algorithms.length}</div>
              </div>
            </div>
            
            {lowQuantumSecurity.length > 0 && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                <div className="flex items-center gap-2 text-amber-500 text-sm font-medium mb-2">
                  <AlertTriangle className="w-4 h-4" />
                  Low Quantum Security Level
                </div>
                <div className="space-y-1">
                  {lowQuantumSecurity.slice(0, 3).map((alg) => (
                    <div key={alg.id} className="flex items-center justify-between text-xs">
                      <span className="font-mono truncate">{alg.name}</span>
                      <Badge variant="outline" className="text-amber-500 border-amber-500/30 text-[10px]">
                        NIST Level {alg.nistQuantumSecurityLevel}
                      </Badge>
                    </div>
                  ))}
                  {lowQuantumSecurity.length > 3 && (
                    <p className="text-xs text-muted-foreground">+{lowQuantumSecurity.length - 3} more</p>
                  )}
                </div>
              </div>
            )}

            {totalComponents === 0 && (
              <div className="text-center py-4 text-muted-foreground text-sm">
                <FileJson className="w-8 h-8 mx-auto mb-2 opacity-30" />
                No CBOM files uploaded yet
              </div>
            )}
          </CardContent>
        </Card>

        {/* Scripts Manager Summary */}
        <Card className="border-border/50">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Terminal className="w-4 h-4 text-primary" />
              Scripts Manager
            </CardTitle>
            <Link href="/scripts">
              <Button variant="ghost" size="sm" data-testid="link-scripts-details">
                View All <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-muted/30 rounded-lg p-3 border border-border/50">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <Terminal className="w-3 h-3" />
                  Total Scripts
                </div>
                <div className="text-2xl font-mono font-bold">{totalScripts}</div>
              </div>
              <div className="bg-muted/30 rounded-lg p-3 border border-border/50">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <XCircle className="w-3 h-3 text-rose-500" />
                  Failed Runs
                </div>
                <div className="text-2xl font-mono font-bold text-rose-500">{failedExecutions.length}</div>
              </div>
            </div>

            {recentExecutions.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground font-medium">Recent Executions</div>
                <div className="space-y-1">
                  {recentExecutions.map((exec) => {
                    const script = scripts?.find(s => s.id === exec.scriptId);
                    const isFailed = exec.status === "failed";
                    return (
                      <div 
                        key={exec.id} 
                        className={`flex items-center justify-between p-2 rounded-lg text-xs ${
                          isFailed 
                            ? "bg-rose-500/10 border border-rose-500/30" 
                            : "bg-muted/30 border border-border/50"
                        }`}
                        data-testid={`execution-row-${exec.id}`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {isFailed ? (
                            <XCircle className="w-3.5 h-3.5 text-rose-500 flex-shrink-0" />
                          ) : (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                          )}
                          <span className="font-medium truncate">{script?.name || `Script #${exec.scriptId}`}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {isFailed && exec.exitCode !== null && (
                            <Badge variant="outline" className="text-rose-500 border-rose-500/30 font-mono text-[10px]">
                              EXIT {exec.exitCode}
                            </Badge>
                          )}
                          <span className="text-muted-foreground">
                            {exec.startedAt ? formatDistanceToNow(new Date(exec.startedAt), { addSuffix: true }) : ""}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {recentExecutions.length === 0 && totalScripts === 0 && (
              <div className="text-center py-4 text-muted-foreground text-sm">
                <Terminal className="w-8 h-8 mx-auto mb-2 opacity-30" />
                No scripts configured yet
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Scans List Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-display font-semibold">Recent Analysis</h2>
          <div className="relative w-64">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search domains..." 
              className="pl-9 bg-card border-border/50"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border/50 overflow-hidden shadow-sm">
          {isLoading ? (
            <div className="p-8 space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-3 w-1/4" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredScans.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Activity className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p className="text-lg font-medium">No scans found</p>
              <p className="text-sm">Start a new scan to see results here.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {filteredScans.map((scan) => (
                <ScanRow key={scan.id} scan={scan} />
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

function StatsCard({ title, value, icon: Icon, trend, color }: any) {
  return (
    <div className="bg-card p-6 rounded-xl border border-border/50 shadow-lg shadow-black/20 hover:border-border transition-colors group">
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-sm text-muted-foreground font-medium mb-1">{title}</p>
          <h3 className="text-3xl font-bold font-mono tracking-tighter">{value}</h3>
        </div>
        <div className={`p-3 rounded-xl bg-background border border-border/50 ${color} group-hover:scale-110 transition-transform`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-block px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
          {trend}
        </span>
      </div>
    </div>
  );
}

function ScanRow({ scan }: { scan: Scan }) {
  const scoreClass = getScoreColor(scan.score);
  const deleteScan = useDeleteScan();
  const [isDeleting, setIsDeleting] = useState(false);
  
  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm(`Are you sure you want to delete the scan for ${scan.domain}?`)) {
      setIsDeleting(true);
      try {
        await deleteScan.mutateAsync(scan.id);
      } finally {
        setIsDeleting(false);
      }
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="p-4 hover:bg-muted/30 transition-colors group relative"
    >
      <div className="flex items-center gap-4">
        {/* Score Indicator */}
        <div className={`
          w-12 h-12 rounded-full flex items-center justify-center border-2 font-mono font-bold text-sm
          ${scoreClass}
        `}>
          {scan.score ?? "-"}
        </div>

        {/* Details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-semibold text-foreground truncate">{scan.domain}</h3>
            {scan.isSubdomain && <Badge variant="secondary" className="text-[10px]">SUB</Badge>}
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground font-mono">
            <span className="flex items-center gap-1">
              <Server className="w-3 h-3" /> Port {scan.port}
            </span>
            <span className="flex items-center gap-1">
              <Lock className="w-3 h-3" /> {scan.protocolVersion || "Scanning..."}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" /> 
              {scan.createdAt ? formatDistanceToNow(new Date(scan.createdAt), { addSuffix: true }) : 'Just now'}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <Link href={`/scans/${scan.id}`}>
            <Button variant="ghost" size="sm">
              Details
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
          <Button 
            variant="ghost" 
            size="icon" 
            className="text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
