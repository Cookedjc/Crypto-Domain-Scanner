import { useState, useCallback } from "react";
import Layout from "@/components/layout";
import { useCbomFiles, useCbomComponents, useUploadCbom, useDeleteCbomFile, useDeduplicateCbom } from "@/hooks/use-cbom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
} from "lucide-react";
import type { CbomComponent } from "@shared/schema";

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

export default function CbomPage() {
  const { toast } = useToast();
  const { data: files, isLoading: filesLoading } = useCbomFiles();
  const { data: components, isLoading: componentsLoading } = useCbomComponents();
  const uploadMutation = useUploadCbom();
  const deleteMutation = useDeleteCbomFile();
  const dedupMutation = useDeduplicateCbom();

  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<string>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [isDragging, setIsDragging] = useState(false);
  const [showDedupDialog, setShowDedupDialog] = useState(false);
  const [dedupFields, setDedupFields] = useState<string[]>(["name", "componentType"]);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);

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
    return matchesSearch && matchesType;
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
        <Card className="border-border/50 overflow-hidden">
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
