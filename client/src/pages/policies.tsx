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
} from "lucide-react";
import type { SecurityPolicy, CreateSecurityPolicyRequest } from "@shared/schema";
import { ASSET_CATEGORY_LABELS, DATA_CLASSIFICATION_LABELS, ASSET_CATEGORIES, DATA_CLASSIFICATIONS, POLICY_STATUSES } from "@shared/schema";

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
                      <Input
                        id="min-key-size"
                        type="number"
                        value={form.minimumKeySize ?? ""}
                        onChange={e => setForm({ ...form, minimumKeySize: e.target.value ? Number(e.target.value) : null })}
                        placeholder="e.g., 256"
                        data-testid="input-min-key-size"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="min-nist-level">Minimum NIST Quantum Level</Label>
                      <Select
                        value={form.minimumNistLevel?.toString() || "none"}
                        onValueChange={v => setForm({ ...form, minimumNistLevel: v === "none" ? null : Number(v) })}
                      >
                        <SelectTrigger id="min-nist-level" data-testid="select-min-nist-level">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Not Required</SelectItem>
                          <SelectItem value="1">Level 1</SelectItem>
                          <SelectItem value="2">Level 2</SelectItem>
                          <SelectItem value="3">Level 3</SelectItem>
                          <SelectItem value="4">Level 4</SelectItem>
                          <SelectItem value="5">Level 5</SelectItem>
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
