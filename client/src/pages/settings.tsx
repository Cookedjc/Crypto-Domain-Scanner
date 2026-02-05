import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import Layout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { 
  Plus, Trash2, Users, Shield, Key, Edit2, Loader2, 
  UserPlus, Save, Settings2, Lock
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { User, RolePermission, AuthConfig, UserType, MenuItem } from "@shared/schema";
import { USER_TYPES, MENU_ITEMS } from "@shared/schema";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("users");

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Settings</h1>
            <p className="text-muted-foreground">Manage users, authentication, and access controls</p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="bg-card border border-border/50">
            <TabsTrigger value="users" className="gap-2" data-testid="tab-users">
              <Users className="w-4 h-4" />
              Users
            </TabsTrigger>
            <TabsTrigger value="auth" className="gap-2" data-testid="tab-auth">
              <Key className="w-4 h-4" />
              Authentication
            </TabsTrigger>
            <TabsTrigger value="rbac" className="gap-2" data-testid="tab-rbac">
              <Shield className="w-4 h-4" />
              RBAC Controls
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users">
            <UsersTab />
          </TabsContent>

          <TabsContent value="auth">
            <AuthTab />
          </TabsContent>

          <TabsContent value="rbac">
            <RBACTab />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

function UsersTab() {
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [newUser, setNewUser] = useState({ email: "", displayName: "", userType: "user" as UserType });
  const [editUser, setEditUser] = useState<User | null>(null);

  const { data: users, isLoading } = useQuery<User[]>({
    queryKey: ["/api/settings/users"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof newUser) => {
      return apiRequest("POST", "/api/settings/users", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/users"] });
      setIsCreateOpen(false);
      setNewUser({ email: "", displayName: "", userType: "user" });
      toast({ title: "User created successfully" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to create user", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<User> }) => {
      return apiRequest("PATCH", `/api/settings/users/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/users"] });
      setIsEditOpen(false);
      setEditUser(null);
      toast({ title: "User updated successfully" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to update user", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/settings/users/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/users"] });
      toast({ title: "User deleted successfully" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to delete user", description: err.message, variant: "destructive" });
    },
  });

  const getUserTypeBadgeVariant = (userType: string) => {
    switch (userType) {
      case "admin": return "destructive";
      case "superuser": return "default";
      case "user": return "secondary";
      default: return "outline";
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">User Management</h2>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <Button onClick={() => setIsCreateOpen(true)} data-testid="button-add-user">
            <UserPlus className="w-4 h-4 mr-2" />
            Add User
          </Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New User</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input 
                  type="email"
                  placeholder="user@example.com" 
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  data-testid="input-user-email"
                />
              </div>
              <div className="space-y-2">
                <Label>Display Name</Label>
                <Input 
                  placeholder="John Doe" 
                  value={newUser.displayName}
                  onChange={(e) => setNewUser({ ...newUser, displayName: e.target.value })}
                  data-testid="input-user-name"
                />
              </div>
              <div className="space-y-2">
                <Label>User Type</Label>
                <Select 
                  value={newUser.userType} 
                  onValueChange={(v) => setNewUser({ ...newUser, userType: v as UserType })}
                >
                  <SelectTrigger data-testid="select-user-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {USER_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
              <Button 
                onClick={() => createMutation.mutate(newUser)}
                disabled={!newUser.email || !newUser.displayName || createMutation.isPending}
                data-testid="button-create-user"
              >
                {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Create User
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : users && users.length > 0 ? (
            <div className="divide-y divide-border">
              {users.map((user) => (
                <div key={user.id} className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-sm font-medium text-primary">
                        {user.displayName.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <div className="font-medium">{user.displayName}</div>
                      <div className="text-sm text-muted-foreground">{user.email}</div>
                    </div>
                    <Badge variant={getUserTypeBadgeVariant(user.userType)}>
                      {user.userType}
                    </Badge>
                    {!user.isActive && (
                      <Badge variant="outline" className="text-muted-foreground">Inactive</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-xs text-muted-foreground mr-4">
                      {user.lastLogin 
                        ? `Last login ${formatDistanceToNow(new Date(user.lastLogin))} ago`
                        : "Never logged in"
                      }
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setEditUser(user);
                        setIsEditOpen(true);
                      }}
                      data-testid={`button-edit-user-${user.id}`}
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteMutation.mutate(user.id)}
                      disabled={deleteMutation.isPending}
                      data-testid={`button-delete-user-${user.id}`}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-8 text-muted-foreground">
              <Users className="w-12 h-12 mb-4 opacity-50" />
              <p>No users found</p>
              <p className="text-sm">Add a user to get started</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
          </DialogHeader>
          {editUser && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input 
                  type="email"
                  value={editUser.email}
                  onChange={(e) => setEditUser({ ...editUser, email: e.target.value })}
                  data-testid="input-edit-email"
                />
              </div>
              <div className="space-y-2">
                <Label>Display Name</Label>
                <Input 
                  value={editUser.displayName}
                  onChange={(e) => setEditUser({ ...editUser, displayName: e.target.value })}
                  data-testid="input-edit-name"
                />
              </div>
              <div className="space-y-2">
                <Label>User Type</Label>
                <Select 
                  value={editUser.userType} 
                  onValueChange={(v) => setEditUser({ ...editUser, userType: v })}
                >
                  <SelectTrigger data-testid="select-edit-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {USER_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type.charAt(0).toUpperCase() + type.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center space-x-2">
                <Switch 
                  checked={editUser.isActive ?? true}
                  onCheckedChange={(checked) => setEditUser({ ...editUser, isActive: checked })}
                  data-testid="switch-user-active"
                />
                <Label>Active</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
            <Button 
              onClick={() => editUser && updateMutation.mutate({ 
                id: editUser.id, 
                data: { 
                  email: editUser.email, 
                  displayName: editUser.displayName, 
                  userType: editUser.userType as UserType,
                  isActive: editUser.isActive 
                } 
              })}
              disabled={updateMutation.isPending}
              data-testid="button-save-user"
            >
              {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AuthTab() {
  const { toast } = useToast();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editConfig, setEditConfig] = useState<AuthConfig | null>(null);
  const [newConfig, setNewConfig] = useState({
    provider: "oidc" as "oidc" | "oauth2" | "azure" | "google" | "okta",
    displayName: "",
    clientId: "",
    clientSecret: "",
    issuerUrl: "",
    authorizationUrl: "",
    tokenUrl: "",
    userInfoUrl: "",
    scopes: "openid profile email",
    redirectUri: "",
    isEnabled: false,
    isDefault: false,
  });

  const { data: configs, isLoading } = useQuery<AuthConfig[]>({
    queryKey: ["/api/settings/auth"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof newConfig) => {
      return apiRequest("POST", "/api/settings/auth", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/auth"] });
      setIsCreateOpen(false);
      setNewConfig({
        provider: "oidc",
        displayName: "",
        clientId: "",
        clientSecret: "",
        issuerUrl: "",
        authorizationUrl: "",
        tokenUrl: "",
        userInfoUrl: "",
        scopes: "openid profile email",
        redirectUri: "",
        isEnabled: false,
        isDefault: false,
      });
      toast({ title: "Auth configuration created" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to create configuration", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<AuthConfig> }) => {
      return apiRequest("PATCH", `/api/settings/auth/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/auth"] });
      setIsEditOpen(false);
      setEditConfig(null);
      toast({ title: "Auth configuration updated" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to update configuration", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/settings/auth/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/auth"] });
      toast({ title: "Auth configuration deleted" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to delete configuration", description: err.message, variant: "destructive" });
    },
  });

  const getProviderIcon = (provider: string) => {
    switch (provider) {
      case "azure": return "Azure AD";
      case "google": return "Google";
      case "okta": return "Okta";
      case "oidc": return "OIDC";
      case "oauth2": return "OAuth 2.0";
      default: return provider;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Authentication Configuration</h2>
          <p className="text-sm text-muted-foreground">Configure OIDC and OAuth providers for user authentication</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <Button onClick={() => setIsCreateOpen(true)} data-testid="button-add-auth">
            <Plus className="w-4 h-4 mr-2" />
            Add Provider
          </Button>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add Authentication Provider</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Provider Type</Label>
                <Select 
                  value={newConfig.provider} 
                  onValueChange={(v) => setNewConfig({ ...newConfig, provider: v as typeof newConfig.provider })}
                >
                  <SelectTrigger data-testid="select-provider">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="oidc">OpenID Connect (OIDC)</SelectItem>
                    <SelectItem value="oauth2">OAuth 2.0</SelectItem>
                    <SelectItem value="azure">Azure AD</SelectItem>
                    <SelectItem value="google">Google</SelectItem>
                    <SelectItem value="okta">Okta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Display Name</Label>
                <Input 
                  placeholder="My SSO Provider" 
                  value={newConfig.displayName}
                  onChange={(e) => setNewConfig({ ...newConfig, displayName: e.target.value })}
                  data-testid="input-auth-name"
                />
              </div>
              <div className="space-y-2">
                <Label>Client ID</Label>
                <Input 
                  placeholder="your-client-id" 
                  value={newConfig.clientId}
                  onChange={(e) => setNewConfig({ ...newConfig, clientId: e.target.value })}
                  data-testid="input-client-id"
                />
              </div>
              <div className="space-y-2">
                <Label>Client Secret</Label>
                <Input 
                  type="password"
                  placeholder="your-client-secret" 
                  value={newConfig.clientSecret}
                  onChange={(e) => setNewConfig({ ...newConfig, clientSecret: e.target.value })}
                  data-testid="input-client-secret"
                />
              </div>
              {(newConfig.provider === "oidc" || newConfig.provider === "okta") && (
                <div className="space-y-2">
                  <Label>Issuer URL</Label>
                  <Input 
                    placeholder="https://issuer.example.com" 
                    value={newConfig.issuerUrl}
                    onChange={(e) => setNewConfig({ ...newConfig, issuerUrl: e.target.value })}
                    data-testid="input-issuer-url"
                  />
                </div>
              )}
              {newConfig.provider === "oauth2" && (
                <>
                  <div className="space-y-2">
                    <Label>Authorization URL</Label>
                    <Input 
                      placeholder="https://provider.com/oauth/authorize" 
                      value={newConfig.authorizationUrl}
                      onChange={(e) => setNewConfig({ ...newConfig, authorizationUrl: e.target.value })}
                      data-testid="input-auth-url"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Token URL</Label>
                    <Input 
                      placeholder="https://provider.com/oauth/token" 
                      value={newConfig.tokenUrl}
                      onChange={(e) => setNewConfig({ ...newConfig, tokenUrl: e.target.value })}
                      data-testid="input-token-url"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>User Info URL</Label>
                    <Input 
                      placeholder="https://provider.com/userinfo" 
                      value={newConfig.userInfoUrl}
                      onChange={(e) => setNewConfig({ ...newConfig, userInfoUrl: e.target.value })}
                      data-testid="input-userinfo-url"
                    />
                  </div>
                </>
              )}
              <div className="space-y-2">
                <Label>Scopes</Label>
                <Input 
                  placeholder="openid profile email" 
                  value={newConfig.scopes}
                  onChange={(e) => setNewConfig({ ...newConfig, scopes: e.target.value })}
                  data-testid="input-scopes"
                />
              </div>
              <div className="space-y-2">
                <Label>Redirect URI</Label>
                <Input 
                  placeholder="https://yourapp.com/auth/callback" 
                  value={newConfig.redirectUri}
                  onChange={(e) => setNewConfig({ ...newConfig, redirectUri: e.target.value })}
                  data-testid="input-redirect-uri"
                />
              </div>
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <Switch 
                    checked={newConfig.isEnabled}
                    onCheckedChange={(checked) => setNewConfig({ ...newConfig, isEnabled: checked })}
                    data-testid="switch-enabled"
                  />
                  <Label>Enabled</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch 
                    checked={newConfig.isDefault}
                    onCheckedChange={(checked) => setNewConfig({ ...newConfig, isDefault: checked })}
                    data-testid="switch-default"
                  />
                  <Label>Default</Label>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
              <Button 
                onClick={() => createMutation.mutate(newConfig)}
                disabled={!newConfig.displayName || !newConfig.clientId || createMutation.isPending}
                data-testid="button-create-auth"
              >
                {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : configs && configs.length > 0 ? (
        <div className="grid gap-4">
          {configs.map((config) => (
            <Card key={config.id}>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Lock className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base">{config.displayName}</CardTitle>
                    <CardDescription>{getProviderIcon(config.provider)}</CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {config.isDefault && <Badge>Default</Badge>}
                  <Badge variant={config.isEnabled ? "default" : "outline"}>
                    {config.isEnabled ? "Enabled" : "Disabled"}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setEditConfig(config);
                      setIsEditOpen(true);
                    }}
                    data-testid={`button-edit-auth-${config.id}`}
                  >
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteMutation.mutate(config.id)}
                    data-testid={`button-delete-auth-${config.id}`}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="text-muted-foreground">Client ID</div>
                  <div className="font-mono text-xs truncate">{config.clientId}</div>
                  {config.issuerUrl && (
                    <>
                      <div className="text-muted-foreground">Issuer URL</div>
                      <div className="font-mono text-xs truncate">{config.issuerUrl}</div>
                    </>
                  )}
                  <div className="text-muted-foreground">Scopes</div>
                  <div className="font-mono text-xs">{config.scopes}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center p-8 text-muted-foreground">
            <Key className="w-12 h-12 mb-4 opacity-50" />
            <p>No authentication providers configured</p>
            <p className="text-sm">Add an OIDC or OAuth provider to enable SSO</p>
          </CardContent>
        </Card>
      )}

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Authentication Provider</DialogTitle>
          </DialogHeader>
          {editConfig && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Display Name</Label>
                <Input 
                  value={editConfig.displayName}
                  onChange={(e) => setEditConfig({ ...editConfig, displayName: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Client ID</Label>
                <Input 
                  value={editConfig.clientId}
                  onChange={(e) => setEditConfig({ ...editConfig, clientId: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Client Secret</Label>
                <Input 
                  type="password"
                  placeholder="Enter new secret to change"
                  onChange={(e) => setEditConfig({ ...editConfig, clientSecret: e.target.value })}
                />
              </div>
              {(editConfig.provider === "oidc" || editConfig.provider === "okta") && (
                <div className="space-y-2">
                  <Label>Issuer URL</Label>
                  <Input 
                    value={editConfig.issuerUrl || ""}
                    onChange={(e) => setEditConfig({ ...editConfig, issuerUrl: e.target.value })}
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label>Scopes</Label>
                <Input 
                  value={editConfig.scopes || ""}
                  onChange={(e) => setEditConfig({ ...editConfig, scopes: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Redirect URI</Label>
                <Input 
                  value={editConfig.redirectUri || ""}
                  onChange={(e) => setEditConfig({ ...editConfig, redirectUri: e.target.value })}
                />
              </div>
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <Switch 
                    checked={editConfig.isEnabled ?? false}
                    onCheckedChange={(checked) => setEditConfig({ ...editConfig, isEnabled: checked })}
                  />
                  <Label>Enabled</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch 
                    checked={editConfig.isDefault ?? false}
                    onCheckedChange={(checked) => setEditConfig({ ...editConfig, isDefault: checked })}
                  />
                  <Label>Default</Label>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
            <Button 
              onClick={() => editConfig && updateMutation.mutate({ id: editConfig.id, data: editConfig })}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RBACTab() {
  const { toast } = useToast();
  
  const { data: permissions, isLoading } = useQuery<RolePermission[]>({
    queryKey: ["/api/settings/permissions"],
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { userType: string; menuItem: string; canView: boolean; canEdit: boolean; canDelete: boolean }) => {
      return apiRequest("PUT", "/api/settings/permissions", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/permissions"] });
    },
    onError: (err: any) => {
      toast({ title: "Failed to update permission", description: err.message, variant: "destructive" });
    },
  });

  const getPermission = (userType: string, menuItem: string) => {
    return permissions?.find(p => p.userType === userType && p.menuItem === menuItem);
  };

  const handlePermissionChange = (userType: string, menuItem: string, field: 'canView' | 'canEdit' | 'canDelete', value: boolean) => {
    const existing = getPermission(userType, menuItem);
    updateMutation.mutate({
      userType,
      menuItem,
      canView: field === 'canView' ? value : (existing?.canView ?? false),
      canEdit: field === 'canEdit' ? value : (existing?.canEdit ?? false),
      canDelete: field === 'canDelete' ? value : (existing?.canDelete ?? false),
    });
  };

  const menuLabels: Record<string, string> = {
    dashboard: "Dashboard",
    scans: "Security Scans",
    cbom: "CBOM Manager",
    scripts: "Scripts Manager",
    settings: "Settings",
  };

  const userTypeLabels: Record<string, string> = {
    admin: "Admin",
    superuser: "Super User",
    user: "User",
    viewer: "Viewer",
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Role-Based Access Controls</h2>
        <p className="text-sm text-muted-foreground">
          Configure menu access and permissions for each user type. Only Admin users can modify these settings.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="w-4 h-4" />
            Permission Rules
          </CardTitle>
          <CardDescription>
            <ul className="list-disc list-inside space-y-1 mt-2">
              <li><strong>Admin:</strong> Full access to all features including user management and RBAC controls</li>
              <li><strong>Super User:</strong> Can Edit and Delete content, but cannot manage users or change RBAC settings</li>
              <li><strong>User:</strong> Can view and edit content but cannot delete</li>
              <li><strong>Viewer:</strong> Read-only access to permitted menu items</li>
            </ul>
          </CardDescription>
        </CardHeader>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="px-4 py-3 text-left font-medium text-sm">Menu Item</th>
                    {USER_TYPES.map((userType) => (
                      <th key={userType} className="px-4 py-3 text-center font-medium text-sm" colSpan={3}>
                        {userTypeLabels[userType]}
                      </th>
                    ))}
                  </tr>
                  <tr className="border-b bg-muted/20">
                    <th className="px-4 py-2"></th>
                    {USER_TYPES.map((userType) => (
                      <th key={userType} className="text-center" colSpan={3}>
                        <div className="flex justify-center gap-4 text-xs text-muted-foreground py-1">
                          <span className="w-12">View</span>
                          <span className="w-12">Edit</span>
                          <span className="w-12">Delete</span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MENU_ITEMS.map((menuItem) => (
                    <tr key={menuItem} className="border-b">
                      <td className="px-4 py-3 font-medium">{menuLabels[menuItem]}</td>
                      {USER_TYPES.map((userType) => {
                        const perm = getPermission(userType, menuItem);
                        const isAdmin = userType === 'admin';
                        return (
                          <td key={userType} className="text-center" colSpan={3}>
                            <div className="flex justify-center gap-4 py-1">
                              <div className="w-12 flex justify-center">
                                <Checkbox
                                  checked={perm?.canView ?? false}
                                  onCheckedChange={(checked) => 
                                    handlePermissionChange(userType, menuItem, 'canView', checked as boolean)
                                  }
                                  disabled={isAdmin}
                                  data-testid={`checkbox-view-${userType}-${menuItem}`}
                                />
                              </div>
                              <div className="w-12 flex justify-center">
                                <Checkbox
                                  checked={perm?.canEdit ?? false}
                                  onCheckedChange={(checked) => 
                                    handlePermissionChange(userType, menuItem, 'canEdit', checked as boolean)
                                  }
                                  disabled={isAdmin}
                                  data-testid={`checkbox-edit-${userType}-${menuItem}`}
                                />
                              </div>
                              <div className="w-12 flex justify-center">
                                <Checkbox
                                  checked={perm?.canDelete ?? false}
                                  onCheckedChange={(checked) => 
                                    handlePermissionChange(userType, menuItem, 'canDelete', checked as boolean)
                                  }
                                  disabled={isAdmin}
                                  data-testid={`checkbox-delete-${userType}-${menuItem}`}
                                />
                              </div>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="bg-amber-500/10 border-amber-500/30">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Settings2 className="w-5 h-5 text-amber-500 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-amber-600 dark:text-amber-400">Important Notes</p>
              <ul className="list-disc list-inside mt-1 text-muted-foreground space-y-1">
                <li>Admin permissions cannot be modified (always has full access)</li>
                <li>Delete and Edit functions require Super User or Admin role</li>
                <li>Only Admin users can create/delete users or change User Types</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
