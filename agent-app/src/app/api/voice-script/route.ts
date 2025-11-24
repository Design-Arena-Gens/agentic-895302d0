import { NextResponse } from "next/server";
import VoiceResponse from "twilio/lib/twiml/VoiceResponse";
import { z } from "zod";
import {
  appendMessage,
  ensureGreetingCaptured,
  fallbackLine,
  getMessagesForModel,
  getSession,
  updateStatus,
} from "@/lib/session-store";
import { getOpenAIClient } from "@/lib/openai";

const voiceParamsSchema = z.object({
  session: z.string().uuid(),
});

function xmlResponse(twiml: VoiceResponse): Response {
  return new Response(twiml.toString(), {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}

function buildActionUrl(requestUrl: string, sessionId: string): string {
  const url = new URL(requestUrl);
  url.searchParams.set("session", sessionId);
  return url.toString();
}

function buildGather(
  twiml: VoiceResponse,
  sessionId: string,
  requestUrl: string,
  language: string,
  voice: string,
  prompt: string,
) {
  const gather = twiml.gather({
    input: ["speech"],
    action: buildActionUrl(requestUrl, sessionId),
    method: "POST",
    speechTimeout: "auto",
    speechModel: "experimental_conversations",
    language: language as any,
  });

  gather.say({ voice: voice as any, language: language as any }, prompt);
  twiml.redirect({ method: "POST" }, buildActionUrl(requestUrl, sessionId));
}

export async function GET(request: Request) {
  const result = voiceParamsSchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );

  if (!result.success) {
    return NextResponse.json(
      { error: "Session identifier missing" },
      { status: 400 },
    );
  }

  const session = getSession(result.data.session);

  if (!session) {
    return NextResponse.json({ error: "Unknown session" }, { status: 404 });
  }

  const twiml = new VoiceResponse();
  ensureGreetingCaptured(session.sessionId, session.config.greeting);
  updateStatus(session.sessionId, "in-progress");

  twiml.say(
    {
      voice: session.config.voice as any,
      language: session.config.language as any,
    },
    session.config.greeting,
  );

  buildGather(
    twiml,
    session.sessionId,
    request.url,
    session.config.language,
    session.config.voice,
    session.config.openingQuestion,
  );

  return xmlResponse(twiml);
}

async function handleConversationTurn(
  request: Request,
  sessionId: string,
): Promise<Response> {
  const session = getSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: "Unknown session" }, { status: 404 });
  }

  const formData = await request.formData();
  const speechResult = (formData.get("SpeechResult") as string | null)?.trim() ?? "";

  updateStatus(sessionId, "in-progress");

  const twiml = new VoiceResponse();

  if (!speechResult) {
    const prompt = "I didn't quite catch that. Could you say that again?";
    twiml.say(
      {
        voice: session.config.voice as any,
        language: session.config.language as any,
      },
      prompt,
    );
    buildGather(
      twiml,
      sessionId,
      request.url,
      session.config.language,
      session.config.voice,
      session.config.openingQuestion,
    );
    return xmlResponse(twiml);
  }

  appendMessage(sessionId, "user", speechResult);

  let assistantReply = "";
  try {
    const openai = getOpenAIClient();
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      messages: getMessagesForModel(sessionId),
      temperature: session.config.temperature,
    });

    assistantReply =
      completion.choices[0]?.message?.content?.trim() ?? fallbackLine();
  } catch {
    assistantReply = fallbackLine();
  }

  appendMessage(sessionId, "assistant", assistantReply);

  const gather = twiml.gather({
    input: ["speech"],
    action: buildActionUrl(request.url, sessionId),
    method: "POST",
    speechTimeout: "auto",
    speechModel: "experimental_conversations",
    language: session.config.language as any,
  });

  gather.say(
    {
      voice: session.config.voice as any,
      language: session.config.language as any,
    },
    assistantReply,
  );

  twiml.redirect({ method: "POST" }, buildActionUrl(request.url, sessionId));

  return xmlResponse(twiml);
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session");

  if (!sessionId) {
    return NextResponse.json({ error: "Missing session" }, { status: 400 });
  }

  return handleConversationTurn(request, sessionId);
}
