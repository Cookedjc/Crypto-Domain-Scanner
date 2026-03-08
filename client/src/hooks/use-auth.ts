import { createContext, useContext } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export interface AuthUser {
  id: number;
  email: string;
  displayName: string;
  userType: string;
  isActive: boolean;
  lastLogin: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  switchUser: (email: string, password: string) => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}

export function useCurrentUser() {
  return useQuery<AuthUser>({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      const res = await fetch("/api/auth/me");
      if (!res.ok) throw new Error("Not authenticated");
      return res.json();
    },
    retry: false,
    staleTime: 1000 * 60 * 5,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Login failed");
      }
      return res.json();
    },
    onSuccess: (user) => {
      queryClient.setQueryData(["/api/auth/me"], user);
      queryClient.invalidateQueries();
      toast({
        title: "Welcome back",
        description: `Logged in as ${user.displayName}`,
      });
    },
    onError: (error) => {
      toast({
        title: "Login Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (!res.ok) throw new Error("Logout failed");
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/me"], null);
      queryClient.clear();
    },
  });
}

export function useSwitchUser() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const res = await fetch("/api/auth/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to switch user");
      }
      return res.json();
    },
    onSuccess: (user) => {
      queryClient.setQueryData(["/api/auth/me"], user);
      queryClient.invalidateQueries();
      toast({
        title: "Profile Switched",
        description: `Now logged in as ${user.displayName}`,
      });
    },
    onError: (error) => {
      toast({
        title: "Switch Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useAvailableUsers() {
  return useQuery<AuthUser[]>({
    queryKey: ["/api/auth/users"],
    queryFn: async () => {
      const res = await fetch("/api/auth/users");
      if (!res.ok) throw new Error("Failed to fetch users");
      return res.json();
    },
  });
}
