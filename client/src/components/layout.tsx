import { Link, useLocation } from "wouter";
import { Shield, Activity, Lock, Settings, LayoutDashboard, Menu, FileJson, Terminal } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

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
        <NavItem href="/settings" icon={Settings} label="System Settings" />
      </nav>

      <div className="p-4 border-t border-border/40">
        <div className="bg-muted/30 rounded-lg p-3 border border-border/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-primary to-blue-500" />
            <div>
              <p className="text-sm font-medium">System Admin</p>
              <p className="text-xs text-muted-foreground font-mono">root@localhost</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop Sidebar */}
      <div className="hidden lg:block w-64 fixed inset-y-0 z-50">
        <Sidebar />
      </div>

      {/* Mobile Header */}
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

      {/* Main Content */}
      <main className="flex-1 lg:ml-64 p-4 lg:p-8 pt-20 lg:pt-8 min-h-screen">
        <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {children}
        </div>
      </main>
      
      {/* Visual Effect */}
      <div className="scanlines pointer-events-none fixed inset-0 z-50 opacity-5" />
    </div>
  );
}
