import { NextResponse } from "next/server";
import { z } from "zod";
import type { CallStatus } from "@/lib/session-store";
import { getSession, lookupSessionByCallSid, setSummary, updateStatus } from "@/lib/session-store";
import { getOpenAIClient } from "@/lib/openai";

const querySchema = z.object({
  session: z.string().uuid().optional(),
});

function mapTwilioStatus(status: string): CallStatus {
  switch (status) {
    case "initiated":
    case "queued":
      return "queued";
    case "ringing":
      return "ringing";
    case "answered":
    case "in-progress":
      return "in-progress";
    case "completed":
      return "completed";
    case "no-answer":
      return "no-answer";
    default:
      return "failed";
  }
}

async function maybeSummarize(sessionId: string) {
  const session = getSession(sessionId);

  if (!session || session.transcript.length === 0) {
    return;
  }

  try {
    const openai = getOpenAIClient();
    const transcriptText = session.transcript
      .filter((turn) => turn.role !== "system")
      .map((turn) => `${turn.role.toUpperCase()}: ${turn.content}`)
      .join("\n");

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content:
            "You are a call QA assistant. Summarize the conversation in three concise bullet points and propose up to three next steps.",
        },
        {
          role: "user",
          content: transcriptText,
        },
      ],
    });

    const summary =
      completion.choices[0]?.message?.content?.trim() ??
      "Call completed. Summary unavailable.";

    setSummary(sessionId, summary);
  } catch (error) {
    console.error("Failed to summarize call", error);
  }
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const query = querySchema.safeParse(
    Object.fromEntries(url.searchParams.entries()),
  );

  const formData = await request.formData();
  const callSid = formData.get("CallSid") as string | null;
  const status = (formData.get("CallStatus") as string | null)?.toLowerCase();

  let session =
    query.success && query.data.session
      ? getSession(query.data.session)
      : undefined;

  if (!session && callSid) {
    session = lookupSessionByCallSid(callSid);
  }

  if (!session || !status) {
    return NextResponse.json({ ok: true });
  }

  const mappedStatus = mapTwilioStatus(status);
  updateStatus(session.sessionId, mappedStatus);

  if (status === "completed") {
    await maybeSummarize(session.sessionId);
  }

  return NextResponse.json({ ok: true });
}
