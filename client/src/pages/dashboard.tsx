import { useScans, useDeleteScan } from "@/hooks/use-scans";
import { useGithubRepos, useCreateGithubRepo, useDeleteGithubRepo, useScanGithubRepo } from "@/hooks/use-github-repos";
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
  Package,
  Github,
  Plus,
  Eye,
  EyeOff,
  GitBranch,
  Play,
  ChevronDown,
  ChevronUp,
  ShieldQuestion,
  X
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { useState, useEffect } from "react";
import type { Scan, CbomComponent, ScriptExecution, ScheduledScript, GithubRepo } from "@shared/schema";
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

      {/* GitHub Repos Section */}
      <GithubReposSection />

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

function GithubReposSection() {
  const { data: repos, isLoading } = useGithubRepos();
  const deleteRepo = useDeleteGithubRepo();
  const scanRepo = useScanGithubRepo();
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical": return "text-rose-500 bg-rose-500/10 border-rose-500/20";
      case "high": return "text-orange-500 bg-orange-500/10 border-orange-500/20";
      case "medium": return "text-amber-500 bg-amber-500/10 border-amber-500/20";
      default: return "text-blue-500 bg-blue-500/10 border-blue-500/20";
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: "bg-muted text-muted-foreground",
      scanning: "bg-primary/10 text-primary border-primary/20 animate-pulse",
      completed: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
      failed: "bg-rose-500/10 text-rose-500 border-rose-500/20",
    };
    return (
      <Badge variant="outline" className={`font-mono text-[10px] uppercase ${styles[status] || ""}`} data-testid={`badge-repo-status-${status}`}>
        {status === "scanning" && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
        {status}
      </Badge>
    );
  };

  const getRepoName = (url: string) => {
    try {
      const parsed = new URL(url);
      return parsed.pathname.replace(/^\//, '').replace(/\.git$/, '');
    } catch {
      return url;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-display font-semibold flex items-center gap-2">
          <Github className="w-5 h-5" />
          GitHub Repository Scans
        </h2>
        <AddGithubRepoDialog />
      </div>

      <div className="bg-card rounded-xl border border-border/50 overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {[1, 2].map(i => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-1/4" />
                </div>
              </div>
            ))}
          </div>
        ) : !repos?.length ? (
          <div className="text-center py-12 text-muted-foreground">
            <Github className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p className="text-sm font-medium">No repositories added</p>
            <p className="text-xs mt-1">Add a GitHub repository to scan for cryptographic usage.</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {repos.map((repo: GithubRepo) => {
              const isExpanded = expandedId === repo.id;
              const results = repo.scanResults as any;
              const findings = results?.findings || [];
              const pqcNotReady = findings.filter((f: any) => !f.pqcReady);
              const pqcReady = findings.filter((f: any) => f.pqcReady);

              return (
                <div key={repo.id} data-testid={`repo-row-${repo.id}`}>
                  <div className="p-4 hover:bg-muted/30 transition-colors group">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-muted/50 border border-border/50 flex items-center justify-center">
                        <Github className="w-5 h-5 text-muted-foreground" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-foreground truncate font-mono text-sm" data-testid={`text-repo-name-${repo.id}`}>
                            {getRepoName(repo.repoUrl)}
                          </h3>
                          {(repo as any).hasAuth && (
                            <Badge variant="outline" className="text-[10px] font-mono">
                              <Lock className="w-2.5 h-2.5 mr-1" />
                              AUTH
                            </Badge>
                          )}
                          {getStatusBadge(repo.status)}
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground font-mono">
                          <span className="flex items-center gap-1">
                            <GitBranch className="w-3 h-3" /> {repo.branch || "main"}
                          </span>
                          {results?.totalFiles != null && (
                            <span className="flex items-center gap-1">
                              <FileJson className="w-3 h-3" /> {results.totalFiles} files
                            </span>
                          )}
                          {results?.cryptoFiles != null && (
                            <span className="flex items-center gap-1">
                              <ShieldQuestion className="w-3 h-3" /> {results.cryptoFiles} crypto files
                            </span>
                          )}
                          {repo.lastScanAt && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatDistanceToNow(new Date(repo.lastScanAt), { addSuffix: true })}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        {repo.status === "completed" && findings.length > 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setExpandedId(isExpanded ? null : repo.id)}
                            data-testid={`button-expand-repo-${repo.id}`}
                          >
                            {pqcNotReady.length > 0 ? (
                              <Badge variant="outline" className="text-rose-500 border-rose-500/30 text-[10px] mr-2">
                                {pqcNotReady.length} issues
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-emerald-500 border-emerald-500/30 text-[10px] mr-2">
                                PQC Ready
                              </Badge>
                            )}
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => scanRepo.mutate(repo.id)}
                          disabled={repo.status === "scanning" || scanRepo.isPending}
                          data-testid={`button-scan-repo-${repo.id}`}
                        >
                          {repo.status === "scanning" ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Play className="w-4 h-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
                          onClick={() => {
                            if (confirm("Remove this repository?")) deleteRepo.mutate(repo.id);
                          }}
                          data-testid={`button-delete-repo-${repo.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    {repo.status === "failed" && results?.error && (
                      <div className="mt-3 p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs text-rose-400 font-mono">
                        {results.error}
                      </div>
                    )}
                  </div>

                  {isExpanded && findings.length > 0 && (
                    <div className="px-4 pb-4">
                      <div className="bg-muted/20 rounded-lg border border-border/50 overflow-hidden">
                        <div className="grid grid-cols-2 gap-3 p-3 border-b border-border/50">
                          <div className="bg-background rounded-lg p-3 border border-border/50">
                            <div className="text-xs text-muted-foreground mb-1">Total Findings</div>
                            <div className="text-xl font-mono font-bold">{findings.length}</div>
                          </div>
                          <div className="bg-background rounded-lg p-3 border border-border/50">
                            <div className="text-xs text-muted-foreground mb-1">Not PQC Ready</div>
                            <div className="text-xl font-mono font-bold text-rose-500">{pqcNotReady.length}</div>
                          </div>
                        </div>
                        <div className="max-h-64 overflow-y-auto">
                          <table className="w-full text-xs">
                            <thead className="sticky top-0 bg-muted/50">
                              <tr className="text-left text-muted-foreground">
                                <th className="p-2 font-medium">File</th>
                                <th className="p-2 font-medium">Line</th>
                                <th className="p-2 font-medium">Algorithm</th>
                                <th className="p-2 font-medium">Type</th>
                                <th className="p-2 font-medium">Severity</th>
                                <th className="p-2 font-medium">PQC</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border/30">
                              {findings.map((f: any, idx: number) => (
                                <tr key={idx} className="hover:bg-muted/30">
                                  <td className="p-2 font-mono truncate max-w-[200px]" title={f.file}>{f.file}</td>
                                  <td className="p-2 font-mono">{f.line || "-"}</td>
                                  <td className="p-2 font-mono font-medium">{f.algorithm}</td>
                                  <td className="p-2">
                                    <Badge variant="outline" className="text-[9px]">{f.type}</Badge>
                                  </td>
                                  <td className="p-2">
                                    <Badge variant="outline" className={`text-[9px] ${getSeverityColor(f.severity)}`}>
                                      {f.severity}
                                    </Badge>
                                  </td>
                                  <td className="p-2">
                                    {f.pqcReady ? (
                                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                    ) : (
                                      <XCircle className="w-3.5 h-3.5 text-rose-500" />
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function AddGithubRepoDialog() {
  const [open, setOpen] = useState(false);
  const [repoUrl, setRepoUrl] = useState("");
  const [branch, setBranch] = useState("main");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const createRepo = useCreateGithubRepo();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createRepo.mutate(
      {
        repoUrl,
        branch: branch || "main",
        username: username || undefined,
        password: password || undefined,
      },
      {
        onSuccess: () => {
          setOpen(false);
          setRepoUrl("");
          setBranch("main");
          setUsername("");
          setPassword("");
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" data-testid="button-add-github-repo">
          <Plus className="w-4 h-4 mr-2" />
          Add Repository
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] border-primary/20 bg-card shadow-2xl shadow-black/50">
        <DialogHeader>
          <DialogTitle className="text-xl font-display flex items-center gap-2">
            <Github className="w-5 h-5" />
            Add GitHub Repository
          </DialogTitle>
          <DialogDescription>
            Enter a GitHub repository URL to scan for cryptographic usage. Add credentials for private repos.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div className="space-y-2">
            <label className="font-mono text-xs uppercase text-muted-foreground">Repository URL</label>
            <div className="relative">
              <Github className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="https://github.com/owner/repo"
                className="pl-9 font-mono"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                required
                data-testid="input-repo-url"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="font-mono text-xs uppercase text-muted-foreground">Branch</label>
            <div className="relative">
              <GitBranch className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="main"
                className="pl-9 font-mono"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                data-testid="input-repo-branch"
              />
            </div>
          </div>

          <div className="border border-border/50 rounded-lg p-4 space-y-3 bg-muted/20">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Lock className="w-4 h-4 text-muted-foreground" />
              Private Repository Authentication
            </div>
            <p className="text-xs text-muted-foreground">
              For private repos, use a GitHub username and personal access token (PAT).
            </p>

            <div className="space-y-2">
              <label className="font-mono text-xs uppercase text-muted-foreground">Username</label>
              <Input
                placeholder="github-username"
                className="font-mono"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                data-testid="input-repo-username"
              />
            </div>

            <div className="space-y-2">
              <label className="font-mono text-xs uppercase text-muted-foreground">Password / Token</label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="ghp_xxxxxxxxxxxx"
                  className="font-mono pr-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  data-testid="input-repo-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
                  data-testid="button-toggle-password"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="submit"
              className="w-full bg-primary font-bold tracking-wide"
              disabled={createRepo.isPending || !repoUrl}
              data-testid="button-submit-repo"
            >
              {createRepo.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                "Add Repository"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
