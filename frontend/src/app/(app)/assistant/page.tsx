"use client";

import { Skeleton, StateBlock } from "@/components/domain";
import { CrisisCard, FeatureGate, PreviewBanner } from "@/components/domain/gated";
import { Button, ButtonLink } from "@/components/ui/primitives";
import { ApiRequestError, ASSISTANT_MAX_CHARS } from "@/lib/api/client";
import { useConversations, useCreateConversation, useRiskAssessments, useSendAssistantMessage } from "@/lib/api/hooks";
import type { AssistantActionCode, AssistantTurn } from "@/lib/api/types";
import { cn, relativeTime } from "@/lib/format";
import { ArrowUp, Bot, MessageCirclePlus, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const SUGGESTIONS = ["What does my indicator mean?", "How can I sleep better?", "I've been feeling stressed lately", "Where can I find a clinic?"];

const ACTION: Record<AssistantActionCode, (latestId?: string) => { href: string; label: string }> = {
  view_facilities: () => ({ href: "/care", label: "Find care" }),
  view_risk_detail: (id) => ({ href: id ? `/risk/${id}` : "/risk", label: "View indicator" }),
  start_check_in: () => ({ href: "/check-ins", label: "Start a check-in" }),
  contact_emergency_support: () => ({ href: "/support", label: "Emergency support" }),
};

export default function AssistantPage() {
  return (
    <div className="space-y-5">
      <FeatureGate flag="assistant" name="The assistant">
        <PreviewBanner>
          This assistant uses reviewed templates, not a live AI model. It can explain your Albo information and share general guidance. It isn&apos;t a doctor or an emergency service.
        </PreviewBanner>
        <AssistantContent />
      </FeatureGate>
    </div>
  );
}

function AssistantContent() {
  const { data: conversations, isLoading, error } = useConversations();
  const createConv = useCreateConversation();
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = conversations?.find((c) => c.id === activeId) ?? conversations?.[0];
  const consentMissing =
    createConv.error instanceof ApiRequestError && createConv.error.status === 403;

  async function newConversation() {
    try {
      const c = await createConv.mutateAsync();
      setActiveId(c.id);
    } catch {
      /* shown below */
    }
  }

  return (
    <div className="grid h-[calc(100dvh-12rem)] min-h-[520px] gap-5 lg:grid-cols-[300px_1fr]">
      <aside className="hidden flex-col rounded-[var(--radius-card)] bg-surface/85 p-4 shadow-[var(--shadow-card)] lg:flex">
        <Button onClick={newConversation} disabled={createConv.isPending} className="w-full">
          <MessageCirclePlus /> New conversation
        </Button>
        {consentMissing && (
          <p className="mt-3 text-xs text-high">
            The assistant needs your consent. <a href="/settings/consent" className="underline">Manage consent</a>
          </p>
        )}
        <p className="mb-2 mt-5 px-1 text-xs font-medium text-muted">Recent</p>
        {isLoading && <Skeleton className="h-32" />}
        <ul className="space-y-1.5 overflow-y-auto">
          {conversations?.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setActiveId(c.id)}
                aria-current={c.id === active?.id ? "true" : undefined}
                className={cn(
                  "w-full rounded-2xl border px-3.5 py-3 text-left transition-colors",
                  c.id === active?.id ? "border-accent-300 bg-accent-50" : "border-transparent hover:bg-surface-muted",
                )}
              >
                <p className="truncate text-sm font-medium">{c.title}</p>
                <p className="text-xs text-muted">{c.last_message_at ? relativeTime(c.last_message_at) : "No messages yet"}</p>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-auto pt-4 text-[11px] text-muted">Conversations are kept for a short time and never used to train AI models.</p>
      </aside>

      <section className="flex min-h-0 flex-col rounded-[var(--radius-card)] bg-surface/85 shadow-[var(--shadow-card)]">
        {error && <StateBlock kind="unavailable" title="The assistant is unavailable" description="Please try again shortly." className="m-auto" />}
        {!error && !active && !isLoading && (
          <div className="m-auto max-w-sm text-center">
            <StateBlock kind="empty" title="Start a conversation" description="Ask about your indicator, sleep, stress or finding care." />
            <Button onClick={newConversation} disabled={createConv.isPending}>
              <MessageCirclePlus /> New conversation
            </Button>
          </div>
        )}
        {active && <Chat key={active.id} conversationId={active.id} turns={active.turns} onNew={newConversation} />}
      </section>
    </div>
  );
}

function Chat({ conversationId, turns, onNew }: { conversationId: string; turns: AssistantTurn[]; onNew: () => void }) {
  const send = useSendAssistantMessage();
  const { data: risk } = useRiskAssessments();
  const [text, setText] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ behavior: "smooth", block: "end" });
  }, [turns.length, pending]);

  async function submit(message: string) {
    const trimmed = message.trim();
    if (!trimmed || send.isPending) return;
    setText("");
    setPending(trimmed);
    try {
      await send.mutateAsync({ conversationId, text: trimmed });
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      <header className="flex items-center gap-3 border-b border-line px-5 py-4">
        <span className="grid size-10 place-items-center rounded-full bg-gradient-to-br from-accent-300 to-accent-500 text-white">
          <Bot className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="font-semibold">Albo assistant</h1>
          <p className="text-xs text-muted">AI support tool · not a doctor or emergency service</p>
        </div>
        <Button variant="secondary" size="sm" onClick={onNew} className="lg:hidden">
          <MessageCirclePlus /> New
        </Button>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5" aria-live="polite">
        {turns.length === 0 && !pending && (
          <div className="py-8 text-center">
            <Sparkles className="mx-auto size-6 text-accent-500" aria-hidden />
            <p className="mt-3 font-medium">Hi, I&apos;m Albo&apos;s AI support tool.</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted">
              I can explain your indicators and share general preventive guidance. I can&apos;t diagnose, prescribe, or help in an emergency.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => submit(s)}
                  className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm text-ink-soft hover:bg-accent-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((t) => (
          <Message key={t.id} turn={t} latestAssessmentId={risk?.[0]?.id} />
        ))}
        {pending && (
          <>
            <Message turn={{ id: "pending", role: "user", text: pending, created_at: new Date().toISOString() }} />
            <div className="flex items-center gap-2 text-sm text-muted" role="status">
              <span className="flex gap-1" aria-hidden>
                {[0, 1, 2].map((i) => (
                  <span key={i} className="size-1.5 animate-bounce rounded-full bg-accent-400" style={{ animationDelay: `${i * 120}ms` }} />
                ))}
              </span>
              Albo is replying…
            </div>
          </>
        )}
        {send.isError && (
          <p role="alert" className="text-sm text-high">
            {send.error instanceof ApiRequestError ? send.error.message : "The assistant couldn't reply. Please try again."}
          </p>
        )}
        <div ref={endRef} />
      </div>

      <form
        className="border-t border-line p-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit(text);
        }}
      >
        <label htmlFor="assistant-input" className="sr-only">Message the assistant</label>
        <div className="flex items-end gap-2 rounded-2xl border border-line bg-surface px-3 py-2 focus-within:border-accent-400 focus-within:ring-4 focus-within:ring-accent-100">
          <textarea
            id="assistant-input"
            rows={1}
            maxLength={ASSISTANT_MAX_CHARS}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(text);
              }
            }}
            placeholder="Ask about your indicator, sleep, stress…"
            className="max-h-32 min-h-9 flex-1 resize-none bg-transparent py-1.5 text-sm focus:outline-none"
          />
          <button
            type="submit"
            aria-label="Send message"
            disabled={!text.trim() || send.isPending}
            className="grid size-9 shrink-0 place-items-center rounded-full bg-ink text-white disabled:opacity-40"
          >
            <ArrowUp className="size-4" />
          </button>
        </div>
        <p className="mt-2 text-[11px] text-muted">
          Don&apos;t share names, ID numbers or addresses. In an emergency, contact emergency services. {text.length}/{ASSISTANT_MAX_CHARS}
        </p>
      </form>
    </>
  );
}

function Message({ turn, latestAssessmentId }: { turn: AssistantTurn; latestAssessmentId?: string }) {
  if (turn.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-sm text-white">{turn.text}</p>
      </div>
    );
  }
  if (turn.crisis_escalation) return <CrisisCard card={turn.crisis_escalation} />;
  return (
    <div className="flex gap-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-100 text-accent-600" aria-hidden>
        <Bot className="size-4" />
      </span>
      <div className="max-w-[85%]">
        <div className={cn("rounded-2xl rounded-tl-md px-4 py-3 text-sm", turn.response_type === "refusal" ? "bg-moderate-bg" : "bg-surface-muted")}>
          <p className="whitespace-pre-wrap">{turn.text}</p>
          {turn.rule_model_version && (
            <p className="mt-2 text-[11px] text-muted">Based on your indicator · {turn.rule_model_version}</p>
          )}
        </div>
        {turn.suggested_actions && turn.suggested_actions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {turn.suggested_actions.map((a) => {
              const { href, label } = ACTION[a](turn.referenced_assessment_id ?? latestAssessmentId);
              return (
                <ButtonLink key={a} href={href} variant="secondary" size="sm">
                  {label}
                </ButtonLink>
              );
            })}
          </div>
        )}
        {turn.disclaimer && <p className="mt-1.5 text-[11px] text-muted">{turn.disclaimer}</p>}
      </div>
    </div>
  );
}
