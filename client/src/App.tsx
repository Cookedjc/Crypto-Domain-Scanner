import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useCurrentUser, type AuthUser, type AuthContextType, AuthContext } from "@/hooks/use-auth";
import Dashboard from "@/pages/dashboard";
import ScanDetails from "@/pages/scan-details";
import CbomPage from "@/pages/cbom";
import ScriptsPage from "@/pages/scripts";
import PoliciesPage from "@/pages/policies";
import ReportsPage from "@/pages/reports";
import SettingsPage from "@/pages/settings";
import KeyManagerPage from "@/pages/key-manager";
import LoginPage from "@/pages/login";
import NotFound from "@/pages/not-found";
import { useLogin, useLogout, useSwitchUser } from "@/hooks/use-auth";
import { Loader2, Shield } from "lucide-react";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/scans" component={Dashboard} />
      <Route path="/scans/:id" component={ScanDetails} />
      <Route path="/cbom" component={CbomPage} />
      <Route path="/scripts" component={ScriptsPage} />
      <Route path="/policies" component={PoliciesPage} />
      <Route path="/reports" component={ReportsPage} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/keys" component={KeyManagerPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthenticatedApp() {
  const { data: user, isLoading, isError } = useCurrentUser();
  const loginMutation = useLogin();
  const logoutMutation = useLogout();
  const switchMutation = useSwitchUser();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/20 border border-primary/30">
            <Shield className="w-6 h-6 text-primary" />
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="font-mono text-sm">Loading...</span>
          </div>
        </div>
      </div>
    );
  }

  if (isError || !user) {
    return <LoginPage />;
  }

  const authContext: AuthContextType = {
    user,
    isLoading: false,
    login: async (email, password) => {
      await loginMutation.mutateAsync({ email, password });
    },
    logout: async () => {
      await logoutMutation.mutateAsync();
    },
    switchUser: async (email, password) => {
      await switchMutation.mutateAsync({ email, password });
    },
  };

  return (
    <AuthContext.Provider value={authContext}>
      <Router />
    </AuthContext.Provider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <AuthenticatedApp />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
