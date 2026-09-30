"use client";

import { useParams, useRouter } from "next/navigation";
import { AlertTriangle, Clapperboard, Play } from "lucide-react";
import { useApiData } from "@/lib/hooks";
import { api } from "@/lib/api-client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";

interface Episode {
  id: string;
  title: string;
  status: string;
  format: string;
  targetPublishDate: string | null;
}

const COLUMNS: { key: string; label: string; statuses: string[] }[] = [
  { key: "ideas", label: "Ideas", statuses: ["IDEA", "PLANNED"] },
  { key: "writing", label: "Writing", statuses: ["SCRIPTING", "SCRIPT_REVIEW", "SCENE_BREAKDOWN"] },
  { key: "production", label: "Production", statuses: ["ASSET_GENERATION", "VOICE_GENERATION", "VIDEO_GENERATION", "ASSEMBLY"] },
  { key: "review", label: "Review", statuses: ["QUALITY_REVIEW"] },
  { key: "ready", label: "Ready", statuses: ["READY", "SCHEDULED"] },
  { key: "published", label: "Published", statuses: ["PUBLISHED"] },
];

export default function ContentPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const { data, loading, reload } = useApiData<{ episodes: Episode[] }>(`/channels/${params.id}/content`);
  const episodes = data?.episodes ?? [];
  const failed = episodes.filter((e) => e.status === "FAILED");

  async function startProduction(id: string) {
    try {
      await api.post(`/episodes/${id}/generate`);
      toast({ title: "Production started", description: "Watch progress on the episode page.", variant: "success" });
      reload();
      router.push(`/episodes/${id}`);
    } catch (err) {
      toast({ title: "Couldn't start production", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {failed.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {failed.length} episode{failed.length > 1 ? "s" : ""} failed and need attention.
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-6">
          {COLUMNS.map((col) => {
            const items = episodes.filter((e) => col.statuses.includes(e.status));
            return (
              <div key={col.key} className="flex flex-col gap-2">
                <div className="flex items-center justify-between px-1">
                  <p className="text-sm font-semibold">{col.label}</p>
                  <span className="text-xs text-muted-foreground">{items.length}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {items.map((ep) => (
                    <Card key={ep.id} className="cursor-pointer hover:shadow-md" onClick={() => router.push(`/episodes/${ep.id}`)}>
                      <CardContent className="flex flex-col gap-2 p-3">
                        <div className="flex h-16 w-full items-center justify-center rounded-md bg-secondary text-muted-foreground">
                          <Clapperboard className="h-5 w-5" />
                        </div>
                        <p className="line-clamp-2 text-xs font-medium leading-snug">{ep.title}</p>
                        <div className="flex items-center justify-between">
                          <Badge variant="outline" className="text-[10px]">
                            {ep.format.replace("_", " ")}
                          </Badge>
                          {col.key === "ideas" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-[10px]"
                              onClick={(e) => {
                                e.stopPropagation();
                                startProduction(ep.id);
                              }}
                            >
                              <Play className="h-3 w-3" /> Start
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {items.length === 0 && <div className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">Empty</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
