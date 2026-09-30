"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useRequireAuth } from "@/lib/auth-context";
import { useApiData } from "@/lib/hooks";
import { api } from "@/lib/api-client";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { formatDate, formatRelativeTime } from "@/lib/utils";

interface Summary {
  totalUsers: number;
  totalChannels: number;
  totalEpisodes: number;
  totalCostUsd: number;
  totalCreditsCharged: number;
}
interface JobRow {
  id: string;
  jobType: string;
  status: string;
  progress: number;
  error: string | null;
  updatedAt: string;
}
interface ProviderRow {
  id: string;
  category: string;
  providerName: string;
  displayName: string | null;
  enabled: boolean;
  priority: number;
}
interface CustomerRow {
  id: string;
  email: string;
  name: string | null;
  role: string;
  createdAt: string;
  channelCount: number;
  creditBalance: number;
  planName: string;
  totalCostUsd: number;
  totalCreditsCharged: number;
  usageEventCount: number;
}
interface ChannelRow {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  user: { email: string };
  _count: { episodes: number };
  totalCostUsd: number;
  totalCreditsCharged: number;
}
interface SubscriptionRow {
  id: string;
  status: string;
  billingProvider: string;
  currentPeriodEnd: string;
  user: { email: string };
  plan: { name: string; priceUsd: string };
}
interface UsageEventRow {
  id: string;
  provider: string;
  operation: string;
  estimatedProviderCostUsd: string;
  creditsCharged: string;
  createdAt: string;
}
interface CustomerDetail {
  user: {
    id: string;
    email: string;
    name: string | null;
    role: string;
    createdAt: string;
    creditWallet: { balance: string } | null;
    subscriptions: { status: string; plan: { name: string; priceUsd: string } }[];
    channels: { id: string; name: string; status: string; createdAt: string }[];
  };
  monthly: { totalCostUsd: number; totalCredits: number; eventCount: number };
  providerBreakdown: { provider: string; totalCostUsd: number; eventCount: number }[];
  recentEvents: UsageEventRow[];
}

export default function AdminPage() {
  const { user, loading } = useRequireAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user && user.role !== "ADMIN") router.replace("/dashboard");
  }, [loading, user, router]);

  const isAdmin = user?.role === "ADMIN";
  const { data: summary } = useApiData<Summary>(isAdmin ? "/admin/usage" : null);
  const { data: jobsData, reload: reloadJobs } = useApiData<{ jobs: JobRow[] }>(isAdmin ? "/admin/jobs/failed" : null);
  const { data: providersData, reload: reloadProviders } = useApiData<{ providers: ProviderRow[] }>(isAdmin ? "/admin/providers" : null);
  const { data: customersData } = useApiData<{ users: CustomerRow[] }>(isAdmin ? "/admin/users" : null);
  const { data: channelsData } = useApiData<{ channels: ChannelRow[] }>(isAdmin ? "/admin/channels" : null);
  const { data: subscriptionsData } = useApiData<{ subscriptions: SubscriptionRow[] }>(isAdmin ? "/admin/subscriptions" : null);
  const { data: customerDetail, loading: detailLoading } = useApiData<CustomerDetail>(selectedCustomerId ? `/admin/users/${selectedCustomerId}` : null, [selectedCustomerId]);

  async function retryJob(id: string) {
    await api.post(`/admin/jobs/${id}/retry`);
    toast({ title: "Job requeued", variant: "success" });
    reloadJobs();
  }

  async function toggleProvider(p: ProviderRow) {
    await api.patch(`/admin/providers/${p.id}`, { enabled: !p.enabled });
    reloadProviders();
  }

  if (loading || !user || user.role !== "ADMIN") {
    return (
      <AppShell>
        <Skeleton className="h-64" />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Admin</h1>
      <p className="mb-6 text-sm text-muted-foreground">Customers, usage, and provider cost — never shown on the customer-facing product.</p>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Customers" value={summary?.totalUsers} />
        <StatCard label="Channels" value={summary?.totalChannels} />
        <StatCard label="Episodes" value={summary?.totalEpisodes} />
        <StatCard label="Total provider cost" value={summary ? `$${summary.totalCostUsd.toFixed(2)}` : undefined} />
        <StatCard label="Credits charged" value={summary?.totalCreditsCharged.toFixed(0)} />
      </div>

      <Tabs defaultValue="customers">
        <TabsList>
          <TabsTrigger value="customers">Customers</TabsTrigger>
          <TabsTrigger value="channels">Channels</TabsTrigger>
          <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
          <TabsTrigger value="jobs">Failed jobs</TabsTrigger>
          <TabsTrigger value="providers">Providers</TabsTrigger>
        </TabsList>

        <TabsContent value="customers">
          <Card>
            <CardContent className="overflow-x-auto pt-6">
              {!customersData ? (
                <Skeleton className="h-64" />
              ) : (
                <table className="w-full min-w-[800px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="pb-2 font-medium">Customer</th>
                      <th className="pb-2 font-medium">Plan</th>
                      <th className="pb-2 font-medium">Channels</th>
                      <th className="pb-2 font-medium">Credit balance</th>
                      <th className="pb-2 font-medium">Provider cost</th>
                      <th className="pb-2 font-medium">Credits used</th>
                      <th className="pb-2 font-medium">Joined</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {customersData.users.map((c) => (
                      <tr key={c.id} className="cursor-pointer hover:bg-secondary/50" onClick={() => setSelectedCustomerId(c.id)}>
                        <td className="py-2.5">
                          <p className="font-medium">{c.email}</p>
                          {c.role === "ADMIN" && (
                            <Badge variant="default" className="mt-0.5">
                              Admin
                            </Badge>
                          )}
                        </td>
                        <td className="py-2.5">{c.planName}</td>
                        <td className="py-2.5">{c.channelCount}</td>
                        <td className="py-2.5">{Math.round(c.creditBalance).toLocaleString()}</td>
                        <td className="py-2.5 font-medium">${c.totalCostUsd.toFixed(2)}</td>
                        <td className="py-2.5">{Math.round(c.totalCreditsCharged).toLocaleString()}</td>
                        <td className="py-2.5 text-muted-foreground">{formatDate(c.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="channels">
          <Card>
            <CardContent className="overflow-x-auto pt-6">
              {!channelsData ? (
                <Skeleton className="h-64" />
              ) : (
                <table className="w-full min-w-[700px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="pb-2 font-medium">Channel</th>
                      <th className="pb-2 font-medium">Owner</th>
                      <th className="pb-2 font-medium">Status</th>
                      <th className="pb-2 font-medium">Episodes</th>
                      <th className="pb-2 font-medium">Provider cost</th>
                      <th className="pb-2 font-medium">Credits used</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {channelsData.channels.map((c) => (
                      <tr key={c.id}>
                        <td className="py-2.5 font-medium">{c.name}</td>
                        <td className="py-2.5 text-muted-foreground">{c.user.email}</td>
                        <td className="py-2.5">
                          <Badge variant={c.status === "ACTIVE" ? "success" : "secondary"}>{c.status}</Badge>
                        </td>
                        <td className="py-2.5">{c._count.episodes}</td>
                        <td className="py-2.5 font-medium">${c.totalCostUsd.toFixed(2)}</td>
                        <td className="py-2.5">{Math.round(c.totalCreditsCharged).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="subscriptions">
          <Card>
            <CardContent className="flex flex-col divide-y divide-border pt-6">
              {!subscriptionsData ? (
                <Skeleton className="h-32" />
              ) : subscriptionsData.subscriptions.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">No subscriptions yet.</p>
              ) : (
                subscriptionsData.subscriptions.map((s) => (
                  <div key={s.id} className="flex items-center justify-between py-3">
                    <div>
                      <p className="text-sm font-medium">{s.user.email}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.plan.name} · ${Number(s.plan.priceUsd).toFixed(0)}/mo · {s.billingProvider}
                      </p>
                    </div>
                    <Badge variant={s.status === "ACTIVE" ? "success" : "secondary"}>{s.status}</Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="jobs">
          <Card>
            <CardContent className="flex flex-col divide-y divide-border pt-6">
              {!jobsData ? (
                <Skeleton className="h-32" />
              ) : jobsData.jobs.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">No failed jobs.</p>
              ) : (
                jobsData.jobs.map((job) => (
                  <div key={job.id} className="flex items-center justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{job.jobType}</p>
                      <p className="truncate text-xs text-muted-foreground">{job.error}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-xs text-muted-foreground">{formatRelativeTime(job.updatedAt)}</span>
                      <Button size="sm" variant="outline" onClick={() => retryJob(job.id)}>
                        Retry
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="providers">
          <Card>
            <CardContent className="flex flex-col divide-y divide-border pt-6">
              {!providersData ? (
                <Skeleton className="h-32" />
              ) : (
                providersData.providers.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-4 py-3">
                    <div>
                      <p className="text-sm font-medium">{p.displayName ?? p.providerName}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.category} · priority {p.priority}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={p.enabled ? "success" : "outline"}>{p.enabled ? "Enabled" : "Disabled"}</Badge>
                      <Button size="sm" variant="outline" onClick={() => toggleProvider(p)}>
                        {p.enabled ? "Disable" : "Enable"}
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!selectedCustomerId} onOpenChange={(open) => !open && setSelectedCustomerId(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{customerDetail?.user.email ?? "Customer"}</DialogTitle>
          </DialogHeader>
          {detailLoading || !customerDetail ? (
            <Skeleton className="h-64" />
          ) : (
            <div className="flex flex-col gap-5 text-sm">
              <div className="grid grid-cols-3 gap-3">
                <MiniStat label="Credit balance" value={Math.round(Number(customerDetail.user.creditWallet?.balance ?? 0)).toLocaleString()} />
                <MiniStat label="Plan" value={customerDetail.user.subscriptions[0]?.plan.name ?? "Free"} />
                <MiniStat label="Joined" value={formatDate(customerDetail.user.createdAt)} />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <MiniStat label="Cost (this month)" value={`$${customerDetail.monthly.totalCostUsd.toFixed(2)}`} />
                <MiniStat label="Credits (this month)" value={customerDetail.monthly.totalCredits.toFixed(0)} />
                <MiniStat label="Generation events" value={customerDetail.monthly.eventCount} />
              </div>

              <div>
                <p className="mb-2 font-medium">Cost by provider</p>
                {customerDetail.providerBreakdown.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No usage yet.</p>
                ) : (
                  <div className="flex flex-col gap-1">
                    {customerDetail.providerBreakdown.map((p) => (
                      <div key={p.provider} className="flex items-center justify-between text-xs">
                        <span>{p.provider}</span>
                        <span className="font-medium">
                          ${p.totalCostUsd.toFixed(2)} ({p.eventCount} events)
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <p className="mb-2 font-medium">Channels ({customerDetail.user.channels.length})</p>
                <div className="flex flex-col gap-1">
                  {customerDetail.user.channels.map((c) => (
                    <div key={c.id} className="flex items-center justify-between text-xs">
                      <span>{c.name}</span>
                      <Badge variant={c.status === "ACTIVE" ? "success" : "secondary"}>{c.status}</Badge>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 font-medium">Recent usage events</p>
                <div className="flex flex-col divide-y divide-border">
                  {customerDetail.recentEvents.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No usage events yet.</p>
                  ) : (
                    customerDetail.recentEvents.slice(0, 15).map((e) => (
                      <div key={e.id} className="flex items-center justify-between py-1.5 text-xs">
                        <span>
                          {e.provider} · {e.operation}
                        </span>
                        <span className="text-muted-foreground">
                          ${Number(e.estimatedProviderCostUsd).toFixed(3)} · {formatRelativeTime(e.createdAt)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function StatCard({ label, value }: { label: string; value?: string | number }) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-xs font-normal text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>{value === undefined ? <Skeleton className="h-7 w-12" /> : <p className="text-2xl font-semibold">{value}</p>}</CardContent>
    </Card>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-semibold">{value}</p>
    </div>
  );
}
