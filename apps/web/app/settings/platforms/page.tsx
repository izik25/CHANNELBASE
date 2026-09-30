"use client";

import { useRequireAuth } from "@/lib/auth-context";
import { useApiData } from "@/lib/hooks";
import { api, ApiError } from "@/lib/api-client";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Youtube } from "lucide-react";
import { useToast } from "@/components/ui/toast";

interface PlatformAccount {
  id: string;
  platform: string;
  channelName: string | null;
  connectedAt: string;
}

export default function PlatformsPage() {
  const { user, loading } = useRequireAuth();
  const { toast } = useToast();
  const { data, loading: dataLoading, reload } = useApiData<{ accounts: PlatformAccount[] }>(user ? "/platform-accounts" : null);

  async function connectYouTube() {
    try {
      const result = await api.get<{ authorizationUrl?: string; mock?: boolean }>("/platform-accounts/youtube/start");
      if (result.authorizationUrl) {
        window.location.href = result.authorizationUrl;
        return;
      }
      // No real YOUTUBE_CLIENT_ID configured — the API connected a mock account instantly.
      toast({ title: "Connected (mock)", description: "No real YOUTUBE_CLIENT_ID is configured, so this is a simulated connection — publishing will use the mock provider.", variant: "success" });
      reload();
    } catch (err) {
      toast({
        title: "Couldn't connect YouTube",
        description: err instanceof ApiError ? err.message : undefined,
        variant: "destructive",
      });
    }
  }

  async function disconnect(id: string) {
    await api.delete(`/platform-accounts/${id}`);
    reload();
  }

  if (loading || !user || dataLoading || !data) {
    return (
      <AppShell>
        <Skeleton className="h-64" />
      </AppShell>
    );
  }

  const youtube = data.accounts.find((a) => a.platform === "YOUTUBE");

  return (
    <AppShell>
      <h1 className="mb-6 text-2xl font-bold tracking-tight">Connected platforms</h1>
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Youtube className="h-5 w-5 text-destructive" /> YouTube
          </CardTitle>
          <CardDescription>Required to publish long videos and Shorts to YouTube.</CardDescription>
        </CardHeader>
        <CardContent>
          {youtube ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{youtube.channelName ?? youtube.id}</p>
                <Badge variant="success">Connected</Badge>
              </div>
              <Button variant="outline" size="sm" onClick={() => disconnect(youtube.id)}>
                Disconnect
              </Button>
            </div>
          ) : (
            <Button onClick={connectYouTube}>Connect YouTube</Button>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
