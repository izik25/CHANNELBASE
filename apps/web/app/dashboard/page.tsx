"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, ArrowRight, Rocket } from "lucide-react";
import { useRequireAuth } from "@/lib/auth-context";
import { api, openEventStream } from "@/lib/api-client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";

interface ChannelSummary {
  id: string;
  name: string;
  tagline: string | null;
  status: string;
  avatarAssetId: string | null;
  createdAt: string;
}

const EXAMPLE_PROMPTS = [
  "An English YouTube channel for kids aged 4-7 about two funny animals exploring science and space. 3 long episodes and 5 Shorts every week.",
  "A calm, cinematic channel about solo hiking and van life for adults 25-40, focused on mental health and slow living.",
  "A fast-paced trivia and 'did you know' facts channel for teens, punchy editing, 60-second Shorts only.",
  "A bilingual (English/Spanish) cooking channel for busy parents, 10-minute weeknight recipes.",
];

interface BuildState {
  channelId: string;
  stage: string;
  label: string;
  progress: number;
  status: "IN_PROGRESS" | "COMPLETED" | "FAILED";
  error?: string;
}

export default function DashboardPage() {
  const { user, loading } = useRequireAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [build, setBuild] = useState<BuildState | null>(null);
  const [channels, setChannels] = useState<ChannelSummary[] | null>(null);

  useEffect(() => {
    if (!user) return;
    api.get<{ channels: ChannelSummary[] }>("/channels").then((r) => setChannels(r.channels));
  }, [user]);

  async function buildChannel() {
    if (prompt.trim().length < 10) {
      toast({ title: "Tell us a bit more", description: "Describe your channel in at least a sentence or two.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const { channel } = await api.post<{ channel: ChannelSummary }>("/channels", { prompt });
      await api.post(`/channels/${channel.id}/build`);
      setBuild({ channelId: channel.id, stage: "UNDERSTANDING_CONCEPT", label: "Understanding your idea", progress: 5, status: "IN_PROGRESS" });

      const close = openEventStream(`/channels/${channel.id}/build-status`, (data) => {
        const event = JSON.parse(data) as BuildState;
        setBuild(event);
        if (event.status === "COMPLETED" && event.stage === "CHANNEL_READY") {
          close();
          setTimeout(() => router.push(`/channels/${channel.id}`), 600);
        }
        if (event.status === "FAILED") {
          close();
          toast({ title: "Channel build failed", description: event.error, variant: "destructive" });
        }
      });
    } catch (err) {
      toast({ title: "Couldn't start the build", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
      setSubmitting(false);
    }
  }

  if (loading || !user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Skeleton className="h-8 w-32" />
      </div>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">What do you want to create?</h1>
          <p className="mt-2 text-muted-foreground">Describe a channel. We&apos;ll build the brand, characters, content plan, and first episodes.</p>
        </div>

        {build ? (
          <Card className="animate-fade-in">
            <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                <Rocket className="h-7 w-7 animate-pulse-soft text-primary" />
              </div>
              <div>
                <p className="text-lg font-semibold">{build.label}</p>
                <p className="text-sm text-muted-foreground">Building your channel workspace...</p>
              </div>
              <div className="w-full max-w-sm">
                <Progress value={build.progress} />
                <p className="mt-2 text-xs text-muted-foreground">{build.progress}%</p>
              </div>
              {build.status === "FAILED" && (
                <Button variant="outline" onClick={() => setBuild(null)}>
                  Try again
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="flex flex-col gap-4 pt-6">
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="An educational YouTube channel for kids aged 4-7 about two funny animals exploring science and space..."
                className="min-h-32 text-base"
              />
              <div className="flex flex-wrap gap-2">
                {EXAMPLE_PROMPTS.map((p) => (
                  <button
                    key={p}
                    onClick={() => setPrompt(p)}
                    className="rounded-full border border-border bg-secondary/50 px-3 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    {p.length > 70 ? `${p.slice(0, 70)}...` : p}
                  </button>
                ))}
              </div>
              <Button size="lg" onClick={buildChannel} loading={submitting} className="self-center px-10">
                <Sparkles className="h-4 w-4" />
                Build Channel
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="mx-auto mt-12 max-w-5xl">
        <h2 className="mb-4 text-lg font-semibold">Your channels</h2>
        {channels === null ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        ) : channels.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No channels yet — describe one above to get started.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {channels.map((c) => (
              <Card key={c.id} className="group cursor-pointer transition-shadow hover:shadow-md" onClick={() => router.push(`/channels/${c.id}`)}>
                <CardContent className="flex flex-col gap-2 pt-6">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{c.name}</span>
                    <StatusBadge status={c.status} />
                  </div>
                  <p className="line-clamp-2 text-sm text-muted-foreground">{c.tagline ?? "No tagline yet."}</p>
                  <div className="mt-2 flex items-center gap-1 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                    Open workspace <ArrowRight className="h-3 w-3" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant = status === "ACTIVE" ? "success" : status === "BUILDING" ? "warning" : status === "ARCHIVED" ? "outline" : "secondary";
  return <Badge variant={variant}>{status.charAt(0) + status.slice(1).toLowerCase()}</Badge>;
}
