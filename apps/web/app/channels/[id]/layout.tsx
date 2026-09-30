"use client";

import Link from "next/link";
import { usePathname, useParams } from "next/navigation";
import { useRequireAuth } from "@/lib/auth-context";
import { useApiData } from "@/lib/hooks";
import { AppShell } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ChannelDetail {
  channel: { id: string; name: string; tagline: string | null; status: string };
}

const TABS = [
  { href: "", label: "Overview" },
  { href: "/content", label: "Content" },
  { href: "/calendar", label: "Calendar" },
  { href: "/characters", label: "Characters" },
  { href: "/brand", label: "Brand" },
  { href: "/assets", label: "Assets" },
  { href: "/analytics", label: "Analytics" },
  { href: "/settings", label: "Settings" },
];

export default function ChannelLayout({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useRequireAuth();
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const { data, loading } = useApiData<ChannelDetail>(user ? `/channels/${params.id}` : null);

  const base = `/channels/${params.id}`;
  const activeTab = TABS.slice().reverse().find((t) => pathname === `${base}${t.href}` || (t.href !== "" && pathname.startsWith(`${base}${t.href}`)))?.href ?? "";

  if (authLoading || !user) return null;

  return (
    <AppShell>
      <div className="mb-6">
        {loading || !data ? (
          <Skeleton className="h-9 w-64" />
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{data.channel.name}</h1>
            <Badge variant={data.channel.status === "ACTIVE" ? "success" : "secondary"}>{data.channel.status}</Badge>
          </div>
        )}
        {data?.channel.tagline && <p className="mt-1 text-sm text-muted-foreground">{data.channel.tagline}</p>}
      </div>

      <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-border pb-px">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={`${base}${tab.href}`}
            className={cn(
              "whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              activeTab === tab.href ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {children}
    </AppShell>
  );
}
