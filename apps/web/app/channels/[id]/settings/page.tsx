"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useApiData } from "@/lib/hooks";
import { api, ApiError } from "@/lib/api-client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { Skeleton } from "@/components/ui/skeleton";

interface ChannelDetail {
  channel: {
    id: string;
    language: string;
    countryTarget: string | null;
    approvalMode: "MANUAL" | "AUTOPILOT";
    monthlySpendLimitUsd: string | null;
  };
}

export default function SettingsPage() {
  const params = useParams<{ id: string }>();
  const { toast } = useToast();
  const { data, loading, reload } = useApiData<ChannelDetail>(`/channels/${params.id}`);
  const [language, setLanguage] = useState("en");
  const [spendLimit, setSpendLimit] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data?.channel) {
      setLanguage(data.channel.language);
      setSpendLimit(data.channel.monthlySpendLimitUsd ?? "");
    }
  }, [data]);

  async function save() {
    setSaving(true);
    try {
      await api.patch(`/channels/${params.id}/settings`, {
        language,
        monthlySpendLimitUsd: spendLimit ? Number(spendLimit) : null,
      });
      toast({ title: "Settings saved", variant: "success" });
      reload();
    } catch (err) {
      toast({ title: "Couldn't save settings", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function requestAutopilot() {
    try {
      await api.patch(`/channels/${params.id}/settings`, { approvalMode: "AUTOPILOT" });
    } catch (err) {
      toast({
        title: "Autopilot is experimental",
        description: err instanceof ApiError ? err.message : "Not available yet.",
        variant: "destructive",
      });
    }
  }

  if (loading || !data) return <Skeleton className="h-96" />;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
          <CardDescription>Language and localization for this channel.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="language">Language</Label>
            <Input id="language" value={language} onChange={(e) => setLanguage(e.target.value)} className="max-w-40" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="spend">Monthly spend limit (USD)</Label>
            <Input id="spend" type="number" min={0} value={spendLimit} onChange={(e) => setSpendLimit(e.target.value)} placeholder="No limit" className="max-w-40" />
          </div>
          <Button onClick={save} loading={saving} className="self-start">
            Save changes
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Approval mode
            <Badge variant="warning">Autopilot experimental</Badge>
          </CardTitle>
          <CardDescription>
            Manual: every episode waits for you before publishing. Autopilot would publish without review — disabled until the
            publishing safety review flow ships.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <Badge variant={data.channel.approvalMode === "MANUAL" ? "default" : "secondary"}>Manual (current)</Badge>
          <Button variant="outline" size="sm" onClick={requestAutopilot}>
            Try enabling Autopilot
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
