import { useState } from "react";
import { Shield, Loader2, Eye, EyeOff, Lock, Mail } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useLogin } from "@/hooks/use-auth";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const login = useLogin();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    login.mutate({ email, password });
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="scanlines pointer-events-none fixed inset-0 z-50 opacity-5" />
      
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-xl bg-primary/20 border border-primary/30 mb-6">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-display font-bold tracking-tight">
            Cipher<span className="text-primary">Guard</span>
          </h1>
          <p className="text-sm text-muted-foreground font-mono mt-2">PQC Analysis Engine v1.0</p>
        </div>

        <div className="bg-card rounded-xl border border-border/50 shadow-2xl shadow-black/30 p-8">
          <div className="mb-6">
            <h2 className="text-xl font-semibold">Sign In</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Enter your credentials to access the platform.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="font-mono text-xs uppercase text-muted-foreground">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="email"
                  placeholder="admin@example.com"
                  className="pl-9 font-mono"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  data-testid="input-login-email"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="font-mono text-xs uppercase text-muted-foreground">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  className="pl-9 pr-10 font-mono"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  data-testid="input-login-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
                  data-testid="button-toggle-login-password"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {login.isError && (
              <div className="bg-rose-500/10 border border-rose-500/30 rounded-lg p-3 text-sm text-rose-400">
                {login.error?.message || "Login failed"}
              </div>
            )}

            <Button
              type="submit"
              className="w-full bg-primary font-bold tracking-wide"
              disabled={login.isPending || !email || !password}
              data-testid="button-login-submit"
            >
              {login.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Authenticating...
                </>
              ) : (
                "Sign In"
              )}
            </Button>
          </form>

          <div className="mt-6 pt-4 border-t border-border/50">
            <p className="text-xs text-muted-foreground text-center">
              First login sets your password. Contact an admin to create your account.
            </p>
          </div>
        </div>

        <p className="text-xs text-center text-muted-foreground/50 font-mono">
          Post-Quantum Cryptography Security Platform
        </p>
      </div>
    </div>
  );
}
