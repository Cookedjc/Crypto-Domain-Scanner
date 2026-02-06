import { useState, useRef, useCallback, useMemo } from "react";
import Layout from "@/components/layout";
import { useReports, useCreateReport, useUpdateReport, useDeleteReport } from "@/hooks/use-reports";
import { useCbomFiles, useCbomComponents } from "@/hooks/use-cbom";
import { usePolicies, useMatchPolicies } from "@/hooks/use-policies";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { formatDistanceToNow, format } from "date-fns";
import {
  FileText,
  Plus,
  Trash2,
  Save,
  Edit3,
  Loader2,
  X,
  FileJson,
  ShieldCheck,
  ShieldAlert,
  ArrowLeft,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Copy,
  Download,
  Database,
  Lock,
} from "lucide-react";
import type { Report, CbomComponent, SecurityPolicy, ReportStatus } from "@shared/schema";

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  draft: { label: "Draft", color: "text-amber-500", bg: "bg-amber-500/10" },
  final: { label: "Final", color: "text-emerald-500", bg: "bg-emerald-500/10" },
  archived: { label: "Archived", color: "text-muted-foreground", bg: "bg-muted/30" },
};

export default function ReportsPage() {
  const { toast } = useToast();
  const { data: reportsList, isLoading } = useReports();
  const { data: cbomComponents } = useCbomComponents();
  const { data: cbomFiles } = useCbomFiles();
  const { data: policies } = usePolicies();
  const createMutation = useCreateReport();
  const updateMutation = useUpdateReport();
  const deleteMutation = useDeleteReport();
  const matchMutation = useMatchPolicies();

  const [activeReportId, setActiveReportId] = useState<number | null>(null);
  const [editorMode, setEditorMode] = useState<"list" | "edit">("list");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<ReportStatus>("draft");
  const [isSaving, setIsSaving] = useState(false);
  const [showInsertMenu, setShowInsertMenu] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activeReport = useMemo(() => {
    if (!activeReportId || !reportsList) return null;
    return reportsList.find(r => r.id === activeReportId) || null;
  }, [activeReportId, reportsList]);

  const openEditor = useCallback((report?: Report) => {
    if (report) {
      setActiveReportId(report.id);
      setTitle(report.title);
      setContent(report.content);
      setStatus(report.status as ReportStatus);
    } else {
      setActiveReportId(null);
      setTitle("");
      setContent("");
      setStatus("draft");
    }
    setEditorMode("edit");
  }, []);

  const handleSave = useCallback(async () => {
    if (!title.trim()) {
      toast({ title: "Title required", description: "Please enter a report title.", variant: "destructive" });
      return;
    }
    setIsSaving(true);
    try {
      if (activeReportId) {
        await updateMutation.mutateAsync({ id: activeReportId, data: { title, content, status } });
        toast({ title: "Report updated" });
      } else {
        const created = await createMutation.mutateAsync({ title, content, status });
        setActiveReportId(created.id);
        toast({ title: "Report created" });
      }
    } catch {
      toast({ title: "Error saving report", variant: "destructive" });
    }
    setIsSaving(false);
  }, [title, content, status, activeReportId, updateMutation, createMutation, toast]);

  const handleDelete = useCallback(async (id: number) => {
    try {
      await deleteMutation.mutateAsync(id);
      toast({ title: "Report deleted" });
      if (activeReportId === id) {
        setEditorMode("list");
        setActiveReportId(null);
      }
    } catch {
      toast({ title: "Error deleting report", variant: "destructive" });
    }
  }, [deleteMutation, activeReportId, toast]);

  const insertAtCursor = useCallback((text: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setContent(prev => prev + text);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = content.substring(0, start);
    const after = content.substring(end);
    const newContent = before + text + after;
    setContent(newContent);
    setShowInsertMenu(false);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + text.length, start + text.length);
    }, 50);
  }, [content]);

  const generateCbomSummary = useCallback(() => {
    if (!cbomComponents || cbomComponents.length === 0) return "No CBOM components found.\n";

    const lines: string[] = [];
    lines.push("=== CBOM Component Summary ===");
    lines.push(`Total Components: ${cbomComponents.length}`);
    lines.push("");

    const byType: Record<string, CbomComponent[]> = {};
    cbomComponents.forEach(c => {
      const t = c.componentType || "Unknown";
      if (!byType[t]) byType[t] = [];
      byType[t].push(c);
    });

    Object.entries(byType).forEach(([type, comps]) => {
      lines.push(`[${type}] (${comps.length} components)`);
      comps.forEach(c => {
        const parts = [`  - ${c.name}`];
        if (c.version) parts.push(`v${c.version}`);
        if (c.primitiveType) parts.push(`| ${c.primitiveType}`);
        if (c.nistQuantumSecurityLevel) parts.push(`| NIST QSL: ${c.nistQuantumSecurityLevel}`);
        if (c.algorithmMode) parts.push(`| Mode: ${c.algorithmMode}`);
        lines.push(parts.join(" "));
      });
      lines.push("");
    });

    const pqcReady = cbomComponents.filter(c => (c.nistQuantumSecurityLevel ?? 0) >= 3);
    const notReady = cbomComponents.filter(c => !c.nistQuantumSecurityLevel || c.nistQuantumSecurityLevel < 3);
    lines.push(`PQC Ready: ${pqcReady.length} / ${cbomComponents.length}`);
    lines.push(`Not PQC Ready: ${notReady.length} / ${cbomComponents.length}`);
    lines.push("");

    return lines.join("\n");
  }, [cbomComponents]);

  const generateCbomTable = useCallback(() => {
    if (!cbomComponents || cbomComponents.length === 0) return "No CBOM components found.\n";

    const lines: string[] = [];
    lines.push("=== CBOM Component Details ===");
    lines.push("Name | Type | Primitive | OID | Version | Mode | NIST QSL");
    lines.push("-".repeat(80));

    cbomComponents.forEach(c => {
      lines.push([
        c.name,
        c.componentType || "-",
        c.primitiveType || "-",
        c.oid || "-",
        c.version || "-",
        c.algorithmMode || "-",
        c.nistQuantumSecurityLevel?.toString() || "-",
      ].join(" | "));
    });
    lines.push("");
    return lines.join("\n");
  }, [cbomComponents]);

  const generatePolicySummary = useCallback(() => {
    if (!policies || policies.length === 0) return "No security policies configured.\n";

    const lines: string[] = [];
    lines.push("=== Security Policies Summary ===");
    lines.push(`Total Policies: ${policies.length}`);
    const active = policies.filter(p => p.status === "active");
    const draft = policies.filter(p => p.status === "draft");
    lines.push(`Active: ${active.length} | Draft: ${draft.length}`);
    lines.push("");

    policies.forEach(p => {
      lines.push(`[${p.status.toUpperCase()}] ${p.name}`);
      if (p.description) lines.push(`  Description: ${p.description}`);
      lines.push(`  Asset Category: ${p.assetCategory}`);
      lines.push(`  Data Classification: ${p.dataClassification}`);
      if (p.allowedAlgorithms?.length) lines.push(`  Allowed: ${p.allowedAlgorithms.join(", ")}`);
      if (p.prohibitedAlgorithms?.length) lines.push(`  Prohibited: ${p.prohibitedAlgorithms.join(", ")}`);
      if (p.minimumKeySize) lines.push(`  Min Key Size: ${p.minimumKeySize}-bit`);
      if (p.minimumNistLevel) lines.push(`  NIST FIPS: ${p.minimumNistLevel}`);
      lines.push(`  PQC Required: ${p.pqcRequired ? "Yes" : "No"}`);
      lines.push(`  Encryption: ${[p.encryptionAtRest ? "At Rest" : "", p.encryptionInTransit ? "In Transit" : ""].filter(Boolean).join(", ") || "None"}`);
      lines.push("");
    });

    return lines.join("\n");
  }, [policies]);

  const generatePolicyMatchResults = useCallback(async () => {
    try {
      const result = await matchMutation.mutateAsync();
      if (!result || result.matched === 0) return "No policy matches found. Upload CBOM data and create active policies to run matching.\n";

      const lines: string[] = [];
      lines.push("=== Policy Compliance Results ===");
      lines.push(`Total Matches: ${result.matched}`);

      const compliant = result.results.filter((r: any) => r.compliant);
      const violations = result.results.filter((r: any) => !r.compliant);
      lines.push(`Compliant: ${compliant.length} | Violations: ${violations.length}`);
      lines.push("");

      if (violations.length > 0) {
        lines.push("--- VIOLATIONS ---");
        violations.forEach((v: any) => {
          lines.push(`Component: ${v.componentName} --> Policy: ${v.policyName}`);
          v.violations.forEach((msg: string) => {
            lines.push(`  [!] ${msg}`);
          });
          lines.push("");
        });
      }

      if (compliant.length > 0) {
        lines.push("--- COMPLIANT ---");
        compliant.forEach((c: any) => {
          lines.push(`Component: ${c.componentName} --> Policy: ${c.policyName} [OK]`);
        });
        lines.push("");
      }

      return lines.join("\n");
    } catch {
      return "Error running policy matching. Ensure CBOM data and active policies exist.\n";
    }
  }, [matchMutation]);

  const handleCopyContent = useCallback(() => {
    navigator.clipboard.writeText(content);
    toast({ title: "Copied to clipboard" });
  }, [content, toast]);

  const handleExportText = useCallback(() => {
    const blob = new Blob([`${title}\n${"=".repeat(title.length)}\n\n${content}`], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_report.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [title, content]);

  if (editorMode === "edit") {
    return (
      <Layout>
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setEditorMode("list")} data-testid="button-back-to-list">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="flex-1">
              <h1 className="text-2xl font-display font-bold tracking-tight">
                {activeReportId ? "Edit Report" : "New Report"}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {activeReportId ? "Modify your report content" : "Create a new security assessment report"}
              </p>
            </div>
            <div className="flex items-center gap-2">
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
              <Button variant="outline" onClick={handleCopyContent} data-testid="button-copy-content">
                <Copy className="w-4 h-4 mr-2" />
                Copy
              </Button>
              <Button variant="outline" onClick={handleExportText} data-testid="button-export-report">
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
              <Button onClick={handleSave} disabled={isSaving} data-testid="button-save-report">
                {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Save
              </Button>
            </div>
          </div>

          <div className="space-y-4">
            <Input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Report Title..."
              className="text-lg font-semibold"
              data-testid="input-report-title"
            />

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <CardTitle className="text-sm font-mono text-muted-foreground">Insert Data</CardTitle>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => insertAtCursor(generateCbomSummary())}
                      disabled={!cbomComponents?.length}
                      data-testid="button-insert-cbom-summary"
                    >
                      <FileJson className="w-3.5 h-3.5 mr-1.5" />
                      CBOM Summary
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => insertAtCursor(generateCbomTable())}
                      disabled={!cbomComponents?.length}
                      data-testid="button-insert-cbom-table"
                    >
                      <Database className="w-3.5 h-3.5 mr-1.5" />
                      CBOM Details
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => insertAtCursor(generatePolicySummary())}
                      disabled={!policies?.length}
                      data-testid="button-insert-policy-summary"
                    >
                      <Lock className="w-3.5 h-3.5 mr-1.5" />
                      Policy Summary
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        const result = await generatePolicyMatchResults();
                        insertAtCursor(result);
                      }}
                      disabled={matchMutation.isPending}
                      data-testid="button-insert-match-results"
                    >
                      {matchMutation.isPending ? (
                        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />
                      )}
                      Compliance Results
                    </Button>
                  </div>
                </div>
              </CardHeader>
            </Card>

            <div className="relative">
              <Textarea
                ref={textareaRef}
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder="Start writing your report here...&#10;&#10;Use the Insert Data buttons above to pull in CBOM component data, security policy summaries, and compliance matching results."
                className="min-h-[500px] font-mono text-sm leading-relaxed resize-y"
                data-testid="textarea-report-content"
              />
              <div className="absolute bottom-3 right-3 text-xs text-muted-foreground font-mono">
                {content.length} chars
              </div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-display font-bold tracking-tight flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20">
                <FileText className="w-5 h-5 text-primary" />
              </div>
              Reports
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Create and manage security assessment reports</p>
          </div>
          <Button onClick={() => openEditor()} data-testid="button-new-report">
            <Plus className="w-4 h-4 mr-2" />
            New Report
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : !reportsList?.length ? (
          <Card>
            <CardContent className="py-16">
              <div className="text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto">
                  <FileText className="w-8 h-8 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-lg font-medium">No Reports Yet</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Create your first security assessment report with CBOM and policy analysis data.
                  </p>
                </div>
                <Button onClick={() => openEditor()} data-testid="button-new-report-empty">
                  <Plus className="w-4 h-4 mr-2" />
                  Create Report
                </Button>
              </div>
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
                  onClick={() => openEditor(report)}
                  data-testid={`card-report-${report.id}`}
                >
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
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
                        <div className="flex items-center gap-3 mt-2">
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
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={e => { e.stopPropagation(); openEditor(report); }}
                          data-testid={`button-edit-report-${report.id}`}
                        >
                          <Edit3 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-rose-500"
                          onClick={e => { e.stopPropagation(); handleDelete(report.id); }}
                          data-testid={`button-delete-report-${report.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
