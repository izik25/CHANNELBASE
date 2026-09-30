"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { useApiData } from "@/lib/hooks";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ImageIcon, Music, Video, FileText } from "lucide-react";

interface Asset {
  id: string;
  type: string;
  status: string;
  url: string | null;
  mimeType: string | null;
  createdAt: string;
}

const FILTERS = [
  { label: "All", value: "" },
  { label: "Images", value: "IMAGE" },
  { label: "Video", value: "VIDEO" },
  { label: "Voice", value: "VOICE" },
  { label: "Music", value: "MUSIC" },
  { label: "Thumbnails", value: "THUMBNAIL" },
  { label: "Brand", value: "LOGO,AVATAR,BANNER" },
];

export default function AssetsPage() {
  const params = useParams<{ id: string }>();
  const [filter, setFilter] = useState("");
  const singleTypeFilter = filter && !filter.includes(",") ? filter : "";
  const { data, loading } = useApiData<{ assets: Asset[] }>(`/assets?channelId=${params.id}${singleTypeFilter ? `&type=${singleTypeFilter}` : ""}`, [filter]);

  const assets = data?.assets ?? [];
  const filtered = filter.includes(",") ? assets.filter((a) => filter.split(",").includes(a.type)) : assets;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Button key={f.value} size="sm" variant={filter === f.value ? "default" : "outline"} onClick={() => setFilter(f.value)}>
            {f.label}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No assets yet in this category.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {filtered.map((asset) => (
            <Card key={asset.id} className="overflow-hidden">
              <div className="relative aspect-square w-full bg-secondary">
                {asset.mimeType?.startsWith("image/") && asset.url ? (
                  <img src={asset.url} alt={asset.type} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                    <AssetTypeIcon mimeType={asset.mimeType} />
                  </div>
                )}
                <Badge
                  variant={asset.status === "READY" ? "success" : asset.status === "FAILED" ? "destructive" : "secondary"}
                  className={cn("absolute right-1.5 top-1.5 text-[9px]")}
                >
                  {asset.status}
                </Badge>
              </div>
              <CardContent className="p-2">
                <p className="truncate text-[11px] text-muted-foreground">{asset.type}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function AssetTypeIcon({ mimeType }: { mimeType: string | null }) {
  if (mimeType?.startsWith("video")) return <Video className="h-6 w-6" />;
  if (mimeType?.startsWith("audio")) return <Music className="h-6 w-6" />;
  if (mimeType?.includes("json")) return <FileText className="h-6 w-6" />;
  return <ImageIcon className="h-6 w-6" />;
}
