import { useState, useCallback, useMemo } from "react";
import Layout from "@/components/layout";
import { useCbomFiles, useCbomComponents, useUploadCbom, useDeleteCbomFile, useDeduplicateCbom, useOutputDirectories, useCreateOutputDirectory, useUpdateOutputDirectory, useDeleteOutputDirectory, useScanDirectories, useImportDirectoryFile } from "@/hooks/use-cbom";
import { useMatchPolicies } from "@/hooks/use-policies";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import {
  Upload,
  FileJson,
  Trash2,
  Search,
  Filter,
  ArrowUpDown,
  Loader2,
  ChevronDown,
  ChevronUp,
  X,
  FileStack,
  Layers,
  Copy,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Info,
  Lock,
  Unlock,
  Shield,
  Scan,
  FolderOpen,
  FolderPlus,
  FolderSync,
  Plus,
  Power,
  PowerOff,
  Download,
  FileType,
  Clock,
  HardDrive,
  Eye,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { CbomComponent, OutputDirectory } from "@shared/schema";

const SORTABLE_FIELDS = [
  { key: "name", label: "Name" },
  { key: "componentType", label: "Type" },
  { key: "primitiveType", label: "Primitive" },
  { key: "oid", label: "OID" },
  { key: "version", label: "Version" },
  { key: "algorithmMode", label: "Mode" },
  { key: "padding", label: "Padding" },
  { key: "curve", label: "Curve" },
  { key: "nistQuantumSecurityLevel", label: "NIST QSL" },
];

const DEDUP_FIELDS = [
  { key: "name", label: "Name" },
  { key: "componentType", label: "Type" },
  { key: "version", label: "Version" },
  { key: "oid", label: "OID" },
  { key: "primitiveType", label: "Primitive" },
  { key: "algorithmMode", label: "Mode" },
];

// Quantum-safe algorithm families based on CBOMkit's quantum-safe compliance policy
const QUANTUM_SAFE_ALGORITHMS = [
  // Lattice-based (NIST PQC standardized)
  "ML-KEM", "KYBER", "ML-DSA", "DILITHIUM", "CRYSTALS-KYBER", "CRYSTALS-DILITHIUM",
  // Hash-based signatures
  "SPHINCS+", "SPHINCS", "LMS", "XMSS", "HSS",
  // Code-based
  "MCELIECE", "CLASSIC MCELIECE",
  // Isogeny-based (though SIKE was broken, SIDH variants may still be considered)
  "SIDH",
  // Hybrid approaches
  "X25519MLKEM768", "X25519KYBER768",
  // NIST Level 5 algorithms
  "FALCON", "BIKE", "HQC",
];

const VULNERABLE_ALGORITHMS = [
  // RSA (vulnerable to Shor's algorithm)
  "RSA", "RSA-OAEP", "RSA-PSS", "RSA-PKCS1",
  // ECC (vulnerable to Shor's algorithm)
  "ECDSA", "ECDH", "EC", "ECIES", "ED25519", "ED448", "X25519", "X448",
  "SECP256K1", "SECP384R1", "SECP521R1", "PRIME256V1", "CURVE25519", "CURVE448",
  "BRAINPOOL", "NIST P-256", "NIST P-384", "NIST P-521",
  // DSA/DH (vulnerable to Shor's algorithm)
  "DSA", "DH", "DIFFIE-HELLMAN", "ELGAMAL",
];

const CLASSICAL_SECURE_ALGORITHMS = [
  // Symmetric algorithms (quantum-resistant with sufficient key size)
  "AES", "AES-128", "AES-192", "AES-256", "AES-GCM", "AES-CCM", "AES-CTR", "AES-CBC",
  "CHACHA20", "CHACHA20-POLY1305", "SALSA20",
  "3DES", "TRIPLE-DES", "TWOFISH", "SERPENT", "CAMELLIA",
  // Hash functions (quantum-resistant with sufficient output size)
  "SHA-256", "SHA-384", "SHA-512", "SHA3-256", "SHA3-384", "SHA3-512",
  "BLAKE2", "BLAKE2B", "BLAKE2S", "BLAKE3",
  // MACs
  "HMAC", "HMAC-SHA256", "HMAC-SHA512", "POLY1305", "GMAC",
];

interface ComplianceResult {
  status: "quantum-safe" | "classical-only" | "vulnerable" | "unknown";
  reason: string;
  recommendation?: string;
}

function analyzeQuantumSafety(component: CbomComponent): ComplianceResult {
  const name = (component.name || "").toUpperCase();
  const primitive = (component.primitiveType || "").toUpperCase();
  const mode = (component.algorithmMode || "").toUpperCase();
  const oid = component.oid || "";
  const nistLevel = component.nistQuantumSecurityLevel;
  
  // Check NIST quantum security level first
  if (nistLevel !== null && nistLevel !== undefined) {
    if (nistLevel >= 5) {
      return {
        status: "quantum-safe",
        reason: `NIST Quantum Security Level ${nistLevel} (highest security)`,
      };
    } else if (nistLevel >= 3) {
      return {
        status: "quantum-safe",
        reason: `NIST Quantum Security Level ${nistLevel}`,
      };
    } else if (nistLevel >= 1) {
      return {
        status: "classical-only",
        reason: `NIST Quantum Security Level ${nistLevel} - limited quantum resistance`,
        recommendation: "Consider upgrading to NIST Level 3+ algorithms",
      };
    }
  }

  // Check for known quantum-safe algorithms
  for (const alg of QUANTUM_SAFE_ALGORITHMS) {
    if (name.includes(alg) || primitive.includes(alg)) {
      return {
        status: "quantum-safe",
        reason: `${alg} is a post-quantum cryptographic algorithm`,
      };
    }
  }

  // Check for vulnerable algorithms
  for (const alg of VULNERABLE_ALGORITHMS) {
    if (name.includes(alg) || primitive.includes(alg)) {
      return {
        status: "vulnerable",
        reason: `${alg} is vulnerable to quantum attacks (Shor's algorithm)`,
        recommendation: "Replace with post-quantum alternatives (ML-KEM, ML-DSA, etc.)",
      };
    }
  }

  // Check for classical-secure but not quantum-safe
  for (const alg of CLASSICAL_SECURE_ALGORITHMS) {
    if (name.includes(alg) || primitive.includes(alg) || mode.includes(alg.replace("-", ""))) {
      // Check key size for AES
      if (name.includes("AES") || primitive.includes("AES")) {
        if (name.includes("256") || name.includes("192")) {
          return {
            status: "classical-only",
            reason: "AES with 256/192-bit keys provides some quantum resistance via Grover's algorithm mitigation",
            recommendation: "Sufficient for symmetric encryption, but use PQC for key exchange",
          };
        } else if (name.includes("128")) {
          return {
            status: "classical-only",
            reason: "AES-128 has reduced security against quantum computers (Grover's algorithm)",
            recommendation: "Consider AES-256 for better quantum resistance",
          };
        }
      }
      return {
        status: "classical-only",
        reason: `${alg} is classically secure but not specifically designed for post-quantum security`,
      };
    }
  }

  // Check component type for additional context
  if (component.componentType === "library" || component.componentType === "framework") {
    return {
      status: "unknown",
      reason: "Library/framework - quantum safety depends on specific algorithms used",
    };
  }

  return {
    status: "unknown",
    reason: "Unable to determine quantum safety status",
    recommendation: "Review algorithm specifications manually",
  };
}

export default function CbomPage() {
  const { toast } = useToast();
  const { data: files, isLoading: filesLoading } = useCbomFiles();
  const { data: components, isLoading: componentsLoading } = useCbomComponents();
  const uploadMutation = useUploadCbom();
  const deleteMutation = useDeleteCbomFile();
  const dedupMutation = useDeduplicateCbom();
  const matchMutation = useMatchPolicies();

  const { data: outputDirs, isLoading: dirsLoading } = useOutputDirectories();
  const createDirMutation = useCreateOutputDirectory();
  const updateDirMutation = useUpdateOutputDirectory();
  const deleteDirMutation = useDeleteOutputDirectory();
  const scanMutation = useScanDirectories();
  const importFileMutation = useImportDirectoryFile();

  const [activeTab, setActiveTab] = useState("components");
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<string>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [isDragging, setIsDragging] = useState(false);
  const [showDedupDialog, setShowDedupDialog] = useState(false);
  const [dedupFields, setDedupFields] = useState<string[]>(["name", "componentType"]);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [complianceFilter, setComplianceFilter] = useState<string | null>(null);
  const [policyMatchResults, setPolicyMatchResults] = useState<any>(null);
  const [showAddDir, setShowAddDir] = useState(false);
  const [newDirLabel, setNewDirLabel] = useState("");
  const [newDirPath, setNewDirPath] = useState("");
  const [scanResults, setScanResults] = useState<any>(null);

  const policyViolationsByComponent = useMemo(() => {
    if (!policyMatchResults?.results) return new Map<number, any[]>();
    const map = new Map<number, any[]>();
    for (const result of policyMatchResults.results) {
      const existing = map.get(result.componentId) || [];
      existing.push(result);
      map.set(result.componentId, existing);
    }
    return map;
  }, [policyMatchResults]);

  const handlePolicyMatch = async () => {
    try {
      const result = await matchMutation.mutateAsync();
      setPolicyMatchResults(result);
      toast({ title: "Policy matching complete", description: `${result.matched} component-policy matches found.` });
    } catch {
      toast({ title: "Error", description: "Failed to run policy matching", variant: "destructive" });
    }
  };

  // Calculate compliance results for all components
  const complianceResults = useMemo(() => {
    if (!components) return new Map<number, ComplianceResult>();
    const results = new Map<number, ComplianceResult>();
    for (const comp of components) {
      results.set(comp.id, analyzeQuantumSafety(comp));
    }
    return results;
  }, [components]);

  // Compliance summary stats
  const complianceStats = useMemo(() => {
    const stats = {
      quantumSafe: 0,
      classicalOnly: 0,
      vulnerable: 0,
      unknown: 0,
      total: components?.length || 0,
    };
    complianceResults.forEach((result) => {
      switch (result.status) {
        case "quantum-safe": stats.quantumSafe++; break;
        case "classical-only": stats.classicalOnly++; break;
        case "vulnerable": stats.vulnerable++; break;
        default: stats.unknown++; break;
      }
    });
    return stats;
  }, [complianceResults, components]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const droppedFiles = Array.from(e.dataTransfer.files);
    for (const file of droppedFiles) {
      if (file.type === "application/json" || file.name.endsWith(".json")) {
        const text = await file.text();
        try {
          const parsed = JSON.parse(text);
          await uploadMutation.mutateAsync({ filename: file.name, data: parsed });
          toast({
            title: "File uploaded",
            description: `${file.name} has been processed successfully.`,
          });
        } catch (err) {
          toast({
            title: "Upload failed",
            description: `Failed to process ${file.name}`,
            variant: "destructive",
          });
        }
      }
    }
  }, [uploadMutation, toast]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles) return;

    for (const file of Array.from(selectedFiles)) {
      const text = await file.text();
      try {
        const parsed = JSON.parse(text);
        await uploadMutation.mutateAsync({ filename: file.name, data: parsed });
        toast({
          title: "File uploaded",
          description: `${file.name} has been processed successfully.`,
        });
      } catch (err) {
        toast({
          title: "Upload failed",
          description: `Failed to process ${file.name}`,
          variant: "destructive",
        });
      }
    }
    e.target.value = "";
  }, [uploadMutation, toast]);

  const handleDeleteFile = async (id: number, filename: string) => {
    if (confirm(`Delete ${filename} and all its components?`)) {
      await deleteMutation.mutateAsync(id);
      toast({
        title: "File deleted",
        description: `${filename} has been removed.`,
      });
    }
  };

  const handleDeduplicate = async () => {
    if (dedupFields.length === 0) {
      toast({
        title: "Select fields",
        description: "Please select at least one field for deduplication.",
        variant: "destructive",
      });
      return;
    }
    const result = await dedupMutation.mutateAsync(dedupFields);
    toast({
      title: "Deduplication complete",
      description: `Removed ${result.removed} duplicates. ${result.remaining} components remaining.`,
    });
    setShowDedupDialog(false);
  };

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const toggleDedupField = (field: string) => {
    setDedupFields(prev => 
      prev.includes(field) 
        ? prev.filter(f => f !== field)
        : [...prev, field]
    );
  };

  // Filter and sort components
  const componentTypes = Array.from(new Set(components?.map(c => c.componentType).filter(Boolean)));
  
  let filteredComponents = components?.filter(c => {
    const matchesSearch = !search || 
      c.name?.toLowerCase().includes(search.toLowerCase()) ||
      c.componentType?.toLowerCase().includes(search.toLowerCase()) ||
      c.oid?.toLowerCase().includes(search.toLowerCase());
    const matchesType = !typeFilter || c.componentType === typeFilter;
    const compliance = complianceResults.get(c.id);
    const matchesCompliance = !complianceFilter || compliance?.status === complianceFilter;
    return matchesSearch && matchesType && matchesCompliance;
  }) || [];

  filteredComponents = [...filteredComponents].sort((a, b) => {
    const aVal = (a as any)[sortField] || "";
    const bVal = (b as any)[sortField] || "";
    const cmp = String(aVal).localeCompare(String(bVal));
    return sortDir === "asc" ? cmp : -cmp;
  });

  const isLoading = filesLoading || componentsLoading;

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold text-white mb-2">CBOM Manager</h1>
            <p className="text-muted-foreground font-mono text-sm">Upload and analyze CycloneDX Cryptographic Bill of Materials</p>
          </div>
          <div className="flex items-center gap-2">
            {components && components.length > 0 && (
              <Button
                variant="outline"
                onClick={() => setShowDedupDialog(true)}
                className="gap-2"
                data-testid="button-deduplicate"
              >
                <Copy className="w-4 h-4" />
                Deduplicate
              </Button>
            )}
            <label>
              <input
                type="file"
                accept=".json,application/json"
                multiple
                onChange={handleFileSelect}
                className="hidden"
                data-testid="input-file-upload"
              />
              <Button asChild className="gap-2 cursor-pointer" data-testid="button-upload-file">
                <span>
                  <Upload className="w-4 h-4" />
                  Upload CBOM
                </span>
              </Button>
            </label>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-border/50">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-primary/10 text-primary">
                <FileStack className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Loaded Files</p>
                <p className="text-2xl font-bold font-mono">{files?.length || 0}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-blue-500/10 text-blue-500">
                <Layers className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Components</p>
                <p className="text-2xl font-bold font-mono">{components?.length || 0}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-500">
                <Filter className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Unique Types</p>
                <p className="text-2xl font-bold font-mono">{componentTypes.length}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Drop Zone */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`
            border-2 border-dashed rounded-xl p-8 text-center transition-all
            ${isDragging 
              ? "border-primary bg-primary/5" 
              : "border-border/50 hover:border-border"
            }
          `}
          data-testid="dropzone-cbom"
        >
          <FileJson className={`w-12 h-12 mx-auto mb-4 ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
          <p className="text-lg font-medium mb-1">
            {isDragging ? "Drop files here" : "Drag & Drop CycloneDX JSON files"}
          </p>
          <p className="text-sm text-muted-foreground">or click Upload CBOM to select files</p>
        </div>

        {/* Loaded Files */}
        {files && files.length > 0 && (
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="text-sm font-mono text-muted-foreground uppercase tracking-wider">Loaded Files</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {files.map(file => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
                    data-testid={`file-row-${file.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <FileJson className="w-5 h-5 text-primary" />
                      <div>
                        <p className="font-medium">{file.filename}</p>
                        <p className="text-xs text-muted-foreground">
                          {file.componentCount} components | {file.metadata?.specVersion || "Unknown spec"} | 
                          {file.uploadedAt && ` uploaded ${formatDistanceToNow(new Date(file.uploadedAt), { addSuffix: true })}`}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
                      onClick={() => handleDeleteFile(file.id, file.filename)}
                      data-testid={`button-delete-file-${file.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tabs for Components and Compliance */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="bg-card border border-border/50">
            <TabsTrigger value="components" className="gap-2" data-testid="tab-components">
              <Layers className="w-4 h-4" />
              Components
            </TabsTrigger>
            <TabsTrigger value="compliance" className="gap-2" data-testid="tab-compliance">
              <ShieldCheck className="w-4 h-4" />
              Quantum-Safe Compliance
            </TabsTrigger>
            <TabsTrigger value="directories" className="gap-2" data-testid="tab-directories">
              <FolderOpen className="w-4 h-4" />
              Output Directories
            </TabsTrigger>
          </TabsList>

          <TabsContent value="components">
            {/* Filters & Search */}
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search components..."
                  className="pl-9 bg-card border-border/50"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  data-testid="input-search-components"
                />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {typeFilter && (
                  <Badge variant="secondary" className="gap-1" data-testid="badge-active-filter">
                    {typeFilter}
                    <button onClick={() => setTypeFilter(null)} className="ml-1" data-testid="button-clear-filter">
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                )}
                {componentTypes.map(type => (
                  <Button
                    key={type}
                    variant={typeFilter === type ? "default" : "outline"}
                    size="sm"
                    onClick={() => setTypeFilter(typeFilter === type ? null : type!)}
                    data-testid={`button-filter-${type}`}
                  >
                    {type}
                  </Button>
                ))}
              </div>
            </div>

            {/* Components Table */}
            <Card className="border-border/50 overflow-hidden mt-4">
              <div className="overflow-x-auto">
                <table className="w-full" data-testid="table-components">
                  <thead className="bg-muted/30 border-b border-border/50">
                    <tr>
                      {SORTABLE_FIELDS.map(field => (
                        <th
                          key={field.key}
                          className="px-4 py-3 text-left text-xs font-mono uppercase text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                          onClick={() => toggleSort(field.key)}
                          data-testid={`th-sort-${field.key}`}
                        >
                          <div className="flex items-center gap-1">
                            {field.label}
                            {sortField === field.key && (
                              sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                            )}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {isLoading ? (
                      <tr>
                        <td colSpan={SORTABLE_FIELDS.length} className="px-4 py-8 text-center text-muted-foreground">
                          <Loader2 className="w-6 h-6 mx-auto animate-spin mb-2" />
                          Loading components...
                        </td>
                      </tr>
                    ) : filteredComponents.length === 0 ? (
                      <tr>
                        <td colSpan={SORTABLE_FIELDS.length} className="px-4 py-8 text-center text-muted-foreground">
                          {components?.length === 0 ? "No components loaded. Upload a CBOM file to get started." : "No matching components found."}
                        </td>
                      </tr>
                    ) : (
                      filteredComponents.map((comp) => (
                        <ComponentRow key={comp.id} component={comp} />
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="compliance">
            {/* Compliance Summary */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <Card 
                className={`border-border/50 cursor-pointer transition-all ${complianceFilter === "quantum-safe" ? "ring-2 ring-emerald-500" : ""}`}
                onClick={() => setComplianceFilter(complianceFilter === "quantum-safe" ? null : "quantum-safe")}
                data-testid="card-compliance-safe"
              >
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-500/10">
                    <ShieldCheck className="w-5 h-5 text-emerald-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold font-mono text-emerald-500">{complianceStats.quantumSafe}</p>
                    <p className="text-xs text-muted-foreground">Quantum-Safe</p>
                  </div>
                </CardContent>
              </Card>
              <Card 
                className={`border-border/50 cursor-pointer transition-all ${complianceFilter === "classical-only" ? "ring-2 ring-amber-500" : ""}`}
                onClick={() => setComplianceFilter(complianceFilter === "classical-only" ? null : "classical-only")}
                data-testid="card-compliance-classical"
              >
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-500/10">
                    <ShieldAlert className="w-5 h-5 text-amber-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold font-mono text-amber-500">{complianceStats.classicalOnly}</p>
                    <p className="text-xs text-muted-foreground">Classical Only</p>
                  </div>
                </CardContent>
              </Card>
              <Card 
                className={`border-border/50 cursor-pointer transition-all ${complianceFilter === "vulnerable" ? "ring-2 ring-rose-500" : ""}`}
                onClick={() => setComplianceFilter(complianceFilter === "vulnerable" ? null : "vulnerable")}
                data-testid="card-compliance-vulnerable"
              >
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-rose-500/10">
                    <ShieldX className="w-5 h-5 text-rose-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold font-mono text-rose-500">{complianceStats.vulnerable}</p>
                    <p className="text-xs text-muted-foreground">Vulnerable</p>
                  </div>
                </CardContent>
              </Card>
              <Card 
                className={`border-border/50 cursor-pointer transition-all ${complianceFilter === "unknown" ? "ring-2 ring-muted-foreground" : ""}`}
                onClick={() => setComplianceFilter(complianceFilter === "unknown" ? null : "unknown")}
                data-testid="card-compliance-unknown"
              >
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-muted/30">
                    <Info className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold font-mono">{complianceStats.unknown}</p>
                    <p className="text-xs text-muted-foreground">Unknown</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Compliance Legend */}
            <Card className="border-border/50 mb-6">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Lock className="w-4 h-4" />
                      Quantum-Safe Compliance Check
                    </CardTitle>
                    <CardDescription>
                      Based on CBOMkit's quantum-safe policy, analyzing cryptographic components for post-quantum readiness
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    onClick={handlePolicyMatch}
                    disabled={matchMutation.isPending || !components?.length}
                    className="gap-2 shrink-0"
                    data-testid="button-check-policies"
                  >
                    {matchMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Scan className="w-4 h-4" />}
                    Check Policies
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5" />
                    <div>
                      <p className="font-medium text-emerald-500">Quantum-Safe</p>
                      <p className="text-xs text-muted-foreground">Post-quantum algorithms (ML-KEM, ML-DSA, SPHINCS+, etc.)</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5" />
                    <div>
                      <p className="font-medium text-amber-500">Classical Only</p>
                      <p className="text-xs text-muted-foreground">Symmetric algorithms with limited quantum resistance</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <XCircle className="w-4 h-4 text-rose-500 mt-0.5" />
                    <div>
                      <p className="font-medium text-rose-500">Vulnerable</p>
                      <p className="text-xs text-muted-foreground">RSA, ECC, DSA - broken by Shor's algorithm</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Info className="w-4 h-4 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="font-medium">Unknown</p>
                      <p className="text-xs text-muted-foreground">Unable to determine status automatically</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Compliance filter badge */}
            {complianceFilter && (
              <div className="mb-4">
                <Badge variant="secondary" className="gap-1">
                  Filtering: {complianceFilter}
                  <button onClick={() => setComplianceFilter(null)} className="ml-1">
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              </div>
            )}

            {/* Compliance Results Table */}
            <Card className="border-border/50 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full" data-testid="table-compliance">
                  <thead className="bg-muted/30 border-b border-border/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-mono uppercase text-muted-foreground">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-mono uppercase text-muted-foreground">Component</th>
                      <th className="px-4 py-3 text-left text-xs font-mono uppercase text-muted-foreground">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-mono uppercase text-muted-foreground">Analysis</th>
                      <th className="px-4 py-3 text-left text-xs font-mono uppercase text-muted-foreground">Policy</th>
                      <th className="px-4 py-3 text-left text-xs font-mono uppercase text-muted-foreground">Recommendation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {isLoading ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                          <Loader2 className="w-6 h-6 mx-auto animate-spin mb-2" />
                          Analyzing components...
                        </td>
                      </tr>
                    ) : filteredComponents.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                          {components?.length === 0 ? "No components loaded. Upload a CBOM file to analyze." : "No matching components found."}
                        </td>
                      </tr>
                    ) : (
                      filteredComponents.map((comp) => {
                        const result = complianceResults.get(comp.id);
                        const policyMatches = policyViolationsByComponent.get(comp.id);
                        return (
                          <ComplianceRow key={comp.id} component={comp} result={result} policyMatches={policyMatches} />
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="directories">
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">Monitored Directories</h2>
                  <p className="text-sm text-muted-foreground">Configure filesystem paths to monitor for new CBOM files</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    onClick={async () => {
                      try {
                        const result = await scanMutation.mutateAsync();
                        setScanResults(result);
                        toast({ title: "Scan complete", description: `Found ${result.totalFiles} files across ${result.directories.length} directories.` });
                      } catch {
                        toast({ title: "Scan failed", description: "Failed to scan directories", variant: "destructive" });
                      }
                    }}
                    disabled={scanMutation.isPending || !outputDirs?.some(d => d.enabled)}
                    className="gap-2"
                    data-testid="button-scan-directories"
                  >
                    {scanMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderSync className="w-4 h-4" />}
                    Scan Directories
                  </Button>
                  <Button
                    onClick={() => setShowAddDir(true)}
                    className="gap-2"
                    data-testid="button-add-directory"
                  >
                    <FolderPlus className="w-4 h-4" />
                    Add Directory
                  </Button>
                </div>
              </div>

              {showAddDir && (
                <Card className="border-border/50">
                  <CardContent className="p-4 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="dir-label">Label</Label>
                        <Input
                          id="dir-label"
                          placeholder="e.g., Scanner Output"
                          value={newDirLabel}
                          onChange={(e) => setNewDirLabel(e.target.value)}
                          data-testid="input-dir-label"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="dir-path">Directory Path</Label>
                        <Input
                          id="dir-path"
                          placeholder="e.g., /tmp/scanner-output"
                          value={newDirPath}
                          onChange={(e) => setNewDirPath(e.target.value)}
                          data-testid="input-dir-path"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => { setShowAddDir(false); setNewDirLabel(""); setNewDirPath(""); }}>
                        Cancel
                      </Button>
                      <Button
                        onClick={async () => {
                          if (!newDirLabel.trim() || !newDirPath.trim()) {
                            toast({ title: "Missing fields", description: "Both label and path are required.", variant: "destructive" });
                            return;
                          }
                          try {
                            await createDirMutation.mutateAsync({ label: newDirLabel.trim(), path: newDirPath.trim() });
                            toast({ title: "Directory added", description: `${newDirLabel} has been added.` });
                            setShowAddDir(false);
                            setNewDirLabel("");
                            setNewDirPath("");
                          } catch {
                            toast({ title: "Error", description: "Failed to add directory", variant: "destructive" });
                          }
                        }}
                        disabled={createDirMutation.isPending}
                        data-testid="button-save-directory"
                      >
                        {createDirMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        Save Directory
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {dirsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : !outputDirs?.length ? (
                <Card className="border-border/50 border-dashed">
                  <CardContent className="p-8 text-center">
                    <FolderOpen className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-lg font-medium mb-1">No directories configured</p>
                    <p className="text-sm text-muted-foreground">Add a directory path to start monitoring for new CBOM files</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {outputDirs.map(dir => (
                    <Card key={dir.id} className="border-border/50" data-testid={`dir-card-${dir.id}`}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between gap-4 flex-wrap">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`p-2 rounded-lg ${dir.enabled ? "bg-emerald-500/10" : "bg-muted/30"}`}>
                              <FolderOpen className={`w-5 h-5 ${dir.enabled ? "text-emerald-500" : "text-muted-foreground"}`} />
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium truncate">{dir.label}</p>
                              <p className="text-xs text-muted-foreground font-mono truncate">{dir.path}</p>
                              {dir.lastScannedAt && (
                                <p className="text-xs text-muted-foreground">
                                  <Clock className="w-3 h-3 inline mr-1" />
                                  Last scanned {formatDistanceToNow(new Date(dir.lastScannedAt), { addSuffix: true })}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={dir.enabled}
                                onCheckedChange={async (checked) => {
                                  await updateDirMutation.mutateAsync({ id: dir.id, enabled: checked });
                                }}
                                data-testid={`switch-dir-${dir.id}`}
                              />
                              <span className="text-xs text-muted-foreground">{dir.enabled ? "Enabled" : "Disabled"}</span>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-rose-500"
                              onClick={async () => {
                                if (confirm(`Delete directory "${dir.label}"?`)) {
                                  await deleteDirMutation.mutateAsync(dir.id);
                                  toast({ title: "Deleted", description: `${dir.label} has been removed.` });
                                }
                              }}
                              data-testid={`button-delete-dir-${dir.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {scanResults && scanResults.directories && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="text-lg font-semibold">Scan Results</h3>
                    <Badge variant="secondary" className="font-mono">
                      {scanResults.totalFiles} files found
                    </Badge>
                  </div>
                  {scanResults.directories.map((dirResult: any) => (
                    <Card key={dirResult.directoryId} className="border-border/50" data-testid={`scan-result-${dirResult.directoryId}`}>
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <HardDrive className="w-4 h-4" />
                            {dirResult.directoryLabel}
                          </CardTitle>
                          <span className="text-xs text-muted-foreground font-mono">{dirResult.directoryPath}</span>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {dirResult.files.length === 0 ? (
                          <p className="text-sm text-muted-foreground py-2">No files found in this directory</p>
                        ) : (
                          <div className="space-y-2">
                            {dirResult.files.map((file: any, idx: number) => (
                              <div
                                key={idx}
                                className="flex items-center justify-between gap-3 p-3 bg-muted/30 rounded-lg"
                                data-testid={`scan-file-${idx}`}
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <FileJson className={`w-5 h-5 shrink-0 ${file.isJson ? "text-primary" : "text-muted-foreground"}`} />
                                  <div className="min-w-0">
                                    <p className="font-medium text-sm truncate">{file.filename}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {(file.size / 1024).toFixed(1)} KB | Modified {formatDistanceToNow(new Date(file.modifiedAt), { addSuffix: true })}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  {file.isJson && (
                                    <>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        disabled
                                        className="gap-1"
                                        data-testid={`button-format-${idx}`}
                                      >
                                        <FileType className="w-3 h-3" />
                                        Format to CycloneDX
                                      </Button>
                                      <Button
                                        size="sm"
                                        onClick={async () => {
                                          try {
                                            const result = await importFileMutation.mutateAsync({ fullPath: file.fullPath, filename: file.filename });
                                            toast({ title: "Imported", description: `${file.filename}: ${result.componentsAdded} components added.` });
                                          } catch {
                                            toast({ title: "Import failed", description: `Failed to import ${file.filename}`, variant: "destructive" });
                                          }
                                        }}
                                        disabled={importFileMutation.isPending}
                                        className="gap-1"
                                        data-testid={`button-import-${idx}`}
                                      >
                                        {importFileMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                                        Import
                                      </Button>
                                    </>
                                  )}
                                  {!file.isJson && (
                                    <Badge variant="outline" className="text-xs">Non-JSON</Badge>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Deduplication Dialog */}
        <AnimatePresence>
          {showDedupDialog && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
              onClick={() => setShowDedupDialog(false)}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="bg-card border border-border rounded-xl p-6 max-w-md w-full mx-4"
                onClick={e => e.stopPropagation()}
              >
                <h3 className="text-lg font-semibold mb-4">Deduplicate Components</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Select fields to use for matching duplicates. Components with identical values in all selected fields will be removed.
                </p>
                <div className="space-y-2 mb-6">
                  {DEDUP_FIELDS.map(field => (
                    <label key={field.key} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={dedupFields.includes(field.key)}
                        onCheckedChange={() => toggleDedupField(field.key)}
                        data-testid={`checkbox-dedup-${field.key}`}
                      />
                      <span className="text-sm">{field.label}</span>
                    </label>
                  ))}
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowDedupDialog(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleDeduplicate}
                    disabled={dedupMutation.isPending}
                    data-testid="button-confirm-deduplicate"
                  >
                    {dedupMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Remove Duplicates
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

function ComponentRow({ component }: { component: CbomComponent }) {
  return (
    <tr className="hover:bg-muted/20 transition-colors" data-testid={`row-component-${component.id}`}>
      <td className="px-4 py-3 font-medium text-sm">{component.name}</td>
      <td className="px-4 py-3">
        <Badge variant="outline" className="font-mono text-[10px]">
          {component.componentType || "-"}
        </Badge>
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground">{component.primitiveType || "-"}</td>
      <td className="px-4 py-3 text-sm font-mono text-muted-foreground">{component.oid || "-"}</td>
      <td className="px-4 py-3 text-sm">{component.version || "-"}</td>
      <td className="px-4 py-3 text-sm text-muted-foreground">{component.algorithmMode || "-"}</td>
      <td className="px-4 py-3 text-sm text-muted-foreground">{component.padding || "-"}</td>
      <td className="px-4 py-3 text-sm text-muted-foreground">{component.curve || "-"}</td>
      <td className="px-4 py-3 text-center">
        {component.nistQuantumSecurityLevel ? (
          <Badge variant="secondary" className="font-mono">
            L{component.nistQuantumSecurityLevel}
          </Badge>
        ) : "-"}
      </td>
    </tr>
  );
}

function ComplianceRow({ component, result, policyMatches }: { component: CbomComponent; result?: ComplianceResult; policyMatches?: any[] }) {
  const statusConfig = {
    "quantum-safe": {
      icon: CheckCircle2,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
      label: "Safe",
    },
    "classical-only": {
      icon: AlertTriangle,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
      label: "Classical",
    },
    "vulnerable": {
      icon: XCircle,
      color: "text-rose-500",
      bg: "bg-rose-500/10",
      label: "Vulnerable",
    },
    "unknown": {
      icon: Info,
      color: "text-muted-foreground",
      bg: "bg-muted/30",
      label: "Unknown",
    },
  };

  const config = statusConfig[result?.status || "unknown"];
  const Icon = config.icon;

  const hasViolations = policyMatches?.some((m: any) => !m.compliant);
  const allCompliant = policyMatches?.length && policyMatches.every((m: any) => m.compliant);

  return (
    <tr className="hover:bg-muted/20 transition-colors" data-testid={`row-compliance-${component.id}`}>
      <td className="px-4 py-3">
        <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full ${config.bg}`}>
          <Icon className={`w-3.5 h-3.5 ${config.color}`} />
          <span className={`text-xs font-medium ${config.color}`}>{config.label}</span>
        </div>
      </td>
      <td className="px-4 py-3 font-medium text-sm">{component.name}</td>
      <td className="px-4 py-3">
        <Badge variant="outline" className="font-mono text-[10px]">
          {component.componentType || "-"}
        </Badge>
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground max-w-xs truncate" title={result?.reason}>
        {result?.reason || "-"}
      </td>
      <td className="px-4 py-3">
        {!policyMatches ? (
          <span className="text-xs text-muted-foreground">-</span>
        ) : allCompliant ? (
          <div className="flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            <span className="text-xs text-emerald-500">
              {policyMatches.length} {policyMatches.length === 1 ? "policy" : "policies"} passed
            </span>
          </div>
        ) : hasViolations ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1 cursor-help">
                <ShieldX className="w-3.5 h-3.5 text-rose-500" />
                <span className="text-xs text-rose-500">
                  {policyMatches.filter((m: any) => !m.compliant).length} violation{policyMatches.filter((m: any) => !m.compliant).length > 1 ? "s" : ""}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-sm">
              <div className="space-y-1.5">
                {policyMatches.filter((m: any) => !m.compliant).map((m: any, i: number) => (
                  <div key={i} className="text-xs">
                    <span className="font-medium">{m.policyName}:</span>
                    <ul className="list-disc pl-3 mt-0.5">
                      {m.violations.map((v: string, j: number) => (
                        <li key={j}>{v}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </TooltipContent>
          </Tooltip>
        ) : (
          <span className="text-xs text-muted-foreground">No matches</span>
        )}
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground max-w-xs">
        {result?.recommendation ? (
          <span className="text-xs">{result.recommendation}</span>
        ) : "-"}
      </td>
    </tr>
  );
}
