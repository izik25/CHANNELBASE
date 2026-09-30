"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles, LogOut, ShieldCheck, Coins } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const router = useRouter();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Sparkles className="h-4 w-4" />
            </span>
            ChannelBase
          </Link>
          <div className="flex items-center gap-3">
            {user && (
              <div className="hidden items-center gap-1.5 rounded-full border border-border bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground sm:flex">
                <Coins className="h-3.5 w-3.5 text-accent" />
                {Math.round(user.creditBalance).toLocaleString()} credits
              </div>
            )}
            {user?.role === "ADMIN" && (
              <Button variant="ghost" size="sm" onClick={() => router.push("/admin")}>
                <ShieldCheck className="h-4 w-4" />
                Admin
              </Button>
            )}
            <span className="hidden text-sm text-muted-foreground sm:inline">{user?.email}</span>
            <Button
              variant="ghost"
              size="icon"
              onClick={async () => {
                await logout();
                router.push("/login");
              }}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>
      <main className="container py-8">{children}</main>
    </div>
  );
}
