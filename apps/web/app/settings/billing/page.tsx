"use client";

import { useRequireAuth } from "@/lib/auth-context";
import { useApiData } from "@/lib/hooks";
import { api } from "@/lib/api-client";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

interface Plan {
  id: string;
  name: string;
  priceUsd: string;
  creditsPerMonth: number;
}
interface BillingResponse {
  plans: Plan[];
  creditBalance: number;
  subscription: { plan: Plan } | null;
  isMockBilling: boolean;
}

export default function BillingPage() {
  const { user, loading } = useRequireAuth();
  const { toast } = useToast();
  const { data, loading: dataLoading, reload } = useApiData<BillingResponse>(user ? "/billing" : null);

  async function subscribe(planId: string) {
    try {
      const result = await api.post<{ checkoutUrl: string }>("/billing/checkout", { planId });
      window.location.href = result.checkoutUrl;
    } catch (err) {
      toast({ title: "Checkout failed", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    }
  }

  if (loading || !user || dataLoading || !data) {
    return (
      <AppShell>
        <Skeleton className="h-96" />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Billing</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        {data.isMockBilling && <Badge variant="warning">Mock billing — no real payment provider is configured</Badge>}
      </p>

      <Card className="mb-6 max-w-sm">
        <CardHeader>
          <CardTitle>Credit balance</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold">{Math.round(data.creditBalance).toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">credits available</p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {data.plans.map((plan) => {
          const active = data.subscription?.plan.id === plan.id;
          return (
            <Card key={plan.id} className={cn(active && "border-primary ring-1 ring-primary")}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  {plan.name}
                  {active && <Badge>Current</Badge>}
                </CardTitle>
                <CardDescription>{plan.creditsPerMonth.toLocaleString()} credits / month</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <p className="text-2xl font-bold">
                  ${Number(plan.priceUsd).toFixed(0)}
                  <span className="text-sm font-normal text-muted-foreground">/mo</span>
                </p>
                <Button variant={active ? "outline" : "default"} disabled={active} onClick={() => subscribe(plan.id).then(reload)}>
                  {active ? "Current plan" : "Subscribe"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </AppShell>
  );
}
