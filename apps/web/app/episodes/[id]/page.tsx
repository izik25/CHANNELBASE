"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink, Play, RefreshCw, Send, Video, ImageIcon, Mic, Music } from "lucide-react";
import { useRequireAuth } from "@/lib/auth-context";
import { useApiData } from "@/lib/hooks";
import { api, ApiError, openEventStream } from "@/lib/api-client";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { formatDuration } from "@/lib/utils";
import { EPISODE_PIPELINE_ORDER, type EpisodeStatus } from "@channelbase/shared";

interface Asset {
  id: string;
  type: string;
  status: string;
  url: string | null;
  sceneId: string | null;
  mimeType: string | null;
}

interface Scene {
  id: string;
  sceneNumber: number;
  purpose: string;
  action: string;
  emotion: string;
  durationEstimateSeconds: number;
}

interface EpisodeDetail {
  episode: {
    id: string;
    channelId: string;
    title: string;
    status: EpisodeStatus;
    format: string;
    hook: string | null;
    summary: string | null;
    lastError: string | null;
    metadata: { recommendedTitle?: string; description?: string; hashtags?: string[] } | null;
  };
  scenes: Scene[];
  assets: Asset[];
  qualityReview: { overallScore: number; checks: { key: string; score: number; explanation: string }[] } | null;
  cost: { totalCostUsd: number; totalCredits: number };
  publishedContent: { platform: string; url: string | null; status: string; publishedAt: string | null } | null;
}

const STARTABLE = new Set(["IDEA", "PLANNED", "FAILED"]);

export default function EpisodeDetailPage() {
  const { user, loading: authLoading } = useRequireAuth();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const { data, loading, reload } = useApiData<EpisodeDetail>(user ? `/episodes/${params.id}` : null);
  const [starting, setStarting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [liveProgress, setLiveProgress] = useState<{ status: string; progress: number; message?: string } | null>(null);

  // Publishing is a quick one-shot action (not the multi-stage production pipeline), so
  // it just polls the episode directly rather than reusing the /progress SSE stream —
  // that stream already treats READY as terminal, which is exactly the state we're
  // publishing FROM, not something we want ending the stream early.
  useEffect(() => {
    if (!publishing) return;
    const interval = setInterval(async () => {
      const res = await api.get<EpisodeDetail>(`/episodes/${params.id}`);
      if (["PUBLISHED", "SCHEDULED", "FAILED"].includes(res.episode.status)) {
        setPublishing(false);
        reload();
        if (res.episode.status === "PUBLISHED") toast({ title: "Published!", variant: "success" });
        if (res.episode.status === "FAILED") toast({ title: "Publish failed", description: res.episode.lastError ?? undefined, variant: "destructive" });
      }
    }, 2000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publishing]);

  useEffect(() => {
    if (!user || !data) return;
    if (["READY", "PUBLISHED", "FAILED"].includes(data.episode.status)) return;
    const close = openEventStream(`/episodes/${params.id}/progress`, (raw) => {
      const event = JSON.parse(raw);
      setLiveProgress(event);
      if (["READY", "PUBLISHED", "FAILED"].includes(event.status)) {
        close();
        reload();
      }
    });
    return close;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, data?.episode.status]);

  async function startProduction() {
    setStarting(true);
    try {
      await api.post(`/episodes/${params.id}/generate`);
      toast({ title: "Production started", variant: "success" });
      reload();
    } catch (err) {
      toast({ title: "Couldn't start production", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setStarting(false);
    }
  }

  async function publish() {
    setPublishing(true);
    try {
      await api.post(`/episodes/${params.id}/publish`);
      toast({ title: "Publishing...", description: "This can take a few seconds.", variant: "success" });
      reload();
    } catch (err) {
      setPublishing(false);
      if (err instanceof ApiError && err.status === 400) {
        toast({ title: "Connect a platform first", description: "Go to Settings → Platforms to connect YouTube before publishing.", variant: "destructive" });
      } else {
        toast({ title: "Couldn't publish", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
      }
    }
  }

  async function regenerateAsset(assetId: string) {
    try {
      await api.post(`/episodes/${params.id}/assets/${assetId}/regenerate`);
      toast({ title: "Regenerating asset...", variant: "success" });
      reload();
    } catch (err) {
      toast({ title: "Couldn't regenerate", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    }
  }

  if (authLoading || !user || loading || !data) {
    return (
      <AppShell>
        <Skeleton className="h-96" />
      </AppShell>
    );
  }

  const { episode, scenes, assets, qualityReview, cost, publishedContent } = data;
  const pipelineIndex = EPISODE_PIPELINE_ORDER.indexOf(episode.status);
  const pipelineProgress = pipelineIndex >= 0 ? Math.round((pipelineIndex / (EPISODE_PIPELINE_ORDER.length - 1)) * 100) : 0;
  const finalAsset = assets.find((a) => a.type === "FINAL_VIDEO");
  const thumbnail = assets.find((a) => a.type === "THUMBNAIL");

  return (
    <AppShell>
      <Button variant="ghost" size="sm" className="mb-4" onClick={() => router.push(`/channels/${episode.channelId}/content`)}>
        <ArrowLeft className="h-4 w-4" /> Back to content
      </Button>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{episode.metadata?.recommendedTitle ?? episode.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{episode.hook}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={episode.status === "READY" ? "success" : episode.status === "FAILED" ? "destructive" : "secondary"}>{episode.status.replace("_", " ")}</Badge>
          {STARTABLE.has(episode.status) && (
            <Button onClick={startProduction} loading={starting}>
              <Play className="h-4 w-4" /> {episode.status === "FAILED" ? "Retry production" : "Start production"}
            </Button>
          )}
          {episode.status === "READY" && (
            <Button onClick={publish} loading={publishing}>
              <Send className="h-4 w-4" /> Publish
            </Button>
          )}
        </div>
      </div>

      {episode.lastError && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{episode.lastError}</div>
      )}

      {publishedContent && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-success/30 bg-success/5 p-3 text-sm">
          <span>
            Published to {publishedContent.platform}
            {publishedContent.status === "SCHEDULED" ? " (scheduled)" : ""}
          </span>
          {publishedContent.url && (
            <a href={publishedContent.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-medium text-primary hover:underline">
              View <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      )}

      {!["IDEA", "PLANNED", "READY", "PUBLISHED", "FAILED"].includes(episode.status) && (
        <Card className="mb-6">
          <CardContent className="flex flex-col gap-2 py-5">
            <p className="text-sm font-medium">{liveProgress?.message ?? "Producing episode..."}</p>
            <Progress value={liveProgress?.progress ?? pipelineProgress} />
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          {finalAsset && (
            <Card>
              <CardHeader>
                <CardTitle>Final video</CardTitle>
              </CardHeader>
              <CardContent>
                {finalAsset.mimeType === "video/mp4" && finalAsset.url ? (
                  <video src={finalAsset.url} controls className="w-full rounded-lg" />
                ) : (
                  <div className="flex flex-col items-center gap-2 rounded-lg bg-secondary p-8 text-center text-sm text-muted-foreground">
                    <Video className="h-6 w-6" />
                    Composed (mock manifest — no playable file since ffmpeg/real providers aren&apos;t configured)
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Scenes</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col divide-y divide-border">
              {scenes.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">No scenes yet — start production to generate the script and scene breakdown.</p>
              ) : (
                scenes.map((scene) => {
                  const sceneAssets = assets.filter((a) => a.sceneId === scene.id);
                  return (
                    <div key={scene.id} className="flex flex-col gap-2 py-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">
                          Scene {scene.sceneNumber}: {scene.purpose}
                        </p>
                        <span className="text-xs text-muted-foreground">{formatDuration(scene.durationEstimateSeconds)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{scene.action}</p>
                      <div className="flex flex-wrap gap-2">
                        {sceneAssets.map((asset) => (
                          <button
                            key={asset.id}
                            onClick={() => regenerateAsset(asset.id)}
                            title="Click to regenerate"
                            className="group flex items-center gap-1 rounded-full border border-border bg-secondary/50 px-2 py-1 text-[10px] hover:bg-secondary"
                          >
                            <AssetIcon type={asset.type} />
                            {asset.type}
                            <Badge variant={asset.status === "READY" ? "success" : asset.status === "FAILED" ? "destructive" : "secondary"} className="ml-1 text-[9px]">
                              {asset.status}
                            </Badge>
                            <RefreshCw className="h-2.5 w-2.5 opacity-0 transition-opacity group-hover:opacity-100" />
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          {thumbnail?.url && (
            <Card>
              <CardHeader>
                <CardTitle>Thumbnail</CardTitle>
              </CardHeader>
              <CardContent>
                <img src={thumbnail.url} alt="Thumbnail" className="w-full rounded-lg" />
              </CardContent>
            </Card>
          )}

          {qualityReview && (
            <Card>
              <CardHeader>
                <CardTitle>Quality review</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold">{qualityReview.overallScore}</span>
                  <span className="text-sm text-muted-foreground">/ 100</span>
                </div>
                {qualityReview.checks.map((c) => (
                  <div key={c.key} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{c.key}</span>
                    <span className="font-medium">{c.score}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Credits used</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{cost.totalCredits.toFixed(0)}</p>
              <p className="text-xs text-muted-foreground">credits charged for this episode</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function AssetIcon({ type }: { type: string }) {
  if (type === "VIDEO") return <Video className="h-3 w-3" />;
  if (type === "VOICE") return <Mic className="h-3 w-3" />;
  if (type === "MUSIC") return <Music className="h-3 w-3" />;
  return <ImageIcon className="h-3 w-3" />;
}
