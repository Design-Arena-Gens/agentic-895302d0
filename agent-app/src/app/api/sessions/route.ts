import { NextResponse } from "next/server";
import { serializeSessions } from "@/lib/session-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const sessions = serializeSessions().map((session) => ({
    sessionId: session.sessionId,
    status: session.status,
    agentName: session.config.agentName,
    voice: session.config.voice,
    language: session.config.language,
    objective: session.config.objective,
    customerName: session.config.customerName ?? null,
    targetNumber: session.config.targetNumber,
    summary: session.summary ?? null,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    callSid: session.callSid ?? null,
    transcript: session.transcript,
    lastError: session.lastError ?? null,
    company: session.config.company ?? null,
    campaign: session.config.campaign ?? null,
  }));

  return NextResponse.json({ sessions });
}
