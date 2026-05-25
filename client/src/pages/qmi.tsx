/**
 * QMI — Quantum Migration Index
 *
 * Tracks cryptographic assets that need migrating to post-quantum algorithms.
 * Assets can be imported from CycloneDX SBOM JSON or syslog files, or added manually.
 * Each asset gets a QMI score: QMI = (C × T) / (B × D × F)
 *   C = migration capacity (1-10)
 *   T = time remaining (1-10)
 *   B = migration burden (1-10)
 *   D = dependency depth (1-10)
 *   F = fragility (1-10)
 */

import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import Layout from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Upload, Trash2, Pencil, FileJson, FileText,
  Atom, TrendingUp, TrendingDown, Minus, RefreshCw,
  ChevronDown, ChevronUp, Info,
} from "lucide-react";
import type { QmiAsset, QmiUpload } from "@shared/schema";
import { QMI_ASSET_TYPES, QMI_DATA_CLASSES, QMI_ENVIRONMENTS } from "@shared/schema";

// ─── Score helpers ────────────────────────────────────────────────────────────

/** Compute QMI from factor values */
function computeQmi(C: number, T: number, B: number, D: number, F: number): number {
  if (B <= 0 || D <= 0 || F <= 0) return 0;
  return (C * T) / (B * D * F);
}

/** Map a QMI score to a risk label and colour class */
function scoreLabel(score: number): { label: string; color: string; bg: string } {
  if (score >= 2)   return { label: "High",   color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" };
  if (score >= 0.5) return { label: "Medium", color: "text-amber-400",   bg: "bg-amber-500/10 border-amber-500/20" };
  return              { label: "Low",    color: "text-rose-400",    bg: "bg-rose-500/10 border-rose-500/20" };
}

function formatScore(raw: string | null | undefined): string {
  const n = parseFloat(raw ?? "0");
  if (isNaN(n)) return "—";
  return n.toFixed(3);
}

// ─── Asset type badge colours ────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  tls:         "bg-blue-500/10 text-blue-400 border-blue-500/20",
  certificate: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  ssh:         "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  vpn:         "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  hsm:         "bg-orange-500/10 text-orange-400 border-orange-500/20",
  kms:         "bg-rose-500/10 text-rose-400 border-rose-500/20",
  application: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  other:       "bg-muted text-muted-foreground border-border",
};

// ─── Blank form state ────────────────────────────────────────────────────────

const BLANK_FORM = {
  name: "",
  assetType: "other" as QmiAsset["assetType"],
  algorithm: "",
  sourceRef: "",
  dataClass: "",
  application: "",
  environment: "",
  vendor: "",
  owner: "",
  migrationCapacity: 5,
  timeRemaining: 5,
  migrationBurden: 5,
  dependencyDepth: 3,
  fragility: 3,
  notes: "",
  source: "manual" as const,
};

// ─── Factor slider component ─────────────────────────────────────────────────

function FactorSlider({
  label, hint, value, onChange,
}: {
  label: string; hint: string; value: number; onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="font-mono text-xs text-muted-foreground uppercase">{label}</Label>
        <span className="font-mono text-xs font-bold text-primary">{value}</span>
      </div>
      <Slider
        min={1} max={10} step={1}
        value={[value]}
        onValueChange={([v]) => onChange(v)}
        className="w-full"
        data-testid={`slider-${label.toLowerCase().replace(/\s/g, "-")}`}
      />
      <p className="text-xs text-muted-foreground/60">{hint}</p>
    </div>
  );
}

// ─── Live QMI preview ────────────────────────────────────────────────────────

function QmiPreview({ C, T, B, D, F }: { C:number; T:number; B:number; D:number; F:number }) {
  const score = computeQmi(C, T, B, D, F);
  const { label, color, bg } = scoreLabel(score);
  return (
    <div className={`rounded-lg border p-3 flex items-center justify-between ${bg}`}>
      <span className="font-mono text-xs text-muted-foreground">QMI Preview</span>
      <span className={`font-mono text-lg font-bold ${color}`}>
        {score.toFixed(3)} <span className="text-xs font-normal ml-1">{label}</span>
      </span>
    </div>
  );
}

// ─── Add / Edit dialog ───────────────────────────────────────────────────────

function AssetDialog({
  open, onClose, initial,
}: {
  open: boolean;
  onClose: () => void;
  initial?: QmiAsset | null;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({ ...BLANK_FORM, ...(initial ?? {}) });
  const isEdit = !!initial;

  const set = (k: string, v: any) => setForm(prev => ({ ...prev, [k]: v }));

  const saveMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      if (isEdit) {
        return apiRequest("PUT", `/api/qmi/assets/${initial!.id}`, data);
      }
      return apiRequest("POST", "/api/qmi/assets", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/qmi/assets"] });
      toast({ title: isEdit ? "Asset updated" : "Asset added", description: form.name });
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // Reset form when dialog opens with new initial value
  const prevInitialRef = useRef(initial);
  if (prevInitialRef.current !== initial) {
    prevInitialRef.current = initial;
    setTimeout(() => setForm({ ...BLANK_FORM, ...(initial ?? {}) }), 0);
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto border-primary/20 bg-card">
        <DialogHeader>
          <DialogTitle className="font-display">
            {isEdit ? "Edit Asset" : "Add Asset Manually"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update business context and QMI factor inputs."
              : "Add a cryptographic asset and set its QMI factor inputs."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Identity */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1 col-span-2">
              <Label className="font-mono text-xs uppercase text-muted-foreground">Asset Name *</Label>
              <Input
                value={form.name}
                onChange={e => set("name", e.target.value)}
                placeholder="e.g. api-gateway TLS certificate"
                data-testid="input-asset-name"
              />
            </div>
            <div className="space-y-1">
              <Label className="font-mono text-xs uppercase text-muted-foreground">Type</Label>
              <Select value={form.assetType} onValueChange={v => set("assetType", v)}>
                <SelectTrigger data-testid="select-asset-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {QMI_ASSET_TYPES.map(t => (
                    <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="font-mono text-xs uppercase text-muted-foreground">Algorithm</Label>
              <Input
                value={form.algorithm}
                onChange={e => set("algorithm", e.target.value)}
                placeholder="e.g. RSA-2048, AES-128-CBC"
                data-testid="input-algorithm"
              />
            </div>
            <div className="space-y-1 col-span-2">
              <Label className="font-mono text-xs uppercase text-muted-foreground">Source Reference</Label>
              <Input
                value={form.sourceRef}
                onChange={e => set("sourceRef", e.target.value)}
                placeholder="Service name, file path, or component ID"
                data-testid="input-source-ref"
              />
            </div>
          </div>

          {/* Business context */}
          <div>
            <p className="font-mono text-xs uppercase text-muted-foreground/50 mb-3">Business Context</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="font-mono text-xs uppercase text-muted-foreground">Data Class</Label>
                <Select value={form.dataClass || "_none"} onValueChange={v => set("dataClass", v === "_none" ? "" : v)}>
                  <SelectTrigger data-testid="select-data-class"><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— Not set —</SelectItem>
                    {QMI_DATA_CLASSES.map(c => (
                      <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="font-mono text-xs uppercase text-muted-foreground">Environment</Label>
                <Select value={form.environment || "_none"} onValueChange={v => set("environment", v === "_none" ? "" : v)}>
                  <SelectTrigger data-testid="select-environment"><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— Not set —</SelectItem>
                    {QMI_ENVIRONMENTS.map(e => (
                      <SelectItem key={e} value={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="font-mono text-xs uppercase text-muted-foreground">Application</Label>
                <Input value={form.application} onChange={e => set("application", e.target.value)} placeholder="Application name" data-testid="input-application" />
              </div>
              <div className="space-y-1">
                <Label className="font-mono text-xs uppercase text-muted-foreground">Vendor</Label>
                <Input value={form.vendor} onChange={e => set("vendor", e.target.value)} placeholder="Software/hardware vendor" data-testid="input-vendor" />
              </div>
              <div className="space-y-1 col-span-2">
                <Label className="font-mono text-xs uppercase text-muted-foreground">Owner</Label>
                <Input value={form.owner} onChange={e => set("owner", e.target.value)} placeholder="Team or person responsible" data-testid="input-owner" />
              </div>
            </div>
          </div>

          {/* QMI factors */}
          <div>
            <p className="font-mono text-xs uppercase text-muted-foreground/50 mb-3">
              QMI Factors — QMI = (C × T) / (B × D × F)
            </p>
            <div className="space-y-4">
              <FactorSlider label="C — Migration Capacity" hint="Team/tooling readiness for this migration (higher = more capable)" value={form.migrationCapacity} onChange={v => set("migrationCapacity", v)} />
              <FactorSlider label="T — Time Remaining" hint="Available time before deadline (higher = more time)" value={form.timeRemaining} onChange={v => set("timeRemaining", v)} />
              <FactorSlider label="B — Migration Burden" hint="Effort and complexity of the migration (higher = harder)" value={form.migrationBurden} onChange={v => set("migrationBurden", v)} />
              <FactorSlider label="D — Dependency Depth" hint="Number of systems that depend on this asset (higher = more deps)" value={form.dependencyDepth} onChange={v => set("dependencyDepth", v)} />
              <FactorSlider label="F — Fragility" hint="Risk of breakage during migration (higher = more fragile)" value={form.fragility} onChange={v => set("fragility", v)} />
            </div>
            <div className="mt-4">
              <QmiPreview C={form.migrationCapacity} T={form.timeRemaining} B={form.migrationBurden} D={form.dependencyDepth} F={form.fragility} />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <Label className="font-mono text-xs uppercase text-muted-foreground">Notes</Label>
            <Textarea
              value={form.notes}
              onChange={e => set("notes", e.target.value)}
              placeholder="Any migration notes or context…"
              rows={2}
              data-testid="input-notes"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} data-testid="button-cancel">Cancel</Button>
          <Button
            onClick={() => saveMutation.mutate(form)}
            disabled={saveMutation.isPending || !form.name}
            data-testid="button-save-asset"
          >
            {saveMutation.isPending ? "Saving…" : isEdit ? "Save Changes" : "Add Asset"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Upload dialog ────────────────────────────────────────────────────────────

function UploadDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const [mode, setMode] = useState<"sbom" | "syslog">("sbom");
  const fileRef = useRef<HTMLInputElement>(null);
  const [filename, setFilename] = useState("");
  const [content, setContent] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const uploadMutation = useMutation({
    mutationFn: async () => {
      const endpoint = mode === "sbom" ? "/api/qmi/upload/sbom" : "/api/qmi/upload/syslog";
      return apiRequest("POST", endpoint, { filename, content });
    },
    onSuccess: async (res: any) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/qmi/assets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/qmi/uploads"] });
      toast({
        title: "Upload complete",
        description: `Found ${data.count} asset${data.count !== 1 ? "s" : ""} in ${filename}`,
      });
      onClose();
      setFilename(""); setContent("");
    },
    onError: async (err: any) => {
      const msg = err.message ?? "Upload failed";
      toast({ title: "Upload failed", description: msg, variant: "destructive" });
    },
  });

  function loadFile(file: File) {
    setFilename(file.name);
    const reader = new FileReader();
    reader.onload = e => setContent((e.target?.result as string) ?? "");
    reader.readAsText(file);
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-xl border-primary/20 bg-card">
        <DialogHeader>
          <DialogTitle className="font-display">Import Assets from File</DialogTitle>
          <DialogDescription>
            Upload a CycloneDX SBOM JSON or syslog file to automatically discover cryptographic assets.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Type selector */}
          <div className="grid grid-cols-2 gap-2">
            {(["sbom", "syslog"] as const).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                data-testid={`btn-mode-${m}`}
                className={`flex items-center gap-2 p-3 rounded-lg border text-sm transition-all ${
                  mode === m
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-border/80"
                }`}
              >
                {m === "sbom" ? <FileJson className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                {m === "sbom" ? "CycloneDX SBOM JSON" : "Syslog File"}
              </button>
            ))}
          </div>

          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) loadFile(f); }}
            onClick={() => fileRef.current?.click()}
            data-testid="drop-zone"
            className={`cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
              dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
            }`}
          >
            <Upload className="w-6 h-6 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {filename || (mode === "sbom" ? "Drop SBOM JSON file here or click to browse" : "Drop syslog file here or click to browse")}
            </p>
            <input
              ref={fileRef}
              type="file"
              accept={mode === "sbom" ? ".json" : ".log,.syslog,.txt"}
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) loadFile(f); }}
              data-testid="input-file"
            />
          </div>

          {/* Paste fallback */}
          {!content && (
            <div className="space-y-1">
              <Label className="font-mono text-xs uppercase text-muted-foreground">
                Or paste content directly
              </Label>
              <Textarea
                rows={4}
                placeholder={mode === "sbom" ? '{ "bomFormat": "CycloneDX", … }' : "May 25 08:01:03 web-prod sshd[1234]: …"}
                value={content}
                onChange={e => { setContent(e.target.value); if (!filename) setFilename(`pasted-${mode}.${mode === "sbom" ? "json" : "log"}`); }}
                className="font-mono text-xs"
                data-testid="input-paste-content"
              />
            </div>
          )}

          {content && (
            <div className="flex items-center justify-between text-xs text-muted-foreground bg-muted/30 rounded px-3 py-2">
              <span className="font-mono truncate max-w-[200px]">{filename}</span>
              <button onClick={() => { setFilename(""); setContent(""); }} className="text-muted-foreground hover:text-foreground ml-2">
                ✕ Clear
              </button>
            </div>
          )}

          {/* Sample data hint */}
          <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/20 rounded-lg p-3 border border-border/40">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>
              Sample files available at <code className="font-mono">sample-data/sample-sbom.json</code> and{" "}
              <code className="font-mono">sample-data/sample-syslog.log</code>.
            </span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} data-testid="button-upload-cancel">Cancel</Button>
          <Button
            onClick={() => uploadMutation.mutate()}
            disabled={uploadMutation.isPending || !content || !filename}
            data-testid="button-upload-submit"
          >
            {uploadMutation.isPending ? "Parsing…" : "Import Assets"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Asset row (expandable) ───────────────────────────────────────────────────

function AssetRow({
  asset, onEdit, onDelete,
}: {
  asset: QmiAsset; onEdit: () => void; onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const score = parseFloat(asset.qmiScore ?? "0");
  const { label, color, bg } = scoreLabel(score);
  const typeColor = TYPE_COLORS[asset.assetType ?? "other"] ?? TYPE_COLORS.other;

  return (
    <>
      <tr
        className="border-b border-border/30 hover:bg-muted/20 transition-colors cursor-pointer"
        onClick={() => setExpanded(e => !e)}
        data-testid={`row-asset-${asset.id}`}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            {expanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
            <span className="font-medium text-sm">{asset.name}</span>
          </div>
        </td>
        <td className="px-4 py-3">
          <Badge className={`text-xs border ${typeColor}`}>{asset.assetType}</Badge>
        </td>
        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{asset.algorithm ?? "—"}</td>
        <td className="px-4 py-3 text-xs text-muted-foreground">{asset.environment ?? "—"}</td>
        <td className="px-4 py-3 text-xs text-muted-foreground">{asset.owner ?? "—"}</td>
        <td className="px-4 py-3">
          <span className={`font-mono text-sm font-bold ${color}`}>{formatScore(asset.qmiScore)}</span>
          <Badge className={`ml-2 text-xs border ${bg} ${color}`}>{label}</Badge>
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
            <Button size="icon" variant="ghost" onClick={onEdit} className="h-7 w-7" data-testid={`btn-edit-${asset.id}`}>
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            <Button size="icon" variant="ghost" onClick={onDelete} className="h-7 w-7 text-rose-400 hover:text-rose-300" data-testid={`btn-delete-${asset.id}`}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-border/30 bg-muted/10">
          <td colSpan={7} className="px-4 pb-4 pt-1">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              <div><span className="text-muted-foreground">Source:</span> <span className="ml-1 font-mono">{asset.source}</span></div>
              <div><span className="text-muted-foreground">Source Ref:</span> <span className="ml-1 font-mono">{asset.sourceRef ?? "—"}</span></div>
              <div><span className="text-muted-foreground">Data Class:</span> <span className="ml-1">{asset.dataClass ?? "—"}</span></div>
              <div><span className="text-muted-foreground">Application:</span> <span className="ml-1">{asset.application ?? "—"}</span></div>
              <div><span className="text-muted-foreground">Vendor:</span> <span className="ml-1">{asset.vendor ?? "—"}</span></div>
              <div><span className="text-muted-foreground">C (Capacity):</span> <span className="ml-1 font-mono font-bold">{asset.migrationCapacity}</span></div>
              <div><span className="text-muted-foreground">T (Time):</span> <span className="ml-1 font-mono font-bold">{asset.timeRemaining}</span></div>
              <div><span className="text-muted-foreground">B (Burden):</span> <span className="ml-1 font-mono font-bold">{asset.migrationBurden}</span></div>
              <div><span className="text-muted-foreground">D (Depth):</span> <span className="ml-1 font-mono font-bold">{asset.dependencyDepth}</span></div>
              <div><span className="text-muted-foreground">F (Fragility):</span> <span className="ml-1 font-mono font-bold">{asset.fragility}</span></div>
              {asset.notes && <div className="col-span-4"><span className="text-muted-foreground">Notes:</span> <span className="ml-1">{asset.notes}</span></div>}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function QmiPage() {
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [editAsset, setEditAsset] = useState<QmiAsset | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");

  const { data: assets = [], isLoading } = useQuery<QmiAsset[]>({
    queryKey: ["/api/qmi/assets"],
  });

  const { data: uploads = [] } = useQuery<QmiUpload[]>({
    queryKey: ["/api/qmi/uploads"],
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/qmi/assets/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/qmi/assets"] });
      toast({ title: "Asset deleted" });
    },
    onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  // ── Derived stats ──────────────────────────────────────────────────────────
  const scores = assets.map(a => parseFloat(a.qmiScore ?? "0")).filter(s => !isNaN(s));
  const avgScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const highCount = assets.filter(a => parseFloat(a.qmiScore ?? "0") >= 2).length;
  const medCount  = assets.filter(a => { const s = parseFloat(a.qmiScore ?? "0"); return s >= 0.5 && s < 2; }).length;
  const lowCount  = assets.filter(a => parseFloat(a.qmiScore ?? "0") < 0.5).length;

  // ── T-factor trend — project QMI if T decreases by 1 for every asset ───────
  // Models one "time period" passing and shows whether the portfolio is
  // improving, holding, or declining under time pressure.
  const projectedScores = assets.map(a => {
    const C = a.migrationCapacity ?? 5;
    const T = Math.max((a.timeRemaining ?? 5) - 1, 1); // T drops by 1, floor at 1
    const B = a.migrationBurden ?? 5;
    const D = a.dependencyDepth ?? 3;
    const F = a.fragility ?? 3;
    return computeQmi(C, T, B, D, F);
  });
  const projectedAvg = projectedScores.length
    ? projectedScores.reduce((a, b) => a + b, 0) / projectedScores.length
    : 0;
  // Percentage change from current → projected (negative = declining under time pressure)
  const trendDeltaPct = avgScore > 0 ? ((projectedAvg - avgScore) / avgScore) * 100 : 0;
  // Count of assets at T ≤ 3 with QMI < 0.5 — these are the urgent cases
  const urgentCount = assets.filter(
    a => (a.timeRemaining ?? 5) <= 3 && parseFloat(a.qmiScore ?? "0") < 0.5
  ).length;
  const trendPositive = trendDeltaPct >= 0;
  const trendNeutral  = assets.length === 0;

  // ── Filtered list ──────────────────────────────────────────────────────────
  const filtered = assets.filter(a => {
    const matchSearch = !search || a.name.toLowerCase().includes(search.toLowerCase())
      || (a.algorithm ?? "").toLowerCase().includes(search.toLowerCase())
      || (a.application ?? "").toLowerCase().includes(search.toLowerCase());
    const matchType = filterType === "all" || a.assetType === filterType;
    return matchSearch && matchType;
  });

  return (
    <Layout>
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded bg-primary/20 flex items-center justify-center border border-primary/30">
              <Atom className="w-4 h-4 text-primary" />
            </div>
            <h1 className="font-display text-2xl font-bold">QMI</h1>
          </div>
          <p className="text-sm text-muted-foreground ml-11">
            Quantum Migration Index — track cryptographic asset migration readiness
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setUploadOpen(true)} data-testid="button-upload">
            <Upload className="w-4 h-4 mr-2" /> Import File
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)} data-testid="button-add-asset">
            <Plus className="w-4 h-4 mr-2" /> Add Asset
          </Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Total Assets */}
        <div className="bg-card/60 border border-border/40 rounded-xl p-4 flex items-center justify-between" data-testid="kpi-total-assets">
          <div>
            <p className="text-xs text-muted-foreground font-mono uppercase">Total Assets</p>
            <p className="text-2xl font-bold font-mono mt-1 text-primary">{assets.length}</p>
          </div>
          <Atom className="w-6 h-6 text-primary opacity-40" />
        </div>

        {/* T-Factor Trend — projects QMI change if T decreases by 1 step */}
        <div
          className={`bg-card/60 border rounded-xl p-4 flex items-center justify-between ${
            trendNeutral
              ? "border-border/40"
              : trendPositive
              ? "border-emerald-500/30 bg-emerald-500/5"
              : "border-rose-500/30 bg-rose-500/5"
          }`}
          data-testid="kpi-t-factor-trend"
        >
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground font-mono uppercase">T-Factor Trend</p>
            {trendNeutral ? (
              <p className="text-2xl font-bold font-mono mt-1 text-muted-foreground">—</p>
            ) : (
              <>
                <p className={`text-2xl font-bold font-mono mt-1 ${trendPositive ? "text-emerald-400" : "text-rose-400"}`}>
                  {trendPositive ? "+" : ""}{trendDeltaPct.toFixed(1)}%
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {urgentCount > 0
                    ? `${urgentCount} urgent (low T + low QMI)`
                    : trendPositive
                    ? "Portfolio holding under time pressure"
                    : "Projected decline as T decreases"}
                </p>
              </>
            )}
          </div>
          {trendNeutral ? (
            <Minus className="w-6 h-6 text-muted-foreground opacity-40 shrink-0" />
          ) : trendPositive ? (
            <TrendingUp className="w-6 h-6 text-emerald-400 opacity-60 shrink-0" />
          ) : (
            <TrendingDown className="w-6 h-6 text-rose-400 opacity-60 shrink-0" />
          )}
        </div>

        {/* High Readiness */}
        <div className="bg-card/60 border border-border/40 rounded-xl p-4 flex items-center justify-between" data-testid="kpi-high-readiness">
          <div>
            <p className="text-xs text-muted-foreground font-mono uppercase">High Readiness (≥2)</p>
            <p className="text-2xl font-bold font-mono mt-1 text-emerald-400">{highCount}</p>
          </div>
          <TrendingUp className="w-6 h-6 text-emerald-400 opacity-40" />
        </div>

        {/* Low Readiness */}
        <div className="bg-card/60 border border-border/40 rounded-xl p-4 flex items-center justify-between" data-testid="kpi-low-readiness">
          <div>
            <p className="text-xs text-muted-foreground font-mono uppercase">Low Readiness (&lt;0.5)</p>
            <p className="text-2xl font-bold font-mono mt-1 text-rose-400">{lowCount}</p>
          </div>
          <TrendingDown className="w-6 h-6 text-rose-400 opacity-40" />
        </div>
      </div>

      {/* Score distribution bar */}
      {assets.length > 0 && (
        <div className="bg-card/60 border border-border/40 rounded-xl p-4">
          <p className="text-xs font-mono uppercase text-muted-foreground mb-3">Score Distribution</p>
          <div className="flex gap-2 items-center">
            <div className="flex-1 flex rounded-full overflow-hidden h-3">
              <div className="bg-emerald-500/70 transition-all" style={{ width: `${assets.length ? (highCount / assets.length) * 100 : 0}%` }} />
              <div className="bg-amber-500/70 transition-all" style={{ width: `${assets.length ? (medCount / assets.length) * 100 : 0}%` }} />
              <div className="bg-rose-500/70 transition-all" style={{ width: `${assets.length ? (lowCount / assets.length) * 100 : 0}%` }} />
            </div>
            <div className="flex gap-4 text-xs text-muted-foreground shrink-0">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500/70" />{highCount} High</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500/70" />{medCount} Med</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500/70" />{lowCount} Low</span>
            </div>
          </div>
        </div>
      )}

      <Tabs defaultValue="assets">
        <TabsList className="bg-muted/30">
          <TabsTrigger value="assets" data-testid="tab-assets">Assets ({assets.length})</TabsTrigger>
          <TabsTrigger value="uploads" data-testid="tab-uploads">Upload History ({uploads.length})</TabsTrigger>
          <TabsTrigger value="formula" data-testid="tab-formula">Formula</TabsTrigger>
        </TabsList>

        {/* ── Assets tab ── */}
        <TabsContent value="assets" className="space-y-4">
          {/* Search + filter */}
          <div className="flex gap-3">
            <Input
              placeholder="Search assets…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="max-w-xs"
              data-testid="input-search"
            />
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-40" data-testid="select-filter-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {QMI_ASSET_TYPES.map(t => (
                  <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/qmi/assets"] })} data-testid="button-refresh">
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>

          {isLoading ? (
            <div className="text-center py-16 text-muted-foreground text-sm">Loading assets…</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 space-y-3">
              <Atom className="w-10 h-10 mx-auto text-muted-foreground/30" />
              <p className="text-muted-foreground text-sm">
                {assets.length === 0
                  ? "No assets yet. Import a SBOM/syslog file or add one manually."
                  : "No assets match the current filter."}
              </p>
              {assets.length === 0 && (
                <div className="flex justify-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setUploadOpen(true)} data-testid="empty-import">
                    <Upload className="w-4 h-4 mr-2" /> Import File
                  </Button>
                  <Button size="sm" onClick={() => setAddOpen(true)} data-testid="empty-add">
                    <Plus className="w-4 h-4 mr-2" /> Add Manually
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-card/60 border border-border/40 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/40 bg-muted/20">
                    <th className="px-4 py-3 text-left font-mono text-xs uppercase text-muted-foreground">Asset</th>
                    <th className="px-4 py-3 text-left font-mono text-xs uppercase text-muted-foreground">Type</th>
                    <th className="px-4 py-3 text-left font-mono text-xs uppercase text-muted-foreground">Algorithm</th>
                    <th className="px-4 py-3 text-left font-mono text-xs uppercase text-muted-foreground">Env</th>
                    <th className="px-4 py-3 text-left font-mono text-xs uppercase text-muted-foreground">Owner</th>
                    <th className="px-4 py-3 text-left font-mono text-xs uppercase text-muted-foreground">QMI Score</th>
                    <th className="px-4 py-3 text-left font-mono text-xs uppercase text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(asset => (
                    <AssetRow
                      key={asset.id}
                      asset={asset}
                      onEdit={() => setEditAsset(asset)}
                      onDelete={() => {
                        if (confirm(`Delete "${asset.name}"?`)) deleteMutation.mutate(asset.id);
                      }}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* ── Upload history tab ── */}
        <TabsContent value="uploads" className="space-y-4">
          {uploads.length === 0 ? (
            <div className="text-center py-16 space-y-3">
              <Upload className="w-10 h-10 mx-auto text-muted-foreground/30" />
              <p className="text-muted-foreground text-sm">No files imported yet.</p>
              <Button variant="outline" size="sm" onClick={() => setUploadOpen(true)} data-testid="empty-upload">
                <Upload className="w-4 h-4 mr-2" /> Import File
              </Button>
            </div>
          ) : (
            <div className="bg-card/60 border border-border/40 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/40 bg-muted/20">
                    <th className="px-4 py-3 text-left font-mono text-xs uppercase text-muted-foreground">Filename</th>
                    <th className="px-4 py-3 text-left font-mono text-xs uppercase text-muted-foreground">Type</th>
                    <th className="px-4 py-3 text-left font-mono text-xs uppercase text-muted-foreground">Assets Found</th>
                    <th className="px-4 py-3 text-left font-mono text-xs uppercase text-muted-foreground">Imported</th>
                  </tr>
                </thead>
                <tbody>
                  {uploads.map(u => (
                    <tr key={u.id} className="border-b border-border/30 hover:bg-muted/20" data-testid={`row-upload-${u.id}`}>
                      <td className="px-4 py-3 font-mono text-xs">{u.filename}</td>
                      <td className="px-4 py-3">
                        <Badge className={u.uploadType === "sbom" ? "bg-blue-500/10 text-blue-400 border-blue-500/20 border" : "bg-amber-500/10 text-amber-400 border-amber-500/20 border"}>
                          {u.uploadType.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 font-mono text-sm font-bold text-primary">{u.assetsFound}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {u.createdAt ? new Date(u.createdAt).toLocaleString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* ── Formula reference tab ── */}
        <TabsContent value="formula">
          <div className="bg-card/60 border border-border/40 rounded-xl p-6 space-y-5 max-w-2xl">
            <div>
              <p className="font-mono text-xs uppercase text-muted-foreground mb-2">Formula</p>
              <div className="bg-muted/30 rounded-lg p-4 font-mono text-lg text-center border border-border/40">
                QMI = (C × T) / (B × D × F)
              </div>
            </div>
            <div className="space-y-3 text-sm">
              {[
                { var: "C", name: "Migration Capacity", range: "1–10", desc: "Team and tooling readiness to perform the migration. Higher = more capable." },
                { var: "T", name: "Time Remaining",      range: "1–10", desc: "Available time before the compliance or EOL deadline. Higher = more runway." },
                { var: "B", name: "Migration Burden",    range: "1–10", desc: "Effort, complexity, and coupling involved in the migration. Higher = harder." },
                { var: "D", name: "Dependency Depth",    range: "1–10", desc: "Number of systems or services that depend on this asset. Higher = more impact." },
                { var: "F", name: "Fragility",           range: "1–10", desc: "Likelihood of breakage or regression during migration. Higher = more risk." },
              ].map(({ var: v, name, range, desc }) => (
                <div key={v} className="flex gap-4 border-b border-border/30 pb-3">
                  <span className="font-mono font-bold text-primary w-6 shrink-0">{v}</span>
                  <div>
                    <span className="font-medium">{name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">({range})</span>
                    <p className="text-muted-foreground text-xs mt-0.5">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="space-y-2 text-sm">
              <p className="font-mono text-xs uppercase text-muted-foreground">Score interpretation</p>
              <div className="flex gap-3">
                <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 border">≥ 2.0 — High</Badge>
                <span className="text-muted-foreground text-xs self-center">Good migration readiness. Proceed with planning.</span>
              </div>
              <div className="flex gap-3">
                <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 border">0.5–2.0 — Medium</Badge>
                <span className="text-muted-foreground text-xs self-center">Moderate risk. Improve capacity or reduce burden.</span>
              </div>
              <div className="flex gap-3">
                <Badge className="bg-rose-500/10 text-rose-400 border-rose-500/20 border">&lt; 0.5 — Low</Badge>
                <span className="text-muted-foreground text-xs self-center">High risk. Prioritise — act before deadline.</span>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <AssetDialog open={addOpen} onClose={() => setAddOpen(false)} />
      <AssetDialog open={!!editAsset} onClose={() => setEditAsset(null)} initial={editAsset} />
      <UploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} />
    </Layout>
  );
}
