"use client";

import * as React from "react";
import { CheckCircle2, XCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ToastMessage {
  id: number;
  title: string;
  description?: string;
  variant?: "default" | "success" | "destructive";
}

interface ToastContextValue {
  toast: (message: Omit<ToastMessage, "id">) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = React.useState<ToastMessage[]>([]);

  const toast = React.useCallback((message: Omit<ToastMessage, "id">) => {
    const id = Date.now() + Math.random();
    setMessages((prev) => [...prev, { ...message, id }]);
    setTimeout(() => setMessages((prev) => prev.filter((m) => m.id !== id)), 5000);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2">
        {messages.map((m) => (
          <div
            key={m.id}
            className={cn(
              "animate-fade-in flex items-start gap-3 rounded-lg border border-border bg-card p-4 shadow-lg",
              m.variant === "success" && "border-success/30",
              m.variant === "destructive" && "border-destructive/30",
            )}
          >
            {m.variant === "success" && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />}
            {m.variant === "destructive" && <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />}
            {(!m.variant || m.variant === "default") && <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />}
            <div className="flex-1">
              <p className="text-sm font-medium">{m.title}</p>
              {m.description && <p className="mt-0.5 text-xs text-muted-foreground">{m.description}</p>}
            </div>
            <button onClick={() => setMessages((prev) => prev.filter((x) => x.id !== m.id))} className="text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
