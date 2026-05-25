import { useState } from "react";
import Layout from "@/components/layout";
import { usePolicies, useCreatePolicy, useUpdatePolicy, useDeletePolicy, useMatchPolicies } from "@/hooks/use-policies";
import { useCbomComponents } from "@/hooks/use-cbom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Trash2,
  Edit3,
  Shield,
  ShieldCheck,
  ShieldX,
  ShieldAlert,
  Loader2,
  X,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileText,
  Scan,
  Laptop2,
  HardDrive,
  Mail,
  Wifi,
  ArrowLeftRight,
  Database,
  Cloud,
  Cpu,
  Archive,
  Usb,
  Lock,
  Tag,
  Settings2,
} from "lucide-react";
import type { SecurityPolicy, CreateSecurityPolicyRequest, PolicyAssetType } from "@shared/schema";
import { ASSET_CATEGORY_LABELS, DATA_CLASSIFICATION_LABELS, ASSET_CATEGORIES, DATA_CLASSIFICATIONS, POLICY_STATUSES, QMI_ASSET_TYPES, ASSET_CATEGORY_LABELS as ACL } from "@shared/schema";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Slider } from "@/components/ui/slider";

const ASSET_CATEGORY_ICONS: Record<string, any> = {
  mobile_devices: Laptop2,
  removable_media: Usb,
  servers_storage: HardDrive,
  email: Mail,
  wireless_networks: Wifi,
  data_in_transit: ArrowLeftRight,
  backup_media: Archive,
  databases: Database,
  cloud_services: Cloud,
  iot_devices: Cpu,
  custom: FileText,
};

const STATUS_CONFIG: Record<string, { color: string; bg: string }> = {
  active: { color: "text-emerald-500", bg: "bg-emerald-500/10" },
  draft: { color: "text-amber-500", bg: "bg-amber-500/10" },
  disabled: { color: "text-muted-foreground", bg: "bg-muted/30" },
};

const EMPTY_FORM: CreateSecurityPolicyRequest = {
  name: "",
  description: "",
  assetCategory: "servers_storage",
  dataClassification: "confidential",
  allowedAlgorithms: [],
  prohibitedAlgorithms: [],
  minimumKeySize: null,
  requiredProtocols: [],
  keyManagementPolicy: "",
  encryptionAtRest: false,
  encryptionInTransit: false,
  pqcRequired: false,
  minimumNistLevel: null,
  status: "draft",
  notes: "",
};

export default function PoliciesPage() {
  const { toast } = useToast();
  const { data: policies, isLoading: policiesLoading } = usePolicies();
  const { data: components } = useCbomComponents();
  const createMutation = useCreatePolicy();
  const updateMutation = useUpdatePolicy();
  const deleteMutation = useDeletePolicy();
  const matchMutation = useMatchPolicies();

  const [activeTab, setActiveTab] = useState("policies");
  const [showForm, setShowForm] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<SecurityPolicy | null>(null);
  const [form, setForm] = useState<CreateSecurityPolicyRequest>(EMPTY_FORM);
  const [matchResults, setMatchResults] = useState<any>(null);

  const [algorithmInput, setAlgorithmInput] = useState("");
  const [prohibitedInput, setProhibitedInput] = useState("");
  const [protocolInput, setProtocolInput] = useState("");

  const openCreateForm = () => {
    setEditingPolicy(null);
    setForm(EMPTY_FORM);
    setAlgorithmInput("");
    setProhibitedInput("");
    setProtocolInput("");
    setShowForm(true);
  };

  const openEditForm = (policy: SecurityPolicy) => {
    setEditingPolicy(policy);
    setForm({
      name: policy.name,
      description: policy.description || "",
      assetCategory: policy.assetCategory as any,
      dataClassification: policy.dataClassification as any,
      allowedAlgorithms: policy.allowedAlgorithms || [],
      prohibitedAlgorithms: policy.prohibitedAlgorithms || [],
      minimumKeySize: policy.minimumKeySize ?? null,
      requiredProtocols: policy.requiredProtocols || [],
      keyManagementPolicy: policy.keyManagementPolicy || "",
      encryptionAtRest: policy.encryptionAtRest ?? false,
      encryptionInTransit: policy.encryptionInTransit ?? false,
      pqcRequired: policy.pqcRequired ?? false,
      minimumNistLevel: policy.minimumNistLevel ?? null,
      status: policy.status as any,
      notes: policy.notes || "",
    });
    setAlgorithmInput("");
    setProhibitedInput("");
    setProtocolInput("");
    setShowForm(true);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast({ title: "Validation Error", description: "Policy name is required", variant: "destructive" });
      return;
    }

    try {
      if (editingPolicy) {
        await updateMutation.mutateAsync({ id: editingPolicy.id, data: form });
        toast({ title: "Policy updated", description: `${form.name} has been updated.` });
      } else {
        await createMutation.mutateAsync(form);
        toast({ title: "Policy created", description: `${form.name} has been created.` });
      }
      setShowForm(false);
      setEditingPolicy(null);
    } catch (err) {
      toast({ title: "Error", description: "Failed to save policy", variant: "destructive" });
    }
  };

  const handleDelete = async (policy: SecurityPolicy) => {
    if (confirm(`Delete policy "${policy.name}"?`)) {
      await deleteMutation.mutateAsync(policy.id);
      toast({ title: "Policy deleted", description: `${policy.name} has been removed.` });
    }
  };

  const handleMatch = async () => {
    try {
      const result = await matchMutation.mutateAsync();
      setMatchResults(result);
      setActiveTab("matching");
      toast({ title: "Matching complete", description: `${result.matched} component-policy matches found.` });
    } catch (err) {
      toast({ title: "Error", description: "Failed to run policy matching", variant: "destructive" });
    }
  };

  const addTag = (field: "allowedAlgorithms" | "prohibitedAlgorithms" | "requiredProtocols", value: string) => {
    if (!value.trim()) return;
    const current = form[field] || [];
    if (!current.includes(value.trim())) {
      setForm({ ...form, [field]: [...current, value.trim()] });
    }
  };

  const removeTag = (field: "allowedAlgorithms" | "prohibitedAlgorithms" | "requiredProtocols", value: string) => {
    const current = form[field] || [];
    setForm({ ...form, [field]: current.filter(v => v !== value) });
  };

  const activePolicies = policies?.filter(p => p.status === "active").length || 0;
  const draftPolicies = policies?.filter(p => p.status === "draft").length || 0;
  const totalPolicies = policies?.length || 0;

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-white mb-2">Security Policies</h1>
            <p className="text-muted-foreground font-mono text-sm">Cryptographic control policies based on IS-22 / ISO 27001 Annex A 8.24</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleMatch}
              disabled={matchMutation.isPending || !components?.length || !policies?.length}
              className="gap-2"
              data-testid="button-match-policies"
            >
              {matchMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Scan className="w-4 h-4" />}
              Match CBOM
            </Button>
            <Button onClick={openCreateForm} className="gap-2" data-testid="button-add-policy">
              <Plus className="w-4 h-4" />
              Add Policy
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-border/50">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-primary/10 text-primary">
                <Shield className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Policies</p>
                <p className="text-2xl font-bold font-mono" data-testid="text-total-policies">{totalPolicies}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-500">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Active Policies</p>
                <p className="text-2xl font-bold font-mono text-emerald-500" data-testid="text-active-policies">{activePolicies}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-amber-500/10 text-amber-500">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Draft Policies</p>
                <p className="text-2xl font-bold font-mono text-amber-500" data-testid="text-draft-policies">{draftPolicies}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="bg-card border border-border/50">
            <TabsTrigger value="policies" className="gap-2" data-testid="tab-policies">
              <Shield className="w-4 h-4" />
              Policies
            </TabsTrigger>
            <TabsTrigger value="asset-types" className="gap-2" data-testid="tab-asset-types">
              <Tag className="w-4 h-4" />
              Asset Types
            </TabsTrigger>
            <TabsTrigger value="matching" className="gap-2" data-testid="tab-matching">
              <Scan className="w-4 h-4" />
              CBOM Matching
              {matchResults && (
                <Badge variant="secondary" className="ml-1 text-[10px]">{matchResults.matched}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="policies">
            {policiesLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : !policies || policies.length === 0 ? (
              <Card className="border-border/50">
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Shield className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
                  <p className="text-lg font-medium mb-1">No policies configured</p>
                  <p className="text-sm">Create your first cryptographic control policy to get started.</p>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-border/50 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full" data-testid="table-policies">
                    <thead className="bg-muted/30 border-b border-border/50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-mono uppercase text-muted-foreground">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-mono uppercase text-muted-foreground">Policy Name</th>
                        <th className="px-4 py-3 text-left text-xs font-mono uppercase text-muted-foreground">Asset Category</th>
                        <th className="px-4 py-3 text-left text-xs font-mono uppercase text-muted-foreground">Classification</th>
                        <th className="px-4 py-3 text-left text-xs font-mono uppercase text-muted-foreground">Encryption</th>
                        <th className="px-4 py-3 text-left text-xs font-mono uppercase text-muted-foreground">PQC</th>
                        <th className="px-4 py-3 text-left text-xs font-mono uppercase text-muted-foreground">Min Key Size</th>
                        <th className="px-4 py-3 text-right text-xs font-mono uppercase text-muted-foreground">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {policies.map(policy => (
                        <PolicyRow
                          key={policy.id}
                          policy={policy}
                          onEdit={() => openEditForm(policy)}
                          onDelete={() => handleDelete(policy)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </TabsContent>

          <AssetTypesTab policies={policies || []} />

          <TabsContent value="matching">
            {!matchResults ? (
              <Card className="border-border/50">
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Scan className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
                  <p className="text-lg font-medium mb-1">No matching results yet</p>
                  <p className="text-sm mb-4">Click "Match CBOM" to compare your CBOM components against active policies.</p>
                  <Button onClick={handleMatch} disabled={matchMutation.isPending || !components?.length || !policies?.length} className="gap-2" data-testid="button-run-matching">
                    {matchMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Scan className="w-4 h-4" />}
                    Run Matching
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {/* Match summary */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card className="border-border/50">
                    <CardContent className="p-4 flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Scan className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold font-mono" data-testid="text-total-matches">{matchResults.matched}</p>
                        <p className="text-xs text-muted-foreground">Total Matches</p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="border-border/50">
                    <CardContent className="p-4 flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-emerald-500/10">
                        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold font-mono text-emerald-500" data-testid="text-compliant-matches">
                          {matchResults.results.filter((r: any) => r.compliant).length}
                        </p>
                        <p className="text-xs text-muted-foreground">Compliant</p>
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="border-border/50">
                    <CardContent className="p-4 flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-rose-500/10">
                        <XCircle className="w-5 h-5 text-rose-500" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold font-mono text-rose-500" data-testid="text-violation-matches">
                          {matchResults.results.filter((r: any) => !r.compliant).length}
                        </p>
                        <p className="text-xs text-muted-foreground">Violations</p>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Match results table */}
                <Card className="border-border/50 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full" data-testid="table-match-results">
                      <thead className="bg-muted/30 border-b border-border/50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-mono uppercase text-muted-foreground">Status</th>
                          <th className="px-4 py-3 text-left text-xs font-mono uppercase text-muted-foreground">Component</th>
                          <th className="px-4 py-3 text-left text-xs font-mono uppercase text-muted-foreground">Matched Policy</th>
                          <th className="px-4 py-3 text-left text-xs font-mono uppercase text-muted-foreground">Violations</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/30">
                        {matchResults.results.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                              No matching components found for active policies.
                            </td>
                          </tr>
                        ) : (
                          matchResults.results.map((result: any, idx: number) => (
                            <tr key={idx} className="hover:bg-muted/20 transition-colors" data-testid={`row-match-${idx}`}>
                              <td className="px-4 py-3">
                                {result.compliant ? (
                                  <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-500/10">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                    <span className="text-xs font-medium text-emerald-500">Compliant</span>
                                  </div>
                                ) : (
                                  <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-rose-500/10">
                                    <XCircle className="w-3.5 h-3.5 text-rose-500" />
                                    <span className="text-xs font-medium text-rose-500">Violation</span>
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3 font-medium text-sm">{result.componentName}</td>
                              <td className="px-4 py-3">
                                <Badge variant="outline" className="font-mono text-[10px]">{result.policyName}</Badge>
                              </td>
                              <td className="px-4 py-3 text-sm text-muted-foreground">
                                {result.violations.length > 0 ? (
                                  <div className="space-y-1">
                                    {result.violations.map((v: string, i: number) => (
                                      <div key={i} className="flex items-start gap-1.5">
                                        <AlertTriangle className="w-3.5 h-3.5 text-rose-500 mt-0.5 shrink-0" />
                                        <span className="text-xs">{v}</span>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-xs text-emerald-500">All checks passed</span>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Create/Edit Policy Dialog */}
        <AnimatePresence>
          {showForm && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
              onClick={() => setShowForm(false)}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-card border border-border rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold">{editingPolicy ? "Edit Policy" : "Create Policy"}</h3>
                  <Button variant="ghost" size="icon" onClick={() => setShowForm(false)}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>

                <div className="space-y-4">
                  {/* Basic Info */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="policy-name">Policy Name</Label>
                      <Input
                        id="policy-name"
                        value={form.name}
                        onChange={e => setForm({ ...form, name: e.target.value })}
                        placeholder="e.g., Server Encryption Policy"
                        data-testid="input-policy-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="policy-status">Status</Label>
                      <Select value={form.status} onValueChange={v => setForm({ ...form, status: v as any })}>
                        <SelectTrigger id="policy-status" data-testid="select-policy-status">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {POLICY_STATUSES.map(s => (
                            <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="policy-description">Description</Label>
                    <Textarea
                      id="policy-description"
                      value={form.description || ""}
                      onChange={e => setForm({ ...form, description: e.target.value })}
                      placeholder="Describe the purpose and scope of this policy..."
                      className="resize-none"
                      data-testid="input-policy-description"
                    />
                  </div>

                  {/* Asset Classification */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="asset-category">Asset Category</Label>
                      <Select value={form.assetCategory} onValueChange={v => setForm({ ...form, assetCategory: v as any })}>
                        <SelectTrigger id="asset-category" data-testid="select-asset-category">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ASSET_CATEGORIES.map(cat => (
                            <SelectItem key={cat} value={cat}>{ASSET_CATEGORY_LABELS[cat]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="data-classification">Data Classification</Label>
                      <Select value={form.dataClassification} onValueChange={v => setForm({ ...form, dataClassification: v as any })}>
                        <SelectTrigger id="data-classification" data-testid="select-data-classification">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DATA_CLASSIFICATIONS.map(cls => (
                            <SelectItem key={cls} value={cls}>{DATA_CLASSIFICATION_LABELS[cls]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Encryption Requirements */}
                  <div className="space-y-3">
                    <Label className="text-sm font-medium">Encryption Requirements</Label>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                          checked={form.encryptionAtRest}
                          onCheckedChange={(v) => setForm({ ...form, encryptionAtRest: !!v })}
                          data-testid="checkbox-encryption-at-rest"
                        />
                        <span className="text-sm">At Rest</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                          checked={form.encryptionInTransit}
                          onCheckedChange={(v) => setForm({ ...form, encryptionInTransit: !!v })}
                          data-testid="checkbox-encryption-in-transit"
                        />
                        <span className="text-sm">In Transit</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                          checked={form.pqcRequired}
                          onCheckedChange={(v) => setForm({ ...form, pqcRequired: !!v })}
                          data-testid="checkbox-pqc-required"
                        />
                        <span className="text-sm">PQC Required</span>
                      </label>
                    </div>
                  </div>

                  {/* Key Size & NIST Level */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="min-key-size">Minimum Key Size (bits)</Label>
                      <Select
                        value={form.minimumKeySize?.toString() || "none"}
                        onValueChange={v => setForm({ ...form, minimumKeySize: v === "none" ? null : Number(v) })}
                      >
                        <SelectTrigger id="min-key-size" data-testid="input-min-key-size">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Not Specified</SelectItem>
                          <SelectItem value="128">128-bit</SelectItem>
                          <SelectItem value="256">256-bit</SelectItem>
                          <SelectItem value="512">512-bit</SelectItem>
                          <SelectItem value="768">768-bit</SelectItem>
                          <SelectItem value="1024">1024-bit</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="min-nist-level">NIST FIPS Standard</Label>
                      <Select
                        value={form.minimumNistLevel?.toString() || "none"}
                        onValueChange={v => setForm({ ...form, minimumNistLevel: v === "none" ? null : Number(v) })}
                      >
                        <SelectTrigger id="min-nist-level" data-testid="select-min-nist-level">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Not Required</SelectItem>
                          <SelectItem value="203">FIPS 203</SelectItem>
                          <SelectItem value="204">FIPS 204</SelectItem>
                          <SelectItem value="205">FIPS 205</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Allowed Algorithms */}
                  <div className="space-y-2">
                    <Label>Allowed Algorithms</Label>
                    <div className="flex gap-2">
                      <Input
                        value={algorithmInput}
                        onChange={e => setAlgorithmInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addTag("allowedAlgorithms", algorithmInput);
                            setAlgorithmInput("");
                          }
                        }}
                        placeholder="Type and press Enter (e.g., AES-256, ML-KEM)"
                        data-testid="input-allowed-algorithms"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => { addTag("allowedAlgorithms", algorithmInput); setAlgorithmInput(""); }}
                        data-testid="button-add-allowed"
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {(form.allowedAlgorithms || []).map(alg => (
                        <Badge key={alg} variant="secondary" className="gap-1">
                          {alg}
                          <button onClick={() => removeTag("allowedAlgorithms", alg)} className="ml-0.5">
                            <X className="w-3 h-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* Prohibited Algorithms */}
                  <div className="space-y-2">
                    <Label>Prohibited Algorithms</Label>
                    <div className="flex gap-2">
                      <Input
                        value={prohibitedInput}
                        onChange={e => setProhibitedInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addTag("prohibitedAlgorithms", prohibitedInput);
                            setProhibitedInput("");
                          }
                        }}
                        placeholder="Type and press Enter (e.g., RSA, DES, WEP)"
                        data-testid="input-prohibited-algorithms"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => { addTag("prohibitedAlgorithms", prohibitedInput); setProhibitedInput(""); }}
                        data-testid="button-add-prohibited"
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {(form.prohibitedAlgorithms || []).map(alg => (
                        <Badge key={alg} variant="destructive" className="gap-1">
                          {alg}
                          <button onClick={() => removeTag("prohibitedAlgorithms", alg)} className="ml-0.5">
                            <X className="w-3 h-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* Required Protocols */}
                  <div className="space-y-2">
                    <Label>Required Protocols</Label>
                    <div className="flex gap-2">
                      <Input
                        value={protocolInput}
                        onChange={e => setProtocolInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addTag("requiredProtocols", protocolInput);
                            setProtocolInput("");
                          }
                        }}
                        placeholder="Type and press Enter (e.g., TLS 1.3, WPA3)"
                        data-testid="input-required-protocols"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => { addTag("requiredProtocols", protocolInput); setProtocolInput(""); }}
                        data-testid="button-add-protocol"
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {(form.requiredProtocols || []).map(proto => (
                        <Badge key={proto} variant="outline" className="gap-1">
                          {proto}
                          <button onClick={() => removeTag("requiredProtocols", proto)} className="ml-0.5">
                            <X className="w-3 h-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* Key Management Policy */}
                  <div className="space-y-2">
                    <Label htmlFor="key-management">Key Management Policy</Label>
                    <Textarea
                      id="key-management"
                      value={form.keyManagementPolicy || ""}
                      onChange={e => setForm({ ...form, keyManagementPolicy: e.target.value })}
                      placeholder="Describe key generation, storage, rotation, and destruction requirements..."
                      className="resize-none"
                      data-testid="input-key-management"
                    />
                  </div>

                  {/* Notes */}
                  <div className="space-y-2">
                    <Label htmlFor="policy-notes">Notes</Label>
                    <Textarea
                      id="policy-notes"
                      value={form.notes || ""}
                      onChange={e => setForm({ ...form, notes: e.target.value })}
                      placeholder="Additional notes or references..."
                      className="resize-none"
                      data-testid="input-policy-notes"
                    />
                  </div>
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-2 mt-6">
                  <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
                  <Button
                    onClick={handleSubmit}
                    disabled={createMutation.isPending || updateMutation.isPending}
                    data-testid="button-save-policy"
                  >
                    {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    {editingPolicy ? "Update Policy" : "Create Policy"}
                  </Button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Layout>
  );
}

// ─── Asset Types Tab ─────────────────────────────────────────────────────────

const BLANK_AT = {
  name: "",
  assetType: "other" as const,
  assetCategory: "custom" as const,
  domain: "",
  description: "",
  policyIds: [] as number[],
  defaultMigrationCapacity: 5,
  defaultTimeRemaining: 5,
  defaultMigrationBurden: 5,
  defaultDependencyDepth: 3,
  defaultFragility: 3,
  notes: "",
};

function AssetTypesTab({ policies }: { policies: SecurityPolicy[] }) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PolicyAssetType | null>(null);
  const [form, setForm] = useState({ ...BLANK_AT });

  const { data: assetTypes = [], isLoading } = useQuery<PolicyAssetType[]>({
    queryKey: ["/api/policy-asset-types"],
  });

  const setF = (k: string, v: any) => setForm(prev => ({ ...prev, [k]: v }));

  const createMut = useMutation({
    mutationFn: (data: typeof form) => apiRequest("POST", "/api/policy-asset-types", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/policy-asset-types"] });
      toast({ title: editing ? "Asset type updated" : "Asset type created" });
      setDialogOpen(false);
    },
    onError: async (err: any) => {
      const body = await err.response?.json?.().catch(() => null);
      toast({ title: "Error", description: body?.message || err.message, variant: "destructive" });
    },
  });

  const updateMut = useMutation({
    mutationFn: (data: typeof form) => apiRequest("PUT", `/api/policy-asset-types/${editing!.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/policy-asset-types"] });
      toast({ title: "Asset type updated" });
      setDialogOpen(false);
    },
    onError: async (err: any) => {
      const body = await err.response?.json?.().catch(() => null);
      toast({ title: "Error", description: body?.message || err.message, variant: "destructive" });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/policy-asset-types/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/policy-asset-types"] });
      toast({ title: "Asset type deleted" });
    },
  });

  function openCreate() {
    setEditing(null);
    setForm({ ...BLANK_AT });
    setDialogOpen(true);
  }

  function openEdit(at: PolicyAssetType) {
    setEditing(at);
    setForm({
      name: at.name,
      assetType: at.assetType as any,
      assetCategory: at.assetCategory as any,
      domain: at.domain || "",
      description: at.description || "",
      policyIds: at.policyIds || [],
      defaultMigrationCapacity: at.defaultMigrationCapacity,
      defaultTimeRemaining: at.defaultTimeRemaining,
      defaultMigrationBurden: at.defaultMigrationBurden,
      defaultDependencyDepth: at.defaultDependencyDepth,
      defaultFragility: at.defaultFragility,
      notes: at.notes || "",
    });
    setDialogOpen(true);
  }

  function handleSave() {
    if (!form.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    if (editing) {
      updateMut.mutate(form);
    } else {
      createMut.mutate(form);
    }
  }

  function togglePolicy(id: number) {
    const ids = form.policyIds.includes(id)
      ? form.policyIds.filter(x => x !== id)
      : [...form.policyIds, id];
    setF("policyIds", ids);
  }

  const isPending = createMut.isPending || updateMut.isPending;

  return (
    <TabsContent value="asset-types" className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Define named asset type templates with recommended QMI factor defaults. Templates are reusable across assets and respect Security Policy categories.
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2 shrink-0" data-testid="button-add-asset-type">
          <Plus className="w-4 h-4" /> Add Asset Type
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : assetTypes.length === 0 ? (
        <Card className="border-border/50">
          <CardContent className="py-12 text-center text-muted-foreground">
            <Tag className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
            <p className="text-lg font-medium mb-1">No asset types defined</p>
            <p className="text-sm mb-4">Create asset type templates with recommended QMI factor defaults to standardise your migration planning.</p>
            <Button onClick={openCreate} className="gap-2" data-testid="empty-add-asset-type">
              <Plus className="w-4 h-4" /> Add Asset Type
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full" data-testid="table-asset-types">
              <thead className="bg-muted/30 border-b border-border/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-mono uppercase text-muted-foreground">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-mono uppercase text-muted-foreground">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-mono uppercase text-muted-foreground">Category</th>
                  <th className="px-4 py-3 text-left text-xs font-mono uppercase text-muted-foreground">Domain</th>
                  <th className="px-4 py-3 text-left text-xs font-mono uppercase text-muted-foreground">Policies</th>
                  <th className="px-4 py-3 text-left text-xs font-mono uppercase text-muted-foreground">QMI Defaults (C/T/B/D/F)</th>
                  <th className="px-4 py-3 text-right text-xs font-mono uppercase text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {assetTypes.map(at => {
                  const linkedPolicies = (at.policyIds || []).map(id => policies.find(p => p.id === id)?.name).filter(Boolean);
                  return (
                    <tr key={at.id} className="hover:bg-muted/20 transition-colors" data-testid={`row-asset-type-${at.id}`}>
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-sm">{at.name}</p>
                          {at.description && <p className="text-xs text-muted-foreground max-w-xs truncate">{at.description}</p>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="font-mono text-[10px]">{at.assetType}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary" className="text-[10px]">
                          {ASSET_CATEGORY_LABELS[at.assetCategory as keyof typeof ASSET_CATEGORY_LABELS] || at.assetCategory}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground font-mono">
                        {at.domain || <span className="text-muted-foreground/40">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {linkedPolicies.length > 0
                            ? linkedPolicies.map((name, i) => <Badge key={i} variant="outline" className="text-[9px]">{name}</Badge>)
                            : <span className="text-xs text-muted-foreground/40">None</span>
                          }
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {at.defaultMigrationCapacity}/{at.defaultTimeRemaining}/{at.defaultMigrationBurden}/{at.defaultDependencyDepth}/{at.defaultFragility}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(at)} data-testid={`button-edit-at-${at.id}`}>
                            <Edit3 className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="text-rose-500" onClick={() => {
                            if (confirm(`Delete "${at.name}"?`)) deleteMut.mutate(at.id);
                          }} data-testid={`button-delete-at-${at.id}`}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={v => !v && setDialogOpen(false)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto border-primary/20 bg-card">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <Tag className="w-4 h-4 text-primary" />
              {editing ? "Edit Asset Type" : "Create Asset Type"}
            </DialogTitle>
            <DialogDescription>
              Define a named asset type with recommended QMI factor defaults. Use domain to distinguish between asset types with the same name in different contexts.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Uniqueness rule note */}
            <div className="flex gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
              <Settings2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              <span>The combination of <strong>Name + Asset Type + Domain</strong> must be unique. Use Domain to allow the same asset name to appear under multiple policies (e.g. domain "payments" vs "internal").</span>
            </div>

            {/* Identity */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1 col-span-2">
                <Label className="font-mono text-xs uppercase text-muted-foreground">Asset Type Name *</Label>
                <Input value={form.name} onChange={e => setF("name", e.target.value)} placeholder="e.g. Production TLS Certificate" data-testid="input-at-name" />
              </div>
              <div className="space-y-1">
                <Label className="font-mono text-xs uppercase text-muted-foreground">QMI Asset Type</Label>
                <Select value={form.assetType} onValueChange={v => setF("assetType", v)}>
                  <SelectTrigger data-testid="select-at-asset-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {QMI_ASSET_TYPES.map(t => (
                      <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="font-mono text-xs uppercase text-muted-foreground">Asset Category</Label>
                <Select value={form.assetCategory} onValueChange={v => setF("assetCategory", v)}>
                  <SelectTrigger data-testid="select-at-category"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ASSET_CATEGORIES.map(c => (
                      <SelectItem key={c} value={c}>{ASSET_CATEGORY_LABELS[c]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="font-mono text-xs uppercase text-muted-foreground">Domain <span className="text-muted-foreground/50 normal-case">(optional uniqueness key)</span></Label>
                <Input value={form.domain} onChange={e => setF("domain", e.target.value)} placeholder="e.g. payments, internal, external" data-testid="input-at-domain" />
              </div>
              <div className="space-y-1">
                <Label className="font-mono text-xs uppercase text-muted-foreground">Description</Label>
                <Input value={form.description} onChange={e => setF("description", e.target.value)} placeholder="Short description" data-testid="input-at-description" />
              </div>
            </div>

            {/* Policy associations */}
            {policies.length > 0 && (
              <div className="space-y-2">
                <Label className="font-mono text-xs uppercase text-muted-foreground">Associated Policies</Label>
                <p className="text-xs text-muted-foreground/70">Select all policies that govern this asset type. A policy can apply to multiple asset types.</p>
                <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto border border-border/40 rounded-lg p-3 bg-muted/20">
                  {policies.map(p => (
                    <label key={p.id} className="flex items-center gap-2 cursor-pointer text-sm" data-testid={`checkbox-policy-${p.id}`}>
                      <input
                        type="checkbox"
                        checked={form.policyIds.includes(p.id)}
                        onChange={() => togglePolicy(p.id)}
                        className="accent-primary"
                      />
                      <span className="truncate">{p.name}</span>
                      <Badge variant="outline" className="text-[9px] shrink-0">{p.assetCategory}</Badge>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* QMI defaults */}
            <div className="space-y-3">
              <Label className="font-mono text-xs uppercase text-muted-foreground">Recommended QMI Factor Defaults</Label>
              <p className="text-xs text-muted-foreground/70">These values will be pre-populated when a QMI asset is created using this template.</p>
              <div className="space-y-4 bg-muted/20 rounded-lg p-4 border border-border/30">
                {[
                  { key: "defaultMigrationCapacity", label: "C — Migration Capacity", hint: "Team/tooling readiness (higher = more capable)" },
                  { key: "defaultTimeRemaining",     label: "T — Time Remaining",      hint: "Available time before deadline (higher = more time)" },
                  { key: "defaultMigrationBurden",   label: "B — Migration Burden",    hint: "Effort and complexity (higher = harder)" },
                  { key: "defaultDependencyDepth",   label: "D — Dependency Depth",    hint: "Number of dependent systems (higher = more deps)" },
                  { key: "defaultFragility",         label: "F — Fragility",           hint: "Risk of breakage during migration (higher = more risk)" },
                ].map(({ key, label, hint }) => (
                  <div key={key} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label className="font-mono text-xs text-muted-foreground uppercase">{label}</Label>
                      <span className="font-mono text-xs font-bold text-primary">{(form as any)[key]}</span>
                    </div>
                    <Slider
                      min={1} max={10} step={1}
                      value={[(form as any)[key]]}
                      onValueChange={([v]) => setF(key, v)}
                      className="w-full"
                      data-testid={`slider-at-${key}`}
                    />
                    <p className="text-xs text-muted-foreground/60">{hint}</p>
                  </div>
                ))}
                {/* QMI preview */}
                <div className="mt-2 rounded-lg border border-border/30 bg-card/60 p-3 flex items-center justify-between">
                  <span className="font-mono text-xs text-muted-foreground">Estimated QMI</span>
                  <span className="font-mono text-sm font-bold text-primary">
                    {((form.defaultMigrationCapacity * form.defaultTimeRemaining) /
                      (form.defaultMigrationBurden * form.defaultDependencyDepth * form.defaultFragility)).toFixed(3)}
                  </span>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1">
              <Label className="font-mono text-xs uppercase text-muted-foreground">Notes</Label>
              <Textarea value={form.notes} onChange={e => setF("notes", e.target.value)} placeholder="Additional context for this asset type template…" rows={2} data-testid="input-at-notes" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={isPending || !form.name.trim()} data-testid="button-save-asset-type">
              {isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {editing ? "Save Changes" : "Create Asset Type"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TabsContent>
  );
}

function PolicyRow({ policy, onEdit, onDelete }: { policy: SecurityPolicy; onEdit: () => void; onDelete: () => void }) {
  const statusCfg = STATUS_CONFIG[policy.status] || STATUS_CONFIG.draft;
  const CategoryIcon = ASSET_CATEGORY_ICONS[policy.assetCategory] || FileText;

  return (
    <tr className="hover:bg-muted/20 transition-colors" data-testid={`row-policy-${policy.id}`}>
      <td className="px-4 py-3">
        <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full ${statusCfg.bg}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${policy.status === "active" ? "bg-emerald-500" : policy.status === "draft" ? "bg-amber-500" : "bg-muted-foreground"}`} />
          <span className={`text-xs font-medium ${statusCfg.color}`}>{policy.status}</span>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <CategoryIcon className="w-4 h-4 text-muted-foreground" />
          <div>
            <p className="font-medium text-sm">{policy.name}</p>
            {policy.description && (
              <p className="text-xs text-muted-foreground max-w-xs truncate">{policy.description}</p>
            )}
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <Badge variant="outline" className="font-mono text-[10px]">
          {ASSET_CATEGORY_LABELS[policy.assetCategory as keyof typeof ASSET_CATEGORY_LABELS] || policy.assetCategory}
        </Badge>
      </td>
      <td className="px-4 py-3">
        <Badge
          variant="secondary"
          className={`text-[10px] ${
            policy.dataClassification === "confidential" ? "text-rose-500" :
            policy.dataClassification === "internal" ? "text-amber-500" : "text-muted-foreground"
          }`}
        >
          {DATA_CLASSIFICATION_LABELS[policy.dataClassification as keyof typeof DATA_CLASSIFICATION_LABELS] || policy.dataClassification}
        </Badge>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          {policy.encryptionAtRest && <Badge variant="outline" className="text-[9px]">At Rest</Badge>}
          {policy.encryptionInTransit && <Badge variant="outline" className="text-[9px]">In Transit</Badge>}
          {!policy.encryptionAtRest && !policy.encryptionInTransit && <span className="text-xs text-muted-foreground">-</span>}
        </div>
      </td>
      <td className="px-4 py-3 text-center">
        {policy.pqcRequired ? (
          <Lock className="w-4 h-4 text-primary inline-block" />
        ) : (
          <span className="text-xs text-muted-foreground">-</span>
        )}
      </td>
      <td className="px-4 py-3 text-sm font-mono text-center">
        {policy.minimumKeySize ? `${policy.minimumKeySize}` : "-"}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="icon" onClick={onEdit} data-testid={`button-edit-policy-${policy.id}`}>
            <Edit3 className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="text-rose-500" onClick={onDelete} data-testid={`button-delete-policy-${policy.id}`}>
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </td>
    </tr>
  );
}
