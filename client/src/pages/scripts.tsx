import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import Layout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { 
  Plus, Play, Trash2, Clock, Variable, Terminal, History, 
  Calendar, CheckCircle, XCircle, Loader2, AlertCircle, Edit2,
  FlaskConical, FolderOpen, ChevronUp, Folder
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import type { ScheduledScript, ScriptVariable, ScriptSchedule, ScriptExecution } from "@shared/schema";

const DAYS_OF_WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function ScriptsPage() {
  const [activeTab, setActiveTab] = useState("scripts");

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Scripts Manager</h1>
            <p className="text-muted-foreground">Create and schedule bash commands and REST API calls</p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="bg-card border border-border/50">
            <TabsTrigger value="scripts" className="gap-2" data-testid="tab-scripts">
              <Terminal className="w-4 h-4" />
              Scripts
            </TabsTrigger>
            <TabsTrigger value="variables" className="gap-2" data-testid="tab-variables">
              <Variable className="w-4 h-4" />
              Variables
            </TabsTrigger>
            <TabsTrigger value="schedules" className="gap-2" data-testid="tab-schedules">
              <Calendar className="w-4 h-4" />
              Schedules
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2" data-testid="tab-history">
              <History className="w-4 h-4" />
              History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="scripts">
            <ScriptsTab />
          </TabsContent>

          <TabsContent value="variables">
            <VariablesTab />
          </TabsContent>

          <TabsContent value="schedules">
            <SchedulesTab />
          </TabsContent>

          <TabsContent value="history">
            <HistoryTab />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

interface DirectoryInfo {
  currentPath: string;
  directories: { name: string; path: string }[];
  canGoUp: boolean;
}

interface TestResult {
  success: boolean;
  output: string | null;
  errorOutput: string | null;
  exitCode: number;
}

function ScriptsTab() {
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isTestOpen, setIsTestOpen] = useState(false);
  const [isDirOpen, setIsDirOpen] = useState(false);
  const [dirPath, setDirPath] = useState(".");
  const [newScript, setNewScript] = useState({ name: "", description: "", command: "", outputPath: "" });
  const [editScript, setEditScript] = useState<ScheduledScript | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  const { data: scripts, isLoading } = useQuery<ScheduledScript[]>({
    queryKey: ["/api/scripts"],
  });

  const { data: directories } = useQuery<DirectoryInfo>({
    queryKey: ["/api/scripts/directories", dirPath],
    queryFn: async () => {
      const res = await fetch(`/api/scripts/directories?path=${encodeURIComponent(dirPath)}`);
      return res.json();
    },
    enabled: isDirOpen,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof newScript) => {
      return apiRequest("POST", "/api/scripts", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scripts"] });
      setIsCreateOpen(false);
      setNewScript({ name: "", description: "", command: "", outputPath: "" });
      toast({ title: "Script created successfully" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to create script", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<ScheduledScript> }) => {
      return apiRequest("PATCH", `/api/scripts/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scripts"] });
      setIsEditOpen(false);
      setEditScript(null);
      toast({ title: "Script updated successfully" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to update script", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/scripts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scripts"] });
      toast({ title: "Script deleted" });
    },
  });

  const executeMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("POST", `/api/scripts/${id}/execute`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scripts/executions"] });
      toast({ title: "Script execution started" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to execute script", description: err.message, variant: "destructive" });
    },
  });

  const testMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/scripts/${id}/test`);
      return res.json();
    },
    onSuccess: (result: TestResult) => {
      setTestResult(result);
      setIsTestOpen(true);
    },
    onError: (err: any) => {
      toast({ title: "Failed to test script", description: err.message, variant: "destructive" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isEnabled }: { id: number; isEnabled: boolean }) => {
      return apiRequest("PATCH", `/api/scripts/${id}`, { isEnabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scripts"] });
    },
  });

  const openEditDialog = (script: ScheduledScript) => {
    setEditScript({ ...script });
    setIsEditOpen(true);
  };

  const selectDirectory = (path: string) => {
    if (editScript) {
      setEditScript({ ...editScript, outputPath: path });
    } else {
      setNewScript({ ...newScript, outputPath: path });
    }
    setIsDirOpen(false);
    setDirPath(".");
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Scheduled Scripts</h2>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-script">
              <Plus className="w-4 h-4 mr-2" />
              New Script
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create New Script</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Name</Label>
                <Input
                  value={newScript.name}
                  onChange={(e) => setNewScript({ ...newScript, name: e.target.value })}
                  placeholder="My API Script"
                  data-testid="input-script-name"
                />
              </div>
              <div>
                <Label>Description (optional)</Label>
                <Input
                  value={newScript.description}
                  onChange={(e) => setNewScript({ ...newScript, description: e.target.value })}
                  placeholder="Fetches data from external API"
                  data-testid="input-script-description"
                />
              </div>
              <div>
                <Label>Command</Label>
                <Textarea
                  value={newScript.command}
                  onChange={(e) => setNewScript({ ...newScript, command: e.target.value })}
                  placeholder="curl -X GET https://api.example.com/data -H 'Authorization: Bearer ${API_TOKEN}'"
                  className="font-mono min-h-32"
                  data-testid="input-script-command"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Use {"${VARIABLE_NAME}"} to reference stored variables
                </p>
              </div>
              <div>
                <Label>Output Directory (optional)</Label>
                <div className="flex gap-2">
                  <Input
                    value={newScript.outputPath}
                    onChange={(e) => setNewScript({ ...newScript, outputPath: e.target.value })}
                    placeholder="./script-outputs"
                    data-testid="input-script-output-path"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setIsDirOpen(true)}
                    data-testid="button-browse-dir"
                  >
                    <FolderOpen className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Script output will be saved to this directory
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
              <Button 
                onClick={() => createMutation.mutate(newScript)}
                disabled={!newScript.name || !newScript.command || createMutation.isPending}
                data-testid="button-save-script"
              >
                {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Create Script
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Edit Script Dialog */}
      <Dialog open={isEditOpen} onOpenChange={(open) => { setIsEditOpen(open); if (!open) setEditScript(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Script</DialogTitle>
          </DialogHeader>
          {editScript && (
            <div className="space-y-4">
              <div>
                <Label>Name</Label>
                <Input
                  value={editScript.name}
                  onChange={(e) => setEditScript({ ...editScript, name: e.target.value })}
                  data-testid="input-edit-script-name"
                />
              </div>
              <div>
                <Label>Description (optional)</Label>
                <Input
                  value={editScript.description || ""}
                  onChange={(e) => setEditScript({ ...editScript, description: e.target.value })}
                  data-testid="input-edit-script-description"
                />
              </div>
              <div>
                <Label>Command</Label>
                <Textarea
                  value={editScript.command}
                  onChange={(e) => setEditScript({ ...editScript, command: e.target.value })}
                  className="font-mono min-h-32"
                  data-testid="input-edit-script-command"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Use {"${VARIABLE_NAME}"} to reference stored variables
                </p>
              </div>
              <div>
                <Label>Output Directory (optional)</Label>
                <div className="flex gap-2">
                  <Input
                    value={editScript.outputPath || ""}
                    onChange={(e) => setEditScript({ ...editScript, outputPath: e.target.value })}
                    placeholder="./script-outputs"
                    data-testid="input-edit-script-output-path"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setIsDirOpen(true)}
                    data-testid="button-edit-browse-dir"
                  >
                    <FolderOpen className="w-4 h-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Script output will be saved to this directory
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
            <Button 
              onClick={() => editScript && updateMutation.mutate({ 
                id: editScript.id, 
                data: { 
                  name: editScript.name, 
                  description: editScript.description, 
                  command: editScript.command,
                  outputPath: editScript.outputPath || null,
                }
              })}
              disabled={!editScript?.name || !editScript?.command || updateMutation.isPending}
              data-testid="button-update-script"
            >
              {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Directory Selector Dialog */}
      <Dialog open={isDirOpen} onOpenChange={setIsDirOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Select Output Directory</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
              <FolderOpen className="w-4 h-4" />
              <span className="font-mono truncate">{directories?.currentPath || "."}</span>
            </div>
            {directories?.canGoUp && (
              <Button
                variant="ghost"
                className="w-full justify-start"
                onClick={() => {
                  const parts = dirPath.split('/');
                  parts.pop();
                  setDirPath(parts.join('/') || '.');
                }}
                data-testid="button-dir-up"
              >
                <ChevronUp className="w-4 h-4 mr-2" />
                Go up
              </Button>
            )}
            <div className="max-h-60 overflow-y-auto space-y-1">
              {directories?.directories.map((dir) => (
                <div key={dir.path} className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    className="flex-1 justify-start"
                    onClick={() => setDirPath(dir.path)}
                    data-testid={`button-dir-${dir.name}`}
                  >
                    <Folder className="w-4 h-4 mr-2" />
                    {dir.name}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => selectDirectory(dir.path)}
                    data-testid={`button-select-dir-${dir.name}`}
                  >
                    Select
                  </Button>
                </div>
              ))}
              {directories?.directories.length === 0 && (
                <p className="text-sm text-muted-foreground py-4 text-center">No subdirectories</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => selectDirectory(directories?.currentPath || ".")}>
              Use Current Directory
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Test Result Dialog */}
      <Dialog open={isTestOpen} onOpenChange={setIsTestOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {testResult?.success ? (
                <CheckCircle className="w-5 h-5 text-emerald-500" />
              ) : (
                <XCircle className="w-5 h-5 text-rose-500" />
              )}
              Test Result
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <Badge variant={testResult?.success ? "default" : "destructive"}>
                {testResult?.success ? "Success" : "Failed"}
              </Badge>
              <span className="text-sm text-muted-foreground">
                Exit code: {testResult?.exitCode}
              </span>
            </div>
            {testResult?.output && (
              <div>
                <Label className="text-sm">Output</Label>
                <pre className="text-xs bg-muted/50 p-3 rounded overflow-x-auto font-mono max-h-60 overflow-y-auto mt-1">
                  {testResult.output}
                </pre>
              </div>
            )}
            {testResult?.errorOutput && (
              <div>
                <Label className="text-sm text-rose-500">Error</Label>
                <pre className="text-xs bg-rose-500/10 text-rose-500 p-3 rounded overflow-x-auto font-mono max-h-40 overflow-y-auto mt-1">
                  {testResult.errorOutput}
                </pre>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setIsTestOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : !scripts?.length ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Terminal className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No scripts created yet</p>
            <Button variant="ghost" onClick={() => setIsCreateOpen(true)}>Create your first script</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {scripts.map((script) => (
            <Card key={script.id} className="border-border/50" data-testid={`script-card-${script.id}`}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium truncate">{script.name}</h3>
                      <Badge variant={script.isEnabled ? "default" : "secondary"}>
                        {script.isEnabled ? "Enabled" : "Disabled"}
                      </Badge>
                    </div>
                    {script.description && (
                      <p className="text-sm text-muted-foreground mb-2">{script.description}</p>
                    )}
                    <pre className="text-xs bg-muted/50 p-2 rounded overflow-x-auto font-mono">
                      {script.command}
                    </pre>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span>
                        Created {script.createdAt && formatDistanceToNow(new Date(script.createdAt), { addSuffix: true })}
                      </span>
                      {script.outputPath && (
                        <span className="flex items-center gap-1">
                          <FolderOpen className="w-3 h-3" />
                          {script.outputPath}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={script.isEnabled || false}
                      onCheckedChange={(checked) => toggleMutation.mutate({ id: script.id, isEnabled: checked })}
                      data-testid={`switch-script-${script.id}`}
                    />
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => testMutation.mutate(script.id)}
                      disabled={testMutation.isPending}
                      title="Test script"
                      data-testid={`button-test-script-${script.id}`}
                    >
                      <FlaskConical className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => executeMutation.mutate(script.id)}
                      disabled={executeMutation.isPending}
                      title="Run script"
                      data-testid={`button-run-script-${script.id}`}
                    >
                      <Play className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => openEditDialog(script)}
                      title="Edit script"
                      data-testid={`button-edit-script-${script.id}`}
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-rose-500 hover:text-rose-600"
                      onClick={() => deleteMutation.mutate(script.id)}
                      title="Delete script"
                      data-testid={`button-delete-script-${script.id}`}
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
    </div>
  );
}

function VariablesTab() {
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newVariable, setNewVariable] = useState({ name: "", value: "", description: "", isSecret: true });

  const { data: variables, isLoading } = useQuery<ScriptVariable[]>({
    queryKey: ["/api/scripts/variables"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof newVariable) => {
      return apiRequest("POST", "/api/scripts/variables", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scripts/variables"] });
      setIsCreateOpen(false);
      setNewVariable({ name: "", value: "", description: "", isSecret: true });
      toast({ title: "Variable created successfully" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to create variable", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/scripts/variables/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scripts/variables"] });
      toast({ title: "Variable deleted" });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold">Script Variables</h2>
          <p className="text-sm text-muted-foreground">Store API tokens and credentials for use in scripts</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-variable">
              <Plus className="w-4 h-4 mr-2" />
              New Variable
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Variable</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Name</Label>
                <Input
                  value={newVariable.name}
                  onChange={(e) => setNewVariable({ ...newVariable, name: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_') })}
                  placeholder="API_TOKEN"
                  className="font-mono"
                  data-testid="input-variable-name"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Use in scripts as {"${" + (newVariable.name || "VARIABLE_NAME") + "}"}
                </p>
              </div>
              <div>
                <Label>Value</Label>
                <Input
                  type={newVariable.isSecret ? "password" : "text"}
                  value={newVariable.value}
                  onChange={(e) => setNewVariable({ ...newVariable, value: e.target.value })}
                  placeholder="your-secret-value"
                  data-testid="input-variable-value"
                />
              </div>
              <div>
                <Label>Description (optional)</Label>
                <Input
                  value={newVariable.description}
                  onChange={(e) => setNewVariable({ ...newVariable, description: e.target.value })}
                  placeholder="API token for external service"
                  data-testid="input-variable-description"
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={newVariable.isSecret}
                  onCheckedChange={(checked) => setNewVariable({ ...newVariable, isSecret: checked })}
                  data-testid="switch-variable-secret"
                />
                <Label>Treat as secret (mask value)</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
              <Button 
                onClick={() => createMutation.mutate(newVariable)}
                disabled={!newVariable.name || !newVariable.value || createMutation.isPending}
                data-testid="button-save-variable"
              >
                {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Create Variable
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : !variables?.length ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Variable className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No variables created yet</p>
            <Button variant="ghost" onClick={() => setIsCreateOpen(true)}>Create your first variable</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {variables.map((variable) => (
            <Card key={variable.id} className="border-border/50" data-testid={`variable-card-${variable.id}`}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <code className="text-sm font-mono bg-muted/50 px-2 py-1 rounded">
                      {"${" + variable.name + "}"}
                    </code>
                    <span className="text-sm text-muted-foreground">
                      {variable.isSecret ? "••••••••" : variable.value}
                    </span>
                    {variable.description && (
                      <span className="text-xs text-muted-foreground">— {variable.description}</span>
                    )}
                    {variable.isSecret && (
                      <Badge variant="secondary" className="text-xs">Secret</Badge>
                    )}
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-rose-500 hover:text-rose-600"
                    onClick={() => deleteMutation.mutate(variable.id)}
                    data-testid={`button-delete-variable-${variable.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function SchedulesTab() {
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newSchedule, setNewSchedule] = useState({
    scriptId: 0,
    scheduleType: "daily" as string,
    times: ["09:00"],
    specificDates: [] as string[],
    daysOfWeek: [] as number[],
  });

  const { data: scripts } = useQuery<ScheduledScript[]>({
    queryKey: ["/api/scripts"],
  });

  const { data: schedules, isLoading } = useQuery<ScriptSchedule[]>({
    queryKey: ["/api/scripts/schedules"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof newSchedule) => {
      return apiRequest("POST", "/api/scripts/schedules", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scripts/schedules"] });
      setIsCreateOpen(false);
      setNewSchedule({ scriptId: 0, scheduleType: "daily", times: ["09:00"], specificDates: [], daysOfWeek: [] });
      toast({ title: "Schedule created successfully" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to create schedule", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/scripts/schedules/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scripts/schedules"] });
      toast({ title: "Schedule deleted" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isEnabled }: { id: number; isEnabled: boolean }) => {
      return apiRequest("PATCH", `/api/scripts/schedules/${id}`, { isEnabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scripts/schedules"] });
    },
  });

  const getScriptName = (scriptId: number) => {
    return scripts?.find(s => s.id === scriptId)?.name || "Unknown Script";
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold">Script Schedules</h2>
          <p className="text-sm text-muted-foreground">Configure when scripts should run automatically</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button disabled={!scripts?.length} data-testid="button-create-schedule">
              <Plus className="w-4 h-4 mr-2" />
              New Schedule
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create Schedule</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Script</Label>
                <Select 
                  value={newSchedule.scriptId ? String(newSchedule.scriptId) : ""} 
                  onValueChange={(v) => setNewSchedule({ ...newSchedule, scriptId: Number(v) })}
                >
                  <SelectTrigger data-testid="select-schedule-script">
                    <SelectValue placeholder="Select a script" />
                  </SelectTrigger>
                  <SelectContent>
                    {scripts?.map((script) => (
                      <SelectItem key={script.id} value={String(script.id)}>
                        {script.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Schedule Type</Label>
                <Select 
                  value={newSchedule.scheduleType} 
                  onValueChange={(v) => setNewSchedule({ ...newSchedule, scheduleType: v })}
                >
                  <SelectTrigger data-testid="select-schedule-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily at specific times</SelectItem>
                    <SelectItem value="days_of_week">Specific days of week</SelectItem>
                    <SelectItem value="specific_date">Specific dates</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Times (24-hour format)</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {newSchedule.times.map((time, idx) => (
                    <div key={idx} className="flex items-center gap-1">
                      <Input
                        type="time"
                        value={time}
                        onChange={(e) => {
                          const times = [...newSchedule.times];
                          times[idx] = e.target.value;
                          setNewSchedule({ ...newSchedule, times });
                        }}
                        className="w-32"
                        data-testid={`input-schedule-time-${idx}`}
                      />
                      {newSchedule.times.length > 1 && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => {
                            const times = newSchedule.times.filter((_, i) => i !== idx);
                            setNewSchedule({ ...newSchedule, times });
                          }}
                        >
                          <XCircle className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setNewSchedule({ ...newSchedule, times: [...newSchedule.times, "12:00"] })}
                    data-testid="button-add-time"
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Add Time
                  </Button>
                </div>
              </div>

              {newSchedule.scheduleType === "days_of_week" && (
                <div>
                  <Label>Days of Week</Label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {DAYS_OF_WEEK.map((day, idx) => (
                      <Button
                        key={day}
                        size="sm"
                        variant={newSchedule.daysOfWeek.includes(idx) ? "default" : "outline"}
                        onClick={() => {
                          const daysOfWeek = newSchedule.daysOfWeek.includes(idx)
                            ? newSchedule.daysOfWeek.filter(d => d !== idx)
                            : [...newSchedule.daysOfWeek, idx];
                          setNewSchedule({ ...newSchedule, daysOfWeek });
                        }}
                        data-testid={`button-day-${idx}`}
                      >
                        {day.slice(0, 3)}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {newSchedule.scheduleType === "specific_date" && (
                <div>
                  <Label>Specific Dates</Label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {newSchedule.specificDates.map((date, idx) => (
                      <div key={idx} className="flex items-center gap-1">
                        <Input
                          type="date"
                          value={date}
                          onChange={(e) => {
                            const dates = [...newSchedule.specificDates];
                            dates[idx] = e.target.value;
                            setNewSchedule({ ...newSchedule, specificDates: dates });
                          }}
                          className="w-40"
                          data-testid={`input-schedule-date-${idx}`}
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={() => {
                            const dates = newSchedule.specificDates.filter((_, i) => i !== idx);
                            setNewSchedule({ ...newSchedule, specificDates: dates });
                          }}
                        >
                          <XCircle className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const today = new Date().toISOString().split('T')[0];
                        setNewSchedule({ ...newSchedule, specificDates: [...newSchedule.specificDates, today] });
                      }}
                      data-testid="button-add-date"
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      Add Date
                    </Button>
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
              <Button 
                onClick={() => createMutation.mutate(newSchedule)}
                disabled={!newSchedule.scriptId || !newSchedule.times.length || createMutation.isPending}
                data-testid="button-save-schedule"
              >
                {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Create Schedule
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : !schedules?.length ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Calendar className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No schedules created yet</p>
            {scripts?.length ? (
              <Button variant="ghost" onClick={() => setIsCreateOpen(true)}>Create your first schedule</Button>
            ) : (
              <p className="text-sm text-muted-foreground">Create a script first</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {schedules.map((schedule) => (
            <Card key={schedule.id} className="border-border/50" data-testid={`schedule-card-${schedule.id}`}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium">{getScriptName(schedule.scriptId)}</span>
                      <Badge variant={schedule.isEnabled ? "default" : "secondary"}>
                        {schedule.isEnabled ? "Active" : "Paused"}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      <span className="capitalize">{schedule.scheduleType.replace('_', ' ')}</span>
                      {schedule.times?.length ? ` at ${schedule.times.join(', ')}` : ''}
                      {schedule.daysOfWeek?.length ? ` on ${schedule.daysOfWeek.map(d => DAYS_OF_WEEK[d]?.slice(0, 3)).join(', ')}` : ''}
                    </div>
                    {schedule.nextRun && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Next run: {format(new Date(schedule.nextRun), 'PPp')}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={schedule.isEnabled || false}
                      onCheckedChange={(checked) => toggleMutation.mutate({ id: schedule.id, isEnabled: checked })}
                      data-testid={`switch-schedule-${schedule.id}`}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-rose-500 hover:text-rose-600"
                      onClick={() => deleteMutation.mutate(schedule.id)}
                      data-testid={`button-delete-schedule-${schedule.id}`}
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
    </div>
  );
}

function HistoryTab() {
  const { data: executions, isLoading } = useQuery<ScriptExecution[]>({
    queryKey: ["/api/scripts/executions"],
  });

  const { data: scripts } = useQuery<ScheduledScript[]>({
    queryKey: ["/api/scripts"],
  });

  const getScriptName = (scriptId: number) => {
    return scripts?.find(s => s.id === scriptId)?.name || "Unknown Script";
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "success":
        return <CheckCircle className="w-4 h-4 text-emerald-500" />;
      case "failed":
        return <XCircle className="w-4 h-4 text-rose-500" />;
      case "running":
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      case "timeout":
        return <AlertCircle className="w-4 h-4 text-amber-500" />;
      default:
        return <Clock className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const [expandedId, setExpandedId] = useState<number | null>(null);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Execution History</h2>
        <p className="text-sm text-muted-foreground">View logs and results from script executions</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : !executions?.length ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <History className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No executions yet</p>
            <p className="text-sm text-muted-foreground">Run a script to see execution history</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {executions.map((execution) => (
            <Card 
              key={execution.id} 
              className="border-border/50 cursor-pointer hover-elevate"
              onClick={() => setExpandedId(expandedId === execution.id ? null : execution.id)}
              data-testid={`execution-card-${execution.id}`}
            >
              <CardContent className="py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(execution.status)}
                    <div>
                      <span className="font-medium">{getScriptName(execution.scriptId)}</span>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{execution.triggeredBy === "manual" ? "Manual" : "Scheduled"}</span>
                        <span>•</span>
                        <span>{execution.startedAt && formatDistanceToNow(new Date(execution.startedAt), { addSuffix: true })}</span>
                        {execution.exitCode !== null && (
                          <>
                            <span>•</span>
                            <span>Exit code: {execution.exitCode}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <Badge variant={
                    execution.status === "success" ? "default" :
                    execution.status === "failed" ? "destructive" :
                    execution.status === "running" ? "secondary" : "outline"
                  }>
                    {execution.status}
                  </Badge>
                </div>

                {expandedId === execution.id && (execution.output || execution.errorOutput) && (
                  <div className="mt-4 space-y-2">
                    {execution.output && (
                      <div>
                        <Label className="text-xs">Output</Label>
                        <pre className="text-xs bg-muted/50 p-2 rounded overflow-x-auto font-mono max-h-40 overflow-y-auto">
                          {execution.output}
                        </pre>
                      </div>
                    )}
                    {execution.errorOutput && (
                      <div>
                        <Label className="text-xs text-rose-500">Error</Label>
                        <pre className="text-xs bg-rose-500/10 text-rose-500 p-2 rounded overflow-x-auto font-mono max-h-40 overflow-y-auto">
                          {execution.errorOutput}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
