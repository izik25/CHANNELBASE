import { prisma } from "@channelbase/database";
import { HttpError } from "../plugins/error-handler.js";

export async function getOwnedChannelOrThrow(channelId: string, userId: string, role: "USER" | "ADMIN") {
  const channel = await prisma.channel.findUnique({ where: { id: channelId } });
  if (!channel || channel.deletedAt) throw new HttpError(404, "Channel not found.");
  if (channel.userId !== userId && role !== "ADMIN") throw new HttpError(403, "You do not have access to this channel.");
  return channel;
}

export function deriveWorkingTitle(prompt: string): string {
  const cleaned = prompt.trim().replace(/\s+/g, " ");
  return cleaned.length > 60 ? `${cleaned.slice(0, 57)}...` : cleaned || "New Channel";
}
