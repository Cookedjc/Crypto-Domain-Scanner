import { useState } from "react";
import Layout from "@/components/layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow, format } from "date-fns";
import {
  useCryptoKeys, useGenerateKey, useActivateKey, useSuspendKey,
  useRevokeKey, useDestroyKey, useExportPublicKey, useKeyAuditLog,
  useAzureKvConnections, useCreateAzureKvConnection, useDeleteAzureKvConnection,
  useTestAzureKvConnection, useAzureKvKeys, useImportAzureKeyToCbom,
} from "@/hooks/use-key-manager";
import {
  KeyRound, Plus, Shield, ShieldCheck, ShieldAlert, ShieldX,
  RefreshCw, Trash2, Play, PauseCircle, XCircle, Loader2,
  ChevronDown, ChevronRight, Copy, Cloud, ClipboardList,
  Server, CheckCircle2, AlertTriangle, Link, Unlink, Download,
  FileJson, Activity, Eye, EyeOff,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

const KEY_ALGORITHM_GROUPS = [
  {
    label: "Post-Quantum (PQC)",
    algorithms: [
      { value: "ML-KEM-768", label: "ML-KEM-768 (NIST Level 3, Key Encapsulation)" },
      { value: "ML-KEM-1024", label: "ML-KEM-1024 (NIST Level 5, Key Encapsulation)" },
      { value: "ML-DSA-65", label: "ML-DSA-65 (NIST Level 3, Digital Signature)" },
      { value: "ML-DSA-87", label: "ML-DSA-87 (NIST Level 5, Digital Signature)" },
      { value: "SLH-DSA-SHA2-128s", label: "SLH-DSA-SHA2-128s (Hash-based Signature)" },
    ],
  },
  {
    label: "Classical Asymmetric",
    algorithms: [
      { value: "RSA-2048", label: "RSA-2048 (2048-bit)" },
      { value: "RSA-4096", label: "RSA-4096 (4096-bit)" },
      { value: "ECDH-P256", label: "ECDH P-256 (secp256r1)" },
      { value: "ECDH-P384", label: "ECDH P-384 (secp384r1)" },
      { value: "Ed25519", label: "Ed25519 (EdDSA)" },
    ],
  },
  {
    label: "Classical Symmetric",
    algorithms: [
      { value: "AES-256-GCM", label: "AES-256-GCM (256-bit)" },
      { value: "AES-128-GCM", label: "AES-128-GCM (128-bit)" },
    ],
  },
];

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  "pre-active":   { label: "Pre-Active",   color: "text-muted-foreground bg-muted border-border/50",          icon: PauseCircle },
  "active":       { label: "Active",       color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30", icon: CheckCircle2 },
  "suspended":    { label: "Suspended",    color: "text-amber-400 bg-amber-500/10 border-amber-500/30",       icon: PauseCircle },
  "deactivated":  { label: "Deactivated",  color: "text-blue-400 bg-blue-500/10 border-blue-500/30",          icon: XCircle },
  "compromised":  { label: "Compromised",  color: "text-rose-400 bg-rose-500/10 border-rose-500/30",          icon: ShieldX },
  "destroyed":    { label: "Destroyed",    color: "text-muted-foreground bg-muted/50 border-border/30",       icon: Trash2 },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG["pre-active"];
  const Icon = cfg.icon;
  return (
    <Badge variant="outline" className={`gap-1 text-xs font-mono ${cfg.color}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </Badge>
  );
}

function KeyRow({ k }: { k: any }) {
  const [expanded, setExpanded] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const { toast } = useToast();
  const activateMutation = useActivateKey();
  const suspendMutation = useSuspendKey();
  const revokeMutation = useRevokeKey();
  const destroyMutation = useDestroyKey();
  const exportMutation = useExportPublicKey();

  const isPqc = k.isPqc;
  const isDestroyed = k.status === "destroyed";
  const isActive = k.status === "active";
  const isPreActive = k.status === "pre-active";
  const isSuspended = k.status === "suspended";

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  };

  const handleLifecycle = async (action: string) => {
    const confirmMsg: Record<string, string> = {
      revoke: `Revoke key "${k.name}"? This cannot be undone.`,
      destroy: `Permanently destroy key "${k.name}" and delete all key material? This is irreversible.`,
    };
    if (confirmMsg[action] && !confirm(confirmMsg[action])) return;

    try {
      if (action === "activate") await activateMutation.mutateAsync(k.id);
      else if (action === "suspend") await suspendMutation.mutateAsync(k.id);
      else if (action === "revoke") await revokeMutation.mutateAsync(k.id);
      else if (action === "destroy") await destroyMutation.mutateAsync(k.id);
      toast({ title: "Key updated", description: `Key "${k.name}" has been ${action}d.` });
    } catch {
      toast({ title: "Error", description: `Failed to ${action} key.`, variant: "destructive" });
    }
  };

  const isPending = activateMutation.isPending || suspendMutation.isPending ||
    revokeMutation.isPending || destroyMutation.isPending;

  return (
    <>
      <tr
        className={`border-b border-border/30 hover:bg-muted/20 transition-colors ${isDestroyed ? "opacity-50" : ""}`}
        data-testid={`key-row-${k.id}`}
      >
        <td className="px-4 py-3">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-2 text-left hover:text-foreground transition-colors"
            data-testid={`button-expand-key-${k.id}`}
          >
            {expanded ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />}
            <span className="font-medium text-sm">{k.name}</span>
          </button>
        </td>
        <td className="px-4 py-3 text-xs font-mono text-muted-foreground">{k.algorithm}</td>
        <td className="px-4 py-3 text-xs text-muted-foreground capitalize">{k.purpose}</td>
        <td className="px-4 py-3"><StatusBadge status={k.status} /></td>
        <td className="px-4 py-3">
          {isPqc ? (
            <Badge variant="outline" className="text-xs text-emerald-400 bg-emerald-500/10 border-emerald-500/30 gap-1">
              <ShieldCheck className="w-3 h-3" />PQC
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs text-muted-foreground">Classical</Badge>
          )}
        </td>
        <td className="px-4 py-3 text-xs font-mono text-muted-foreground">
          {k.nistQuantumSecurityLevel != null ? `L${k.nistQuantumSecurityLevel}` : "—"}
        </td>
        <td className="px-4 py-3 text-xs text-muted-foreground">
          {k.keyLength ? `${k.keyLength}-bit` : "—"}
        </td>
        <td className="px-4 py-3 text-xs text-muted-foreground">
          {k.expiresAt ? format(new Date(k.expiresAt), "yyyy-MM-dd") : "Never"}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1">
            {isPreActive && (
              <Button size="sm" variant="outline" className="h-6 text-xs gap-1 text-emerald-400 border-emerald-500/30"
                onClick={() => handleLifecycle("activate")} disabled={isPending} data-testid={`button-activate-key-${k.id}`}>
                <Play className="w-3 h-3" />Activate
              </Button>
            )}
            {isActive && (
              <Button size="sm" variant="outline" className="h-6 text-xs gap-1 text-amber-400 border-amber-500/30"
                onClick={() => handleLifecycle("suspend")} disabled={isPending} data-testid={`button-suspend-key-${k.id}`}>
                <PauseCircle className="w-3 h-3" />Suspend
              </Button>
            )}
            {isSuspended && (
              <Button size="sm" variant="outline" className="h-6 text-xs gap-1 text-emerald-400 border-emerald-500/30"
                onClick={() => handleLifecycle("activate")} disabled={isPending} data-testid={`button-reactivate-key-${k.id}`}>
                <Play className="w-3 h-3" />Resume
              </Button>
            )}
            {!isDestroyed && k.status !== "compromised" && (
              <Button size="sm" variant="ghost" className="h-6 text-xs text-rose-500"
                onClick={() => handleLifecycle("revoke")} disabled={isPending} data-testid={`button-revoke-key-${k.id}`}>
                <XCircle className="w-3 h-3" />
              </Button>
            )}
            {!isDestroyed && (
              <Button size="sm" variant="ghost" className="h-6 text-xs text-muted-foreground"
                onClick={() => handleLifecycle("destroy")} disabled={isPending} data-testid={`button-destroy-key-${k.id}`}>
                <Trash2 className="w-3 h-3" />
              </Button>
            )}
            {isPending && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-muted/10 border-b border-border/20">
          <td colSpan={9} className="px-6 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="space-y-2">
                <p className="text-xs font-mono uppercase text-muted-foreground">Key Details</p>
                <div className="space-y-1 text-xs">
                  <p><span className="text-muted-foreground">Key ID:</span> <span className="font-mono">{k.id}</span></p>
                  <p><span className="text-muted-foreground">Type:</span> <span className="font-mono capitalize">{k.keyType}</span></p>
                  <p><span className="text-muted-foreground">Created:</span> {k.createdAt ? format(new Date(k.createdAt), "yyyy-MM-dd HH:mm:ss") : "—"}</p>
                  {k.activatedAt && <p><span className="text-muted-foreground">Activated:</span> {format(new Date(k.activatedAt), "yyyy-MM-dd HH:mm:ss")}</p>}
                  {k.revokedAt && <p><span className="text-muted-foreground">Revoked:</span> {format(new Date(k.revokedAt), "yyyy-MM-dd HH:mm:ss")}</p>}
                  {k.tags?.length > 0 && <p><span className="text-muted-foreground">Tags:</span> {k.tags.join(", ")}</p>}
                  {k.cbomFileId && <p><span className="text-muted-foreground">Linked CBOM:</span> <span className="font-mono text-primary">#{k.cbomFileId}</span></p>}
                </div>
              </div>
              {k.publicKey && !isDestroyed && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-mono uppercase text-muted-foreground">Public Key</p>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setShowKey(!showKey)}>
                        {showKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => handleCopy(k.publicKey)}
                        data-testid={`button-copy-pubkey-${k.id}`}>
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                  {showKey && (
                    <pre className="bg-muted/50 rounded p-2 text-[10px] font-mono overflow-auto max-h-32 whitespace-pre-wrap break-all border border-border/30">
                      {k.publicKey}
                    </pre>
                  )}
                  {!showKey && (
                    <div className="bg-muted/30 rounded p-2 text-xs text-muted-foreground font-mono border border-border/30">
                      {k.publicKey.length} characters — click eye to reveal
                    </div>
                  )}
                </div>
              )}
              {isDestroyed && (
                <div className="flex items-center gap-2 text-muted-foreground text-xs">
                  <ShieldX className="w-4 h-4" />
                  Key material has been permanently destroyed. No cryptographic operations possible.
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function GenerateKeyDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const generateMutation = useGenerateKey();
  const [name, setName] = useState("");
  const [algorithm, setAlgorithm] = useState("");
  const [purpose, setPurpose] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [tags, setTags] = useState("");

  const selectedAlgo = KEY_ALGORITHM_GROUPS.flatMap(g => g.algorithms).find(a => a.value === algorithm);
  const isPqc = algorithm.startsWith("ML-") || algorithm.startsWith("SLH-");
  const isSymmetric = algorithm.startsWith("AES-");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !algorithm || !purpose) return;
    try {
      await generateMutation.mutateAsync({
        name,
        algorithm,
        purpose,
        expiresAt: expiresAt || null,
        tags: tags.split(",").map(t => t.trim()).filter(Boolean),
      });
      toast({ title: "Key generated", description: `"${name}" has been generated in pre-active state.` });
      setName(""); setAlgorithm(""); setPurpose(""); setExpiresAt(""); setTags("");
      onClose();
    } catch {
      toast({ title: "Error", description: "Failed to generate key.", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[520px] border-primary/20 bg-card">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-primary" />
            Generate New Key
          </DialogTitle>
          <DialogDescription>
            Creates key material using Node.js crypto (classical) or @noble/post-quantum (PQC). Private key material is AES-256-GCM encrypted at rest.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Key Name</Label>
            <Input placeholder="e.g., prod-signing-key-2026" value={name}
              onChange={e => setName(e.target.value)} required data-testid="input-key-name" />
          </div>
          <div className="space-y-2">
            <Label>Algorithm</Label>
            <Select value={algorithm} onValueChange={setAlgorithm}>
              <SelectTrigger data-testid="select-key-algorithm">
                <SelectValue placeholder="Select algorithm…" />
              </SelectTrigger>
              <SelectContent>
                {KEY_ALGORITHM_GROUPS.map(group => (
                  <div key={group.label}>
                    <div className="px-2 py-1.5 text-xs font-mono uppercase text-muted-foreground">{group.label}</div>
                    {group.algorithms.map(a => (
                      <SelectItem key={a.value} value={a.value} data-testid={`option-algo-${a.value}`}>
                        {a.label}
                      </SelectItem>
                    ))}
                  </div>
                ))}
              </SelectContent>
            </Select>
            {isPqc && (
              <p className="text-xs text-emerald-400 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" />Post-quantum resistant — immune to Shor's algorithm
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Purpose</Label>
            <Select value={purpose} onValueChange={setPurpose}>
              <SelectTrigger data-testid="select-key-purpose">
                <SelectValue placeholder="Select purpose…" />
              </SelectTrigger>
              <SelectContent>
                {!isSymmetric && <SelectItem value="sign">Sign / Verify</SelectItem>}
                {!isSymmetric && <SelectItem value="encrypt">Encrypt / Decrypt</SelectItem>}
                {isSymmetric && <SelectItem value="encrypt">Encrypt / Decrypt (Symmetric)</SelectItem>}
                <SelectItem value="key-wrap">Key Wrapping</SelectItem>
                <SelectItem value="authenticate">Authentication</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Expiry Date <span className="text-muted-foreground">(optional)</span></Label>
            <Input type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} data-testid="input-key-expiry" />
          </div>
          <div className="space-y-2">
            <Label>Tags <span className="text-muted-foreground">(comma-separated, optional)</span></Label>
            <Input placeholder="e.g., production, tls, signing" value={tags}
              onChange={e => setTags(e.target.value)} data-testid="input-key-tags" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={!name || !algorithm || !purpose || generateMutation.isPending}
              className="gap-2" data-testid="button-generate-key-submit">
              {generateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
              Generate Key
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AzureKvTab() {
  const { toast } = useToast();
  const { data: connections, isLoading } = useAzureKvConnections();
  const createMutation = useCreateAzureKvConnection();
  const deleteMutation = useDeleteAzureKvConnection();
  const testMutation = useTestAzureKvConnection();
  const importMutation = useImportAzureKeyToCbom();

  const [showAdd, setShowAdd] = useState(false);
  const [selectedConn, setSelectedConn] = useState<number | null>(null);
  const { data: azureKeys, isLoading: keysLoading } = useAzureKvKeys(selectedConn);

  const [name, setName] = useState("");
  const [vaultUrl, setVaultUrl] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [clientId, setClientId] = useState("");
  const [subscriptionId, setSubscriptionId] = useState("");

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createMutation.mutateAsync({ name, vaultUrl, tenantId, clientId, subscriptionId });
      toast({ title: "Connection added", description: `${name} has been configured.` });
      setShowAdd(false); setName(""); setVaultUrl(""); setTenantId(""); setClientId(""); setSubscriptionId("");
    } catch {
      toast({ title: "Error", description: "Failed to add Azure KV connection.", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Azure Key Vault</h3>
          <p className="text-sm text-muted-foreground">Connect to Azure Key Vault via Azure CLI to list and import keys into CipherGuard's CBOM.</p>
        </div>
        <Button onClick={() => setShowAdd(true)} className="gap-2" data-testid="button-add-akv-connection">
          <Plus className="w-4 h-4" />Add Vault
        </Button>
      </div>

      {showAdd && (
        <Card className="border-primary/20">
          <CardContent className="p-4">
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Connection Name</Label>
                  <Input placeholder="e.g., Production Vault" value={name} onChange={e => setName(e.target.value)}
                    required data-testid="input-akv-name" />
                </div>
                <div className="space-y-2">
                  <Label>Vault URL</Label>
                  <Input placeholder="https://myvault.vault.azure.net" value={vaultUrl}
                    onChange={e => setVaultUrl(e.target.value)} required data-testid="input-akv-url" />
                </div>
                <div className="space-y-2">
                  <Label>Tenant ID <span className="text-muted-foreground">(optional)</span></Label>
                  <Input placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" value={tenantId}
                    onChange={e => setTenantId(e.target.value)} data-testid="input-akv-tenant" />
                </div>
                <div className="space-y-2">
                  <Label>Client ID <span className="text-muted-foreground">(optional)</span></Label>
                  <Input placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" value={clientId}
                    onChange={e => setClientId(e.target.value)} data-testid="input-akv-client" />
                </div>
                <div className="space-y-2">
                  <Label>Subscription ID <span className="text-muted-foreground">(optional)</span></Label>
                  <Input placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" value={subscriptionId}
                    onChange={e => setSubscriptionId(e.target.value)} data-testid="input-akv-subscription" />
                </div>
              </div>
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-xs text-amber-400">
                Azure CLI (<code>az</code>) must be installed and authenticated on the server. Run <code>az login</code> before using vault operations.
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
                <Button type="submit" disabled={createMutation.isPending} className="gap-2" data-testid="button-save-akv-connection">
                  {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Cloud className="w-4 h-4" />}
                  Save Connection
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : !connections?.length ? (
        <Card className="border-border/50 border-dashed">
          <CardContent className="p-8 text-center">
            <Cloud className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-lg font-medium mb-1">No Azure Key Vaults configured</p>
            <p className="text-sm text-muted-foreground">Add a vault connection to browse and import keys into CipherGuard.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {connections.map(conn => {
            const statusColor = conn.status === "connected"
              ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30"
              : conn.status === "error"
              ? "text-rose-400 bg-rose-500/10 border-rose-500/30"
              : "text-muted-foreground bg-muted border-border/50";
            return (
              <Card key={conn.id} className="border-border/50" data-testid={`akv-conn-card-${conn.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`p-2 rounded-lg ${conn.status === "connected" ? "bg-emerald-500/10" : "bg-muted/30"}`}>
                        <Cloud className={`w-5 h-5 ${conn.status === "connected" ? "text-emerald-400" : "text-muted-foreground"}`} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium">{conn.name}</p>
                        <p className="text-xs text-muted-foreground font-mono truncate">{conn.vaultUrl}</p>
                        {conn.lastTestAt && (
                          <p className="text-xs text-muted-foreground">
                            Tested {formatDistanceToNow(new Date(conn.lastTestAt), { addSuffix: true })}
                          </p>
                        )}
                        {conn.lastError && <p className="text-xs text-rose-400 mt-1">{conn.lastError}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={`text-xs ${statusColor}`}>
                        {conn.status === "connected" ? "Connected" : conn.status === "error" ? "Error" : "Unchecked"}
                      </Badge>
                      <Button size="sm" variant="outline" className="gap-1 text-xs"
                        onClick={async () => {
                          try {
                            await testMutation.mutateAsync(conn.id);
                            toast({ title: "Connection tested", description: "Vault is reachable." });
                          } catch (err: any) {
                            toast({ title: "Test failed", description: err.message || "Could not reach vault.", variant: "destructive" });
                          }
                        }}
                        disabled={testMutation.isPending}
                        data-testid={`button-test-akv-${conn.id}`}
                      >
                        {testMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Activity className="w-3 h-3" />}
                        Test
                      </Button>
                      <Button size="sm" variant="outline" className="gap-1 text-xs"
                        onClick={() => setSelectedConn(selectedConn === conn.id ? null : conn.id)}
                        data-testid={`button-browse-akv-${conn.id}`}
                      >
                        {selectedConn === conn.id ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        Browse Keys
                      </Button>
                      <Button size="sm" variant="ghost" className="text-rose-500"
                        onClick={async () => {
                          if (!confirm(`Delete connection "${conn.name}"?`)) return;
                          await deleteMutation.mutateAsync(conn.id);
                          if (selectedConn === conn.id) setSelectedConn(null);
                        }}
                        data-testid={`button-delete-akv-${conn.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  {selectedConn === conn.id && (
                    <div className="mt-4 border-t border-border/30 pt-4">
                      {keysLoading ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Fetching keys via Azure CLI…
                        </div>
                      ) : !azureKeys?.length ? (
                        <p className="text-sm text-muted-foreground py-2">No keys found in this vault, or vault is unreachable.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm" data-testid="table-azure-keys">
                            <thead>
                              <tr className="border-b border-border/30">
                                <th className="text-left px-2 py-2 text-xs font-mono uppercase text-muted-foreground">Key Name</th>
                                <th className="text-left px-2 py-2 text-xs font-mono uppercase text-muted-foreground">Type</th>
                                <th className="text-left px-2 py-2 text-xs font-mono uppercase text-muted-foreground">Enabled</th>
                                <th className="text-left px-2 py-2 text-xs font-mono uppercase text-muted-foreground">Expires</th>
                                <th className="px-2 py-2"></th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border/20">
                              {azureKeys.map((k: any, i: number) => (
                                <tr key={i} data-testid={`azure-key-row-${i}`}>
                                  <td className="px-2 py-2 font-mono text-xs">{k.name}</td>
                                  <td className="px-2 py-2 text-xs text-muted-foreground">{k.keyType || "—"}</td>
                                  <td className="px-2 py-2">
                                    <Badge variant="outline" className={`text-xs ${k.enabled ? "text-emerald-400 border-emerald-500/30" : "text-muted-foreground"}`}>
                                      {k.enabled ? "Yes" : "No"}
                                    </Badge>
                                  </td>
                                  <td className="px-2 py-2 text-xs text-muted-foreground">
                                    {k.expires ? format(new Date(k.expires * 1000), "yyyy-MM-dd") : "Never"}
                                  </td>
                                  <td className="px-2 py-2">
                                    <Button size="sm" variant="outline" className="gap-1 text-xs h-6"
                                      onClick={async () => {
                                        try {
                                          await importMutation.mutateAsync({ connectionId: conn.id, keyName: k.name });
                                          toast({ title: "Imported to CBOM", description: `${k.name} has been added to the audit log and is ready for CBOM export.` });
                                        } catch {
                                          toast({ title: "Import failed", variant: "destructive" });
                                        }
                                      }}
                                      disabled={importMutation.isPending}
                                      data-testid={`button-import-azure-key-${i}`}
                                    >
                                      <FileJson className="w-3 h-3" />Import
                                    </Button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AuditLogTab() {
  const { data: auditLog, isLoading } = useKeyAuditLog();
  const [search, setSearch] = useState("");

  const filtered = auditLog?.filter(e =>
    !search ||
    e.keyName?.toLowerCase().includes(search.toLowerCase()) ||
    e.action?.toLowerCase().includes(search.toLowerCase()) ||
    e.performedByEmail?.toLowerCase().includes(search.toLowerCase())
  ) || [];

  const actionColor: Record<string, string> = {
    generated: "text-blue-400",
    activated: "text-emerald-400",
    suspended: "text-amber-400",
    revoked: "text-rose-400",
    destroyed: "text-rose-600",
    "azure-imported": "text-purple-400",
    exported: "text-cyan-400",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Input placeholder="Search log…" value={search} onChange={e => setSearch(e.target.value)}
            className="pl-3 bg-card border-border/50" data-testid="input-audit-search" />
        </div>
        <Badge variant="secondary" className="font-mono">{filtered.length} entries</Badge>
      </div>

      <Card className="border-border/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full" data-testid="table-audit-log">
            <thead className="bg-muted/30 border-b border-border/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-mono uppercase text-muted-foreground">Timestamp</th>
                <th className="px-4 py-3 text-left text-xs font-mono uppercase text-muted-foreground">Action</th>
                <th className="px-4 py-3 text-left text-xs font-mono uppercase text-muted-foreground">Key</th>
                <th className="px-4 py-3 text-left text-xs font-mono uppercase text-muted-foreground">Performed By</th>
                <th className="px-4 py-3 text-left text-xs font-mono uppercase text-muted-foreground">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {isLoading ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  <Loader2 className="w-6 h-6 mx-auto animate-spin mb-2" />Loading audit log…
                </td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  {auditLog?.length === 0 ? "No audit entries yet. Key operations will appear here." : "No matching entries."}
                </td></tr>
              ) : filtered.map(entry => (
                <tr key={entry.id} className="hover:bg-muted/10" data-testid={`audit-row-${entry.id}`}>
                  <td className="px-4 py-2 text-xs font-mono text-muted-foreground whitespace-nowrap">
                    {entry.createdAt ? format(new Date(entry.createdAt), "yyyy-MM-dd HH:mm:ss") : "—"}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`text-xs font-mono font-semibold uppercase ${actionColor[entry.action] || "text-foreground"}`}>
                      {entry.action}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs font-medium">{entry.keyName || `#${entry.keyId}`}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground font-mono">{entry.performedByEmail || "system"}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground max-w-xs truncate">
                    {entry.details ? JSON.stringify(entry.details) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

export default function KeyManagerPage() {
  const { user } = useAuth();
  const { data: keys, isLoading } = useCryptoKeys();
  const [showGenerate, setShowGenerate] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [pqcFilter, setPqcFilter] = useState<boolean | null>(null);
  const [search, setSearch] = useState("");

  const stats = {
    total: keys?.length || 0,
    active: keys?.filter(k => k.status === "active").length || 0,
    pqc: keys?.filter(k => k.isPqc).length || 0,
    compromised: keys?.filter(k => k.status === "compromised").length || 0,
    expiringSoon: keys?.filter(k => {
      if (!k.expiresAt) return false;
      const diff = new Date(k.expiresAt).getTime() - Date.now();
      return diff > 0 && diff < 30 * 24 * 60 * 60 * 1000;
    }).length || 0,
  };

  const filtered = keys?.filter(k => {
    if (statusFilter && k.status !== statusFilter) return false;
    if (pqcFilter !== null && k.isPqc !== pqcFilter) return false;
    if (search && !k.name?.toLowerCase().includes(search.toLowerCase()) &&
        !k.algorithm?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }) || [];

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-white mb-2">Key Manager</h1>
            <p className="text-muted-foreground font-mono text-sm">
              KMIP-style key lifecycle management with PQC support and Azure Key Vault integration
            </p>
          </div>
          <Button onClick={() => setShowGenerate(true)} className="gap-2" data-testid="button-generate-key">
            <Plus className="w-4 h-4" />Generate Key
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "Total Keys", value: stats.total, color: "text-foreground", bg: "bg-primary/10", icon: KeyRound },
            { label: "Active", value: stats.active, color: "text-emerald-400", bg: "bg-emerald-500/10", icon: CheckCircle2 },
            { label: "PQC Ready", value: stats.pqc, color: "text-blue-400", bg: "bg-blue-500/10", icon: ShieldCheck },
            { label: "Compromised", value: stats.compromised, color: "text-rose-400", bg: "bg-rose-500/10", icon: ShieldX },
            { label: "Expiring <30d", value: stats.expiringSoon, color: "text-amber-400", bg: "bg-amber-500/10", icon: AlertTriangle },
          ].map(s => (
            <Card key={s.label} className="border-border/50">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`p-2 rounded-lg ${s.bg}`}>
                  <s.icon className={`w-4 h-4 ${s.color}`} />
                </div>
                <div>
                  <p className={`text-xl font-bold font-mono ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Tabs */}
        <Tabs defaultValue="native" className="space-y-4">
          <TabsList className="bg-card border border-border/50">
            <TabsTrigger value="native" className="gap-2" data-testid="tab-native-keys">
              <KeyRound className="w-4 h-4" />Native Keys
            </TabsTrigger>
            <TabsTrigger value="azure" className="gap-2" data-testid="tab-azure-kv">
              <Cloud className="w-4 h-4" />Azure Key Vault
            </TabsTrigger>
            <TabsTrigger value="audit" className="gap-2" data-testid="tab-audit-log">
              <ClipboardList className="w-4 h-4" />Audit Log
            </TabsTrigger>
          </TabsList>

          {/* Native Keys Tab */}
          <TabsContent value="native" className="space-y-4">
            {/* Filters */}
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Input placeholder="Search keys…" value={search} onChange={e => setSearch(e.target.value)}
                    className="bg-card border-border/50" data-testid="input-search-keys" />
                </div>
                {(statusFilter || pqcFilter !== null || search) && (
                  <Button variant="ghost" size="sm" onClick={() => { setStatusFilter(null); setPqcFilter(null); setSearch(""); }}
                    className="gap-1 text-muted-foreground" data-testid="button-clear-key-filters">
                    Clear filters
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground font-mono uppercase">Status</span>
                {[null, "pre-active", "active", "suspended", "deactivated", "compromised"].map(s => (
                  <Button key={s ?? "all"} size="sm" variant={statusFilter === s ? "default" : "outline"}
                    onClick={() => setStatusFilter(s)} className="h-7 text-xs"
                    data-testid={`button-filter-status-${s ?? "all"}`}>
                    {s ?? "All"}
                  </Button>
                ))}
                <span className="text-xs text-muted-foreground font-mono uppercase ml-2">Type</span>
                <Button size="sm" variant={pqcFilter === null ? "default" : "outline"}
                  onClick={() => setPqcFilter(null)} className="h-7 text-xs" data-testid="button-filter-type-all">All</Button>
                <Button size="sm" variant={pqcFilter === true ? "default" : "outline"}
                  onClick={() => setPqcFilter(true)} className="h-7 text-xs" data-testid="button-filter-pqc">
                  <ShieldCheck className="w-3 h-3 mr-1" />PQC
                </Button>
                <Button size="sm" variant={pqcFilter === false ? "default" : "outline"}
                  onClick={() => setPqcFilter(false)} className="h-7 text-xs" data-testid="button-filter-classical">Classical</Button>
              </div>
            </div>

            <Card className="border-border/50 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full" data-testid="table-keys">
                  <thead className="bg-muted/30 border-b border-border/50">
                    <tr>
                      {["Name", "Algorithm", "Purpose", "Status", "PQC", "NIST Level", "Key Length", "Expires", "Actions"].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-mono uppercase text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                        <Loader2 className="w-6 h-6 mx-auto animate-spin mb-2" />Loading keys…
                      </td></tr>
                    ) : filtered.length === 0 ? (
                      <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                        {keys?.length === 0
                          ? "No keys yet. Click \"Generate Key\" to create your first cryptographic key."
                          : "No keys match the current filters."}
                      </td></tr>
                    ) : filtered.map(k => <KeyRow key={k.id} k={k} />)}
                  </tbody>
                </table>
              </div>
            </Card>

            {filtered.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Showing {filtered.length} of {keys?.length} keys
              </p>
            )}
          </TabsContent>

          <TabsContent value="azure">
            <AzureKvTab />
          </TabsContent>

          <TabsContent value="audit">
            <AuditLogTab />
          </TabsContent>
        </Tabs>
      </div>

      <GenerateKeyDialog open={showGenerate} onClose={() => setShowGenerate(false)} />
    </Layout>
  );
}
