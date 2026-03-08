import { Link, useLocation } from "wouter";
import { Shield, Activity, Lock, Settings, LayoutDashboard, Menu, FileJson, Terminal, FileText, LogOut, ChevronDown, User, Loader2, Eye, EyeOff, Mail } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useAuth, useAvailableUsers, useSwitchUser, useLogout } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";

const userTypeColors: Record<string, string> = {
  admin: "text-rose-500 bg-rose-500/10 border-rose-500/20",
  superuser: "text-amber-500 bg-amber-500/10 border-amber-500/20",
  user: "text-blue-500 bg-blue-500/10 border-blue-500/20",
  viewer: "text-muted-foreground bg-muted border-border/50",
};

function UserProfileButton() {
  const { user } = useAuth();
  const logoutMutation = useLogout();
  const { data: availableUsers } = useAvailableUsers();
  const switchUser = useSwitchUser();
  const [switchDialogOpen, setSwitchDialogOpen] = useState(false);
  const [switchEmail, setSwitchEmail] = useState("");
  const [switchPassword, setSwitchPassword] = useState("");
  const [showSwitchPassword, setShowSwitchPassword] = useState(false);

  if (!user) return null;

  const otherUsers = availableUsers?.filter(u => u.id !== user.id) || [];
  const initials = user.displayName
    .split(" ")
    .map(n => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const handleSwitchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    switchUser.mutate(
      { email: switchEmail, password: switchPassword },
      {
        onSuccess: () => {
          setSwitchDialogOpen(false);
          setSwitchEmail("");
          setSwitchPassword("");
        },
      }
    );
  };

  const handleQuickSwitch = (targetUser: any) => {
    setSwitchEmail(targetUser.email);
    setSwitchPassword("");
    setShowSwitchPassword(false);
    setSwitchDialogOpen(true);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="w-full bg-muted/30 rounded-lg p-3 border border-border/50 hover:bg-muted/50 transition-colors cursor-pointer text-left"
            data-testid="button-user-profile"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-primary to-blue-500 flex items-center justify-center text-[10px] font-bold text-white">
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user.displayName}</p>
                <p className="text-xs text-muted-foreground font-mono truncate">{user.email}</p>
              </div>
              <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            </div>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56" side="top">
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium">{user.displayName}</p>
              <p className="text-xs text-muted-foreground font-mono">{user.email}</p>
              <Badge variant="outline" className={`w-fit text-[10px] mt-1 ${userTypeColors[user.userType] || ""}`}>
                {user.userType}
              </Badge>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          {otherUsers.length > 0 && (
            <>
              <DropdownMenuLabel className="text-[10px] uppercase text-muted-foreground font-mono">
                Switch Profile
              </DropdownMenuLabel>
              {otherUsers.slice(0, 5).map((u) => (
                <DropdownMenuItem
                  key={u.id}
                  onClick={() => handleQuickSwitch(u)}
                  className="cursor-pointer"
                  data-testid={`menu-switch-user-${u.id}`}
                >
                  <div className="flex items-center gap-2 w-full">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-primary/50 to-blue-500/50 flex items-center justify-center text-[8px] font-bold text-white">
                      {u.displayName.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{u.displayName}</p>
                      <p className="text-[10px] text-muted-foreground font-mono truncate">{u.email}</p>
                    </div>
                    <Badge variant="outline" className={`text-[8px] ${userTypeColors[u.userType] || ""}`}>
                      {u.userType}
                    </Badge>
                  </div>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
            </>
          )}

          <DropdownMenuItem
            onClick={() => {
              setSwitchEmail("");
              setSwitchPassword("");
              setShowSwitchPassword(false);
              setSwitchDialogOpen(true);
            }}
            className="cursor-pointer"
            data-testid="menu-switch-other"
          >
            <User className="w-4 h-4 mr-2" />
            Switch to Other User
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() => logoutMutation.mutate()}
            className="cursor-pointer text-rose-500 focus:text-rose-500"
            data-testid="menu-logout"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={switchDialogOpen} onOpenChange={setSwitchDialogOpen}>
        <DialogContent className="sm:max-w-[400px] border-primary/20 bg-card">
          <DialogHeader>
            <DialogTitle className="font-display">Switch User Profile</DialogTitle>
            <DialogDescription>
              Enter credentials to switch to a different user account.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSwitchSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="font-mono text-xs uppercase text-muted-foreground">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="email"
                  placeholder="user@example.com"
                  className="pl-9 font-mono"
                  value={switchEmail}
                  onChange={(e) => setSwitchEmail(e.target.value)}
                  required
                  data-testid="input-switch-email"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="font-mono text-xs uppercase text-muted-foreground">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type={showSwitchPassword ? "text" : "password"}
                  placeholder="Enter password"
                  className="pl-9 pr-10 font-mono"
                  value={switchPassword}
                  onChange={(e) => setSwitchPassword(e.target.value)}
                  required
                  data-testid="input-switch-password"
                />
                <button
                  type="button"
                  onClick={() => setShowSwitchPassword(!showSwitchPassword)}
                  className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
                >
                  {showSwitchPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {switchUser.isError && (
              <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg p-3 text-sm text-rose-400">
                {switchUser.error?.message || "Switch failed"}
              </div>
            )}

            <DialogFooter>
              <Button
                type="submit"
                className="w-full bg-primary font-bold tracking-wide"
                disabled={switchUser.isPending || !switchEmail || !switchPassword}
                data-testid="button-switch-submit"
              >
                {switchUser.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Switching...
                  </>
                ) : (
                  "Switch Profile"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const NavItem = ({ href, icon: Icon, label }: { href: string; icon: any; label: string }) => {
    const isActive = location === href;
    return (
      <Link href={href} className={`
        flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 group
        ${isActive 
          ? "bg-primary/10 text-primary border border-primary/20 shadow-[0_0_15px_-5px_hsl(var(--primary))]" 
          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}
      `}>
        <Icon className={`w-4 h-4 transition-colors ${isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"}`} />
        {label}
      </Link>
    );
  };

  const Sidebar = () => (
    <div className="flex flex-col h-full bg-card/50 backdrop-blur-xl border-r border-border/40">
      <div className="p-6">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 rounded bg-primary/20 flex items-center justify-center border border-primary/30">
            <Shield className="w-5 h-5 text-primary" />
          </div>
          <span className="font-display font-bold text-lg tracking-tight">
            Cipher<span className="text-primary">Guard</span>
          </span>
        </div>
        <p className="text-xs text-muted-foreground ml-10 font-mono">PQC Analysis Engine v1.0</p>
      </div>

      <nav className="flex-1 px-4 space-y-2 mt-4">
        <div className="px-4 text-xs font-mono text-muted-foreground/50 uppercase mb-2">Platform</div>
        <NavItem href="/" icon={LayoutDashboard} label="Overview" />
        <NavItem href="/scans" icon={Activity} label="Active Scans" />
        <NavItem href="/cbom" icon={FileJson} label="CBOM Manager" />
        <NavItem href="/scripts" icon={Terminal} label="Scripts Manager" />
        
        <div className="px-4 text-xs font-mono text-muted-foreground/50 uppercase mt-8 mb-2">Configuration</div>
        <NavItem href="/policies" icon={Lock} label="Security Policies" />
        <NavItem href="/reports" icon={FileText} label="Reports" />
        <NavItem href="/settings" icon={Settings} label="System Settings" />
      </nav>

      <div className="p-4 border-t border-border/40">
        <UserProfileButton />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex">
      <div className="hidden lg:block w-64 fixed inset-y-0 z-50">
        <Sidebar />
      </div>

      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-background/80 backdrop-blur-md border-b border-border z-40 px-4 flex items-center justify-between">
         <div className="flex items-center gap-2">
          <Shield className="w-6 h-6 text-primary" />
          <span className="font-display font-bold text-lg">CipherGuard</span>
        </div>
        <Sheet open={isMobileOpen} onOpenChange={setIsMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon">
              <Menu className="w-5 h-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-64 border-r border-border bg-card">
            <Sidebar />
          </SheetContent>
        </Sheet>
      </div>

      <main className="flex-1 lg:ml-64 p-4 lg:p-8 pt-20 lg:pt-8 min-h-screen">
        <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {children}
        </div>
      </main>
      
      <div className="scanlines pointer-events-none fixed inset-0 z-50 opacity-5" />
    </div>
  );
}
