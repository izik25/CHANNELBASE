"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Sparkles } from "lucide-react";

export default function RootPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(user ? "/dashboard" : "/login");
  }, [loading, user, router]);

  return (
    <div className="flex h-screen items-center justify-center bg-gradient-hero">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Sparkles className="h-6 w-6 animate-pulse-soft text-primary" />
        <p className="text-sm">Loading ChannelBase...</p>
      </div>
    </div>
  );
}
