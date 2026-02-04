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
  Trash2
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useState, useEffect } from "react";
import type { Scan } from "@shared/schema";
import { useQueryClient } from "@tanstack/react-query";

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
            {getPqcBadge(scan.pqcStatus)}
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
