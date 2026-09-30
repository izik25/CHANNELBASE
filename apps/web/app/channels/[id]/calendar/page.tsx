"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useApiData } from "@/lib/hooks";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface PlanItem {
  id: string;
  titleIdea: string;
  format: string;
  targetPublishDate: string;
  episode: { id: string; status: string } | null;
}

interface Plan {
  id: string;
  items: PlanItem[];
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function CalendarPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [cursor, setCursor] = useState(() => new Date());
  const { data, loading } = useApiData<{ plans: Plan[] }>(`/channels/${params.id}/calendar`);

  const items = useMemo(() => (data?.plans ?? []).flatMap((p) => p.items), [data]);

  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
  const gridStart = new Date(monthStart);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay());
  const days: Date[] = [];
  for (let d = new Date(gridStart); days.length < 42; d.setDate(d.getDate() + 1)) {
    days.push(new Date(d));
  }

  const itemsByDay = useMemo(() => {
    const map = new Map<string, PlanItem[]>();
    for (const item of items) {
      const key = new Date(item.targetPublishDate).toDateString();
      map.set(key, [...(map.get(key) ?? []), item]);
    }
    return map;
  }, [items]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h2>
        <div className="flex gap-1">
          <Button variant="outline" size="icon" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={() => setCursor(new Date())}>
            Today
          </Button>
          <Button variant="outline" size="icon" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-96" />
      ) : (
        <Card>
          <CardContent className="p-2 sm:p-4">
            <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-border bg-border text-xs">
              {WEEKDAYS.map((w) => (
                <div key={w} className="bg-secondary p-2 text-center font-medium text-muted-foreground">
                  {w}
                </div>
              ))}
              {days.map((day) => {
                const inMonth = day.getMonth() === cursor.getMonth();
                const dayItems = itemsByDay.get(day.toDateString()) ?? [];
                return (
                  <div key={day.toISOString()} className={cn("min-h-24 bg-background p-1.5", !inMonth && "opacity-40")}>
                    <p className="mb-1 text-[11px] text-muted-foreground">{day.getDate()}</p>
                    <div className="flex flex-col gap-1">
                      {dayItems.slice(0, 3).map((item) => (
                        <button
                          key={item.id}
                          onClick={() => item.episode && router.push(`/episodes/${item.episode.id}`)}
                          className="w-full truncate rounded bg-primary/10 px-1.5 py-0.5 text-left text-[10px] font-medium text-primary hover:bg-primary/20"
                          title={item.titleIdea}
                        >
                          {item.titleIdea}
                        </button>
                      ))}
                      {dayItems.length > 3 && <span className="text-[10px] text-muted-foreground">+{dayItems.length - 3} more</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        <Badge variant="secondary">{items.filter((i) => i.format === "LONG_VIDEO").length} long videos planned</Badge>
        <Badge variant="secondary">{items.filter((i) => i.format === "SHORT").length} Shorts planned</Badge>
      </div>
    </div>
  );
}
