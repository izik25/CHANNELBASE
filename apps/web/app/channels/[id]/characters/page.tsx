"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { useApiData } from "@/lib/hooks";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface CharacterReference {
  kind: string;
  asset: { url: string | null };
}

interface Character {
  id: string;
  name: string;
  role: string;
  species: string;
  ageDescription: string | null;
  bodyDescription: string | null;
  faceDescription: string | null;
  clothingDescription: string | null;
  personality: string[];
  strengths: string[];
  weaknesses: string[];
  catchphrases: string[];
  speechStyle: string | null;
  consistencyRules: string[];
  doNotChangeRules: string[];
  references: CharacterReference[];
}

export default function CharactersPage() {
  const params = useParams<{ id: string }>();
  const { data, loading } = useApiData<{ characters: Character[] }>(`/channels/${params.id}/characters`);
  const [selected, setSelected] = useState<Character | null>(null);
  const characters = data?.characters ?? [];

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-56" />
        ))}
      </div>
    );
  }

  if (characters.length === 0) {
    return <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">This channel doesn&apos;t have recurring characters.</p>;
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {characters.map((c) => {
          const front = c.references.find((r) => r.kind === "FRONT")?.asset.url;
          return (
            <Card key={c.id} className="cursor-pointer overflow-hidden transition-shadow hover:shadow-md" onClick={() => setSelected(c)}>
              <div className="aspect-square w-full bg-secondary">{front && <img src={front} alt={c.name} className="h-full w-full object-cover" />}</div>
              <CardContent className="p-3">
                <p className="font-medium">{c.name}</p>
                <p className="text-xs text-muted-foreground">{c.role}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {selected.name} <span className="font-normal text-muted-foreground">— {selected.role}</span>
                </DialogTitle>
              </DialogHeader>
              <div className="mb-4 grid grid-cols-4 gap-2">
                {selected.references.map((ref) => (
                  <div key={ref.kind} className="aspect-square overflow-hidden rounded-lg bg-secondary">
                    {ref.asset.url && <img src={ref.asset.url} alt={ref.kind} className="h-full w-full object-cover" />}
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-4 text-sm">
                <div>
                  <p className="mb-1 font-medium">Appearance</p>
                  <p className="text-muted-foreground">
                    {selected.species} · {selected.ageDescription} · {selected.bodyDescription}
                  </p>
                </div>
                <div>
                  <p className="mb-1 font-medium">Personality</p>
                  <div className="flex flex-wrap gap-1.5">
                    {selected.personality.map((p) => (
                      <Badge key={p} variant="secondary">
                        {p}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-1 font-medium">Voice</p>
                  <p className="text-muted-foreground">{selected.speechStyle}</p>
                  {selected.catchphrases.length > 0 && <p className="mt-1 italic text-muted-foreground">&ldquo;{selected.catchphrases[0]}&rdquo;</p>}
                </div>
                <div>
                  <p className="mb-1 font-medium">Consistency rules</p>
                  <ul className="list-inside list-disc text-muted-foreground">
                    {selected.consistencyRules.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
