import { NextResponse } from "next/server";
import { z } from "zod";
import { getTwilioClient } from "@/lib/twilio";
import {
  createSession,
  setCallSid,
  updateStatus,
  setError,
} from "@/lib/session-store";

const payloadSchema = z.object({
  to: z.string().min(8, "Destination number is required"),
  customerName: z.string().optional(),
  company: z.string().optional(),
  campaign: z.string().optional(),
  agentName: z.string().min(2),
  persona: z.string().optional().default(""),
  greeting: z.string().min(6),
  objective: z.string().min(6),
  guardrails: z.string().optional().default(""),
  closingStrategy: z.string().optional().default(""),
  voice: z.string().min(2),
  language: z.string().min(2),
  temperature: z.number().min(0).max(1.5).default(0.6),
});

export async function POST(request: Request) {
  const callerId = process.env.TWILIO_CALLER_ID;
  const publicUrl = process.env.PUBLIC_BASE_URL;

  if (!callerId) {
    return NextResponse.json(
      {
        error:
          "TWILIO_CALLER_ID is not configured. Configure it to launch outbound calls.",
      },
      { status: 500 },
    );
  }

  if (!publicUrl) {
    return NextResponse.json(
      {
        error:
          "PUBLIC_BASE_URL is missing. Set it to the publicly reachable domain handling Twilio webhooks.",
      },
      { status: 500 },
    );
  }

  let parsed:
    | (z.infer<typeof payloadSchema> & { sessionId: string })
    | undefined;
  try {
    const body = await request.json();
    const payload = payloadSchema.parse(body);
    parsed = { ...payload, sessionId: crypto.randomUUID() };
    createSession({
      sessionId: parsed.sessionId,
      agentName: parsed.agentName,
      persona: parsed.persona,
      greeting: parsed.greeting,
      objective: parsed.objective,
      guardrails: parsed.guardrails,
      closingStrategy: parsed.closingStrategy,
      voice: parsed.voice,
      language: parsed.language,
      temperature: parsed.temperature,
      targetNumber: parsed.to,
      customerName: parsed.customerName,
      company: parsed.company,
      campaign: parsed.campaign,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid payload", issues: error.issues },
        { status: 422 },
      );
    }

    return NextResponse.json(
      { error: "Unexpected payload error" },
      { status: 400 },
    );
  }

  if (!parsed) {
    return NextResponse.json({ error: "Unable to process request" }, { status: 400 });
  }

  try {
    const client = getTwilioClient();
    const voiceUrl = new URL("/api/voice-script", publicUrl);
    voiceUrl.searchParams.set("session", parsed.sessionId);

    const statusUrl = new URL("/api/twilio-status", publicUrl);
    statusUrl.searchParams.set("session", parsed.sessionId);

    const call = await client.calls.create({
      to: parsed.to,
      from: callerId,
      url: voiceUrl.toString(),
      method: "GET",
      statusCallback: statusUrl.toString(),
      statusCallbackEvent: [
        "initiated",
        "queued",
        "ringing",
        "answered",
        "completed",
        "busy",
        "failed",
        "no-answer",
        "canceled",
      ],
      statusCallbackMethod: "POST",
      machineDetection: "Enable",
      machineDetectionTimeout: 3,
    });

    setCallSid(parsed.sessionId, call.sid);
    updateStatus(parsed.sessionId, "queued");

    return NextResponse.json(
      {
        sessionId: parsed.sessionId,
        callSid: call.sid,
        status: "queued",
      },
      { status: 201 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to initiate call";
    setError(parsed.sessionId, message);

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
