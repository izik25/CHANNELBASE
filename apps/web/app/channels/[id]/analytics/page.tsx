"use client";

import { BarChart3 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function AnalyticsPage() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary">
          <BarChart3 className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="font-medium">No analytics yet</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Once episodes are published to YouTube, performance data (views, retention, CTR, revenue) will appear here and feed the
          channel&apos;s Performance Learning insights.
        </p>
      </CardContent>
    </Card>
  );
}
