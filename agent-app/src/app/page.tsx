"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ClipboardList,
  PhoneCall,
  Settings2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import styles from "./page.module.css";

type TranscriptTurn = {
  id: string;
  role: "assistant" | "user" | "system";
  content: string;
  timestamp: string;
};

type SessionSnapshot = {
  sessionId: string;
  status: "draft" | "queued" | "ringing" | "in-progress" | "completed" | "no-answer" | "failed";
  agentName: string;
  voice: string;
  language: string;
  targetNumber: string;
  customerName: string | null;
  objective: string;
  summary: string | null;
  createdAt: string;
  updatedAt: string;
  transcript: TranscriptTurn[];
  lastError: string | null;
  company: string | null;
  campaign: string | null;
};

type VoiceOption = {
  id: string;
  label: string;
  language: string;
  description: string;
};

const voiceOptions: VoiceOption[] = [
  {
    id: "Polly.Joanna",
    label: "Joanna • Warm & confident (US)",
    language: "en-US",
    description: "Clear American English with a professional tone.",
  },
  {
    id: "Polly.Matthew",
    label: "Matthew • Friendly & energetic (US)",
    language: "en-US",
    description: "Approachable US voice tuned for sales conversations.",
  },
  {
    id: "Polly.Amy",
    label: "Amy • Polished & calm (UK)",
    language: "en-GB",
    description: "Premium British English, perfect for concierge experiences.",
  },
  {
    id: "Polly.Lupe",
    label: "Lupe • Conversational (ES)",
    language: "es-ES",
    description: "Neutral Spanish suited for customer care.",
  },
  {
    id: "Polly.Celine",
    label: "Celine • Warm & poised (FR)",
    language: "fr-FR",
    description: "Natural French cadence for premium CX.",
  },
];

const statusStyles: Record<SessionSnapshot["status"], string> = {
  draft: styles.warning,
  queued: styles.warning,
  ringing: styles.warning,
  "in-progress": styles.success,
  completed: styles.success,
  "no-answer": styles.warning,
  failed: styles.danger,
};

const statusLabels: Record<SessionSnapshot["status"], string> = {
  draft: "Draft",
  queued: "Queued",
  ringing: "Ringing",
  "in-progress": "Live",
  completed: "Completed",
  "no-answer": "No answer",
  failed: "Failed",
};

const defaultAgent = {
  agentName: "Aurora Hale",
  persona:
    "Strategic, empathetic, and sharp. Speaks in concise sentences, mirrors the customer's energy, and builds trust quickly.",
  greeting: "Hi there, this is Aurora with Nebula Solar. Thanks for picking up!",
  objective:
    "Reconnect with existing residential solar leads, qualify their intent, and book a follow-up consultation.",
  guardrails:
    "Never claim incentives that have not been verified. Disclose that the call is recorded if asked. Respect do-not-call requests immediately.",
  closingStrategy:
    "Summarize agreed actions, confirm the appointment or next step, and thank the customer by name.",
  voice: voiceOptions[0].id,
  language: voiceOptions[0].language,
  temperature: 0.65,
  company: "Nebula Solar",
  campaign: "Winter Savings Revival",
};

const defaultCall = {
  customerName: "",
  phoneNumber: "",
};

type AgentConfig = typeof defaultAgent;
type CallConfig = typeof defaultCall;

type Feedback = {
  type: "success" | "error";
  message: string;
};

function formatTimestamp(timestamp?: string) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatRole(role: TranscriptTurn["role"]) {
  if (role === "assistant") return "Agent";
  if (role === "user") return "Customer";
  return "System";
}

export default function Home() {
  const [agentConfig, setAgentConfig] = useState<AgentConfig>(defaultAgent);
  const [callConfig, setCallConfig] = useState<CallConfig>(defaultCall);
  const [sessions, setSessions] = useState<SessionSnapshot[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isLaunching, setIsLaunching] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [pollingError, setPollingError] = useState<string | null>(null);

  useEffect(() => {
    const selectedVoice = voiceOptions.find(
      (voice) => voice.id === agentConfig.voice,
    );
    if (selectedVoice && selectedVoice.language !== agentConfig.language) {
      setAgentConfig((prev) => ({
        ...prev,
        language: selectedVoice.language,
      }));
    }
  }, [agentConfig.voice, agentConfig.language]);

  useEffect(() => {
    let cancelled = false;
    let timer: NodeJS.Timeout;

    const poll = async () => {
      try {
        const response = await fetch("/api/sessions", {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error(`Status ${response.status}`);
        }

        const data = (await response.json()) as { sessions: SessionSnapshot[] };
        if (cancelled) return;

        setSessions(data.sessions);
        setPollingError(null);

        if (data.sessions.length === 0) {
          setActiveSessionId(null);
        } else if (
          !activeSessionId ||
          !data.sessions.some((session) => session.sessionId === activeSessionId)
        ) {
          setActiveSessionId(data.sessions[0].sessionId);
        }
      } catch {
        if (!cancelled) {
          setPollingError(
            "Unable to refresh session list. We will retry automatically.",
          );
        }
      } finally {
        if (!cancelled) {
          timer = setTimeout(poll, 3500);
        }
      }
    };

    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [activeSessionId]);

  const activeSession = useMemo(() => {
    if (!activeSessionId) return null;
    return sessions.find((session) => session.sessionId === activeSessionId) ?? null;
  }, [sessions, activeSessionId]);

  const activeTranscript = useMemo(() => {
    if (!activeSession) return [];
    return activeSession.transcript.filter((turn) => turn.role !== "system");
  }, [activeSession]);

  const handleAgentChange =
    <K extends keyof AgentConfig>(key: K) =>
    (
      event: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) => {
      const value =
        key === "temperature" ? Number(event.target.value) : event.target.value;
      setAgentConfig((prev) => ({
        ...prev,
        [key]: value,
      }));
    };

  const handleCallChange =
    <K extends keyof CallConfig>(key: K) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setCallConfig((prev) => ({
        ...prev,
        [key]: value,
      }));
    };

  const launchCall = async () => {
    if (!callConfig.phoneNumber.trim()) {
      setFeedback({
        type: "error",
        message: "Enter a destination phone number including country code.",
      });
      return;
    }

    setIsLaunching(true);
    setFeedback(null);

    try {
      const payload = {
        to: callConfig.phoneNumber.trim(),
        customerName: callConfig.customerName.trim() || undefined,
        company: agentConfig.company.trim() || undefined,
        campaign: agentConfig.campaign.trim() || undefined,
        agentName: agentConfig.agentName.trim(),
        persona: agentConfig.persona,
        greeting: agentConfig.greeting,
        objective: agentConfig.objective,
        guardrails: agentConfig.guardrails,
        closingStrategy: agentConfig.closingStrategy,
        voice: agentConfig.voice,
        language: agentConfig.language,
        temperature: agentConfig.temperature,
      };

      const response = await fetch("/api/calls", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Failed to create call");
      }

      setActiveSessionId(data.sessionId);
      setFeedback({
        type: "success",
        message: "Call launched. Monitor the live transcript below.",
      });
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to launch call.",
      });
    } finally {
      setIsLaunching(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <header className={styles.hero}>
          <span className={styles.heroBadge}>
            <Sparkles size={16} />
            Agent Orchestration
          </span>
          <h1 className={styles.heroTitle}>
            Build, launch, and monitor AI calling agents in minutes.
          </h1>
          <p className={styles.heroSubtitle}>
            Configure persona, guardrails, and voice, then trigger real outbound calls
            through Twilio. Live transcripts and summaries keep your team in the loop.
          </p>
          <div className={styles.heroHighlights}>
            <span>
              <ShieldCheck size={14} /> Compliance guardrails
            </span>
            <span>
              <Activity size={14} /> Live transcription
            </span>
            <span>
              <ClipboardList size={14} /> Auto summaries &amp; next steps
            </span>
          </div>
        </header>

        {feedback && (
          <div
            className={`${styles.card} ${styles.span12}`}
            style={{
              borderColor:
                feedback.type === "error"
                  ? "rgba(248,113,113,0.35)"
                  : "rgba(74,222,128,0.35)",
            }}
          >
            <strong
              className={feedback.type === "error" ? styles.danger : styles.success}
            >
              {feedback.type === "error" ? "Heads up" : "Success"}
            </strong>
            <p className={styles.callout}>{feedback.message}</p>
          </div>
        )}

        {pollingError && (
          <div className={`${styles.card} ${styles.span12}`}>
            <strong className={styles.warning}>Realtime sync issue</strong>
            <p className={styles.callout}>{pollingError}</p>
          </div>
        )}

        <div className={styles.grid}>
          <section className={`${styles.card} ${styles.span7}`}>
            <div className={styles.cardHeader}>
              <div className={styles.cardTitleRow}>
                <Settings2 size={20} />
                <h2 className={styles.cardTitle}>Agent persona &amp; policy</h2>
              </div>
              <p className={styles.cardSubtitle}>
                Craft the agent&apos;s voice, guardrails, and success criteria. These
                instructions compile the system prompt fed into the LLM during each turn.
              </p>
            </div>

            <div className={`${styles.formGrid} ${styles.twoColumn}`}>
              <div className={styles.field}>
                <span className={styles.fieldLabel}>
                  <strong>Agent name</strong>
                </span>
                <input
                  value={agentConfig.agentName}
                  onChange={handleAgentChange("agentName")}
                  placeholder="Aurora Hale"
                />
              </div>

              <div className={styles.field}>
                <span className={styles.fieldLabel}>
                  <strong>Campaign tag</strong>
                </span>
                <input
                  value={agentConfig.campaign}
                  onChange={handleAgentChange("campaign")}
                  placeholder="Winter Savings Revival"
                />
              </div>

              <div className={styles.field}>
                <span className={styles.fieldLabel}>
                  <strong>Company / brand</strong>
                </span>
                <input
                  value={agentConfig.company}
                  onChange={handleAgentChange("company")}
                  placeholder="Nebula Solar"
                />
              </div>

              <div className={styles.field}>
                <span className={styles.fieldLabel}>
                  <strong>Voice</strong>
                </span>
                <select
                  value={agentConfig.voice}
                  onChange={handleAgentChange("voice")}
                >
                  {voiceOptions.map((voice) => (
                    <option key={voice.id} value={voice.id}>
                      {voice.label}
                    </option>
                  ))}
                </select>
                <p className={styles.fieldDescription}>
                  {
                    voiceOptions.find((voice) => voice.id === agentConfig.voice)
                      ?.description
                  }
                </p>
              </div>
            </div>

            <div className={styles.formGrid}>
              <div className={styles.field}>
                <span className={styles.fieldLabel}>
                  <strong>Greeting</strong>
                </span>
                <textarea
                  value={agentConfig.greeting}
                  onChange={handleAgentChange("greeting")}
                />
              </div>

              <div className={styles.field}>
                <span className={styles.fieldLabel}>
                  <strong>Persona cues</strong>
                </span>
                <textarea
                  value={agentConfig.persona}
                  onChange={handleAgentChange("persona")}
                />
                <p className={styles.fieldDescription}>
                  Describe cadence, tone, and relationship-building tactics. Write in
                  natural language.
                </p>
              </div>

              <div className={styles.field}>
                <span className={styles.fieldLabel}>
                  <strong>Primary objective</strong>
                </span>
                <textarea
                  value={agentConfig.objective}
                  onChange={handleAgentChange("objective")}
                />
              </div>

              <div className={styles.field}>
                <span className={styles.fieldLabel}>
                  <strong>Guardrails</strong>
                </span>
                <textarea
                  value={agentConfig.guardrails}
                  onChange={handleAgentChange("guardrails")}
                />
                <p className={styles.fieldDescription}>
                  Compliance rules, escalation triggers, and red lines. The agent will
                  reference these every turn.
                </p>
              </div>

              <div className={styles.field}>
                <span className={styles.fieldLabel}>
                  <strong>Closing strategy</strong>
                </span>
                <textarea
                  value={agentConfig.closingStrategy}
                  onChange={handleAgentChange("closingStrategy")}
                />
              </div>

              <div className={styles.field}>
                <span className={styles.fieldLabel}>
                  <strong>Creativity</strong>
                  <span>{agentConfig.temperature.toFixed(2)}</span>
                </span>
                <div className={styles.sliderControl}>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={agentConfig.temperature}
                    onChange={handleAgentChange("temperature")}
                    className={styles.slider}
                  />
                </div>
              </div>
            </div>
          </section>

          <section className={`${styles.card} ${styles.span5}`}>
            <div className={styles.cardHeader}>
              <div className={styles.cardTitleRow}>
                <PhoneCall size={20} />
                <h2 className={styles.cardTitle}>Call launchpad</h2>
              </div>
              <p className={styles.cardSubtitle}>
                Provide the destination number and optional context. Calls will be
                originated from your Twilio number configured in the environment.
              </p>
            </div>

            <div className={styles.formGrid}>
              <div className={styles.field}>
                <span className={styles.fieldLabel}>
                  <strong>Customer name</strong>
                </span>
                <input
                  value={callConfig.customerName}
                  onChange={handleCallChange("customerName")}
                  placeholder="Jamie Rivera"
                />
              </div>
              <div className={styles.field}>
                <span className={styles.fieldLabel}>
                  <strong>Phone number</strong>
                </span>
                <input
                  value={callConfig.phoneNumber}
                  onChange={handleCallChange("phoneNumber")}
                  placeholder="+14155550123"
                />
                <p className={styles.fieldDescription}>
                  Must be in E.164 format and reachable by your Twilio project.
                </p>
              </div>
            </div>

            <div className={styles.buttonRow}>
              <button
                className={styles.buttonPrimary}
                onClick={launchCall}
                disabled={isLaunching}
              >
                <Sparkles size={18} />
                {isLaunching ? "Launching..." : "Launch outbound call"}
              </button>
            </div>

            <p className={styles.fieldDescription}>
              Tip: expose your local dev server with ngrok and set PUBLIC_BASE_URL to the
              https URL so Twilio can reach your webhooks.
            </p>
          </section>

          <section className={`${styles.card} ${styles.span6}`}>
            <div className={styles.cardHeader}>
              <div className={styles.cardTitleRow}>
                <Activity size={20} />
                <h2 className={styles.cardTitle}>Live transcript monitor</h2>
              </div>
              <p className={styles.cardSubtitle}>
                Listen in on the conversation turn-by-turn. The agent&apos;s synthesis is
                generated with OpenAI each time the customer speaks.
              </p>
            </div>
            <div className={styles.monitor}>
              <div className={styles.monitorBody}>
                {activeTranscript.length === 0 ? (
                  <p className={styles.monitorPlaceholder}>
                    Initiate a call to populate the live transcript. When a session is
                    active you can click any entry in the timeline below to focus it here.
                  </p>
                ) : (
                  activeTranscript.map((turn) => (
                    <div
                      key={turn.id}
                      className={`${styles.transcriptBubble} ${
                        turn.role === "user" ? styles.transcriptBubbleUser : ""
                      }`}
                    >
                      <span className={styles.transcriptRole}>
                        {formatRole(turn.role)} · {formatTimestamp(turn.timestamp)}
                      </span>
                      <p className={styles.transcriptText}>{turn.content}</p>
                    </div>
                  ))
                )}
              </div>
              {activeSession?.summary && (
                <div className={styles.card}>
                  <h3 className={styles.cardTitle}>Auto summary</h3>
                  <p className={styles.cardSubtitle}>{activeSession.summary}</p>
                </div>
              )}
            </div>
          </section>

          <section className={styles.sessionsCard}>
            <div className={styles.cardHeader}>
              <div className={styles.cardTitleRow}>
                <ClipboardList size={20} />
                <h2 className={styles.cardTitle}>Recent sessions</h2>
              </div>
              <p className={styles.cardSubtitle}>
                Every outbound call tracks its state, transcript, and AI generated
                summary. Select a session to inspect it live.
              </p>
            </div>

            {sessions.length === 0 ? (
              <div className={styles.emptyState}>
                No sessions yet. Launch a call to see it appear here in real time.
              </div>
            ) : (
              <div className={styles.sessionsList}>
                {sessions.map((session) => (
                  <button
                    key={session.sessionId}
                    type="button"
                    onClick={() => setActiveSessionId(session.sessionId)}
                    className={styles.sessionItem}
                    style={{
                      borderColor:
                        session.sessionId === activeSessionId
                          ? "rgba(56,189,248,0.45)"
                          : undefined,
                    }}
                  >
                    <div className={styles.sessionHeader}>
                      <div>
                        <div className={styles.tag}>{session.agentName}</div>
                        <h3 className={styles.cardTitle}>
                          {session.customerName ?? session.targetNumber}
                        </h3>
                      </div>
                      <span
                        className={`${styles.statusPill} ${statusStyles[session.status]}`}
                      >
                        {statusLabels[session.status]}
                      </span>
                    </div>
                    <div className={styles.sessionMeta}>
                      <span>Voice • {session.voice}</span>
                      <span>{formatTimestamp(session.createdAt)}</span>
                      <span>{session.objective}</span>
                      {session.lastError && (
                        <span className={styles.danger}>{session.lastError}</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
