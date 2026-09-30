"use client";

import { useParams, useRouter } from "next/navigation";
import { Film, Palette, Users, CalendarDays, Coins, PlayCircle } from "lucide-react";
import { useApiData } from "@/lib/hooks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

interface Episode {
  id: string;
  title: string;
  status: string;
  format: string;
  targetPublishDate: string | null;
  updatedAt: string;
}

interface ContentResponse {
  episodes: Episode[];
}

interface UsageResponse {
  totalCredits: number;
  eventCount: number;
}

const IN_PRODUCTION_STATUSES = new Set(["SCRIPTING", "SCRIPT_REVIEW", "SCENE_BREAKDOWN", "ASSET_GENERATION", "VOICE_GENERATION", "VIDEO_GENERATION", "ASSEMBLY", "QUALITY_REVIEW"]);

export default function ChannelOverviewPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data: content, loading } = useApiData<ContentResponse>(`/channels/${params.id}/content`);
  const { data: usage } = useApiData<UsageResponse>(`/usage/channels/${params.id}`);

  const episodes = content?.episodes ?? [];
  const inProduction = episodes.filter((e) => IN_PRODUCTION_STATUSES.has(e.status));
  const scheduled = episodes.filter((e) => e.status === "SCHEDULED");
  const published = episodes.filter((e) => e.status === "PUBLISHED");
  const nextPlanned = episodes
    .filter((e) => e.targetPublishDate)
    .sort((a, b) => new Date(a.targetPublishDate!).getTime() - new Date(b.targetPublishDate!).getTime())[0];

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={<PlayCircle className="h-4 w-4" />} label="In production" value={loading ? undefined : inProduction.length} />
        <StatCard icon={<CalendarDays className="h-4 w-4" />} label="Scheduled" value={loading ? undefined : scheduled.length} />
        <StatCard icon={<Film className="h-4 w-4" />} label="Published" value={loading ? undefined : published.length} />
        <StatCard icon={<Coins className="h-4 w-4" />} label="Credits used" value={usage ? Math.round(usage.totalCredits).toLocaleString() : undefined} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Next up</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-16" />
            ) : nextPlanned ? (
              <button onClick={() => router.push(`/episodes/${nextPlanned.id}`)} className="flex w-full items-center justify-between rounded-lg border border-border p-4 text-left hover:bg-secondary/50">
                <div>
                  <p className="font-medium">{nextPlanned.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {nextPlanned.format.replace("_", " ")} · Target: {nextPlanned.targetPublishDate ? formatDate(nextPlanned.targetPublishDate) : "unscheduled"}
                  </p>
                </div>
                <Badge>{nextPlanned.status.replace("_", " ")}</Badge>
              </button>
            ) : (
              <p className="text-sm text-muted-foreground">No episodes planned yet — check the Calendar tab.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick links</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <QuickLink icon={<Palette className="h-4 w-4" />} label="Brand" href={`/channels/${params.id}/brand`} />
            <QuickLink icon={<Users className="h-4 w-4" />} label="Characters" href={`/channels/${params.id}/characters`} />
            <QuickLink icon={<CalendarDays className="h-4 w-4" />} label="Content Plan" href={`/channels/${params.id}/calendar`} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col divide-y divide-border">
          {loading ? (
            <Skeleton className="h-24" />
          ) : episodes.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">No episodes yet.</p>
          ) : (
            episodes.slice(0, 6).map((ep) => (
              <button key={ep.id} onClick={() => router.push(`/episodes/${ep.id}`)} className="flex items-center justify-between py-3 text-left hover:opacity-80">
                <div>
                  <p className="text-sm font-medium">{ep.title}</p>
                  <p className="text-xs text-muted-foreground">{ep.format.replace("_", " ")}</p>
                </div>
                <Badge variant="secondary">{ep.status.replace("_", " ")}</Badge>
              </button>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value?: string | number }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 pt-6">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {icon}
          {label}
        </div>
        {value === undefined ? <Skeleton className="h-7 w-12" /> : <p className="text-2xl font-semibold">{value}</p>}
      </CardContent>
    </Card>
  );
}

function QuickLink({ icon, label, href }: { icon: React.ReactNode; label: string; href: string }) {
  return (
    <a href={href} className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm font-medium transition-colors hover:bg-secondary/50">
      {icon}
      {label}
    </a>
  );
}
