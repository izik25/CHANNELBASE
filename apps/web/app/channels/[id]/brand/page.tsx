"use client";

import { useParams } from "next/navigation";
import { useApiData } from "@/lib/hooks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface BrandStyle {
  primaryColors: string[];
  secondaryColors: string[];
  typography: string;
  illustrationStyle: string;
  thumbnailRules: string[];
}

interface BrandBible {
  brandName: string;
  tagline: string;
  brandPersonality: string[];
  logoPrompt: string;
  avatarPrompt: string;
  bannerPrompt: string;
  thumbnailSystemDescription: string;
  brandRules: string[];
  doNotUseRules: string[];
  style: BrandStyle;
}

interface Asset {
  id: string;
  type: string;
  url: string | null;
}

export default function BrandPage() {
  const params = useParams<{ id: string }>();
  const { data: brandData, loading: brandLoading } = useApiData<{ brand: { data: BrandBible } | null }>(`/channels/${params.id}/brand`);
  const { data: assetData, loading: assetsLoading } = useApiData<{ assets: Asset[] }>(`/assets?channelId=${params.id}`);

  const brand = brandData?.brand?.data;
  const assetOf = (type: string) => assetData?.assets.find((a) => a.type === type)?.url ?? undefined;

  if (brandLoading || assetsLoading) return <Skeleton className="h-96" />;
  if (!brand) return <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Brand not generated yet.</p>;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <BrandAssetCard label="Logo" url={assetOf("LOGO")} aspect="aspect-square" />
        <BrandAssetCard label="Avatar" url={assetOf("AVATAR")} aspect="aspect-square" />
        <BrandAssetCard label="Banner" url={assetOf("BANNER")} aspect="aspect-video" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Colors & typography</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex gap-2">
              {brand.style.primaryColors.map((color) => (
                <div key={color} className="flex flex-col items-center gap-1">
                  <div className="h-10 w-10 rounded-full border border-border" style={{ backgroundColor: color }} />
                  <span className="text-[10px] text-muted-foreground">{color}</span>
                </div>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">{brand.style.typography}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Personality</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-1.5">
            {brand.brandPersonality.map((p) => (
              <Badge key={p} variant="secondary">
                {p}
              </Badge>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Visual style</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
          <p>{brand.style.illustrationStyle}</p>
          <p className="font-medium text-foreground">Thumbnail system</p>
          <p>{brand.thumbnailSystemDescription}</p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Always do</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-inside list-disc text-sm text-muted-foreground">
              {brand.brandRules.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Never do</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-inside list-disc text-sm text-muted-foreground">
              {brand.doNotUseRules.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function BrandAssetCard({ label, url, aspect }: { label: string; url?: string; aspect: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className={`${aspect} w-full overflow-hidden rounded-lg bg-secondary`}>{url && <img src={url} alt={label} className="h-full w-full object-cover" />}</div>
        <p className="mt-2 text-sm font-medium">{label}</p>
      </CardContent>
    </Card>
  );
}
