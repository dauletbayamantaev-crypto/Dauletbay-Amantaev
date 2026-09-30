import React, { useEffect, useRef, useState } from 'react';
import { Bot, Send, Trash2, User } from 'lucide-react';
import { useData } from '../lib/store';
import { getAIConfig, providerLabel, streamChat } from '../lib/ai';
import { coachSystem } from '../lib/prompts';
import type { ChatMessage } from '../lib/types';
import { Button, Card, PageHeader, Textarea } from '../components/ui';
import { AIErrorNote, Markdown } from '../components/ai';

const CHAT_ID = 'main';
const MAX_SAVED = 40;

const STARTERS = [
  'Hozirgi holatimga qarab, bu hafta nimaga e\'tibor qaratishim kerak?',
  'Qaysi maqsadim eng ko\'p xavf ostida va nima qilish kerak?',
  'Moliyaviy holatimni yaxshilash uchun 3 ta aniq qadam ayt',
  'Motivatsiyam tushib ketdi. Qanday qilib qayta yo\'lga tushaman?',
];

export default function CoachPage() {
  const { data, profile, add, update } = useData();
  const saved = data.coach.find((c) => c.id === CHAT_ID);
  const [messages, setMessages] = useState<ChatMessage[]>(saved?.messages ?? []);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const cfg = getAIConfig(profile);

  useEffect(() => {
    if (streaming === null && saved) setMessages(saved.messages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved?.updatedAt]);

  useEffect(() => bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), [messages.length, streaming]);

  const persist = (msgs: ChatMessage[]) => {
    const trimmed = msgs.slice(-MAX_SAVED);
    if (saved) update('coach', CHAT_ID, { messages: trimmed });
    else add('coach', { id: CHAT_ID, messages: trimmed });
  };

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || streaming !== null) return;
    const next: ChatMessage[] = [...messages, { role: 'user', text: q, at: Date.now() }];
    setMessages(next);
    setInput('');
    setError(null);
    setStreaming('');
    try {
      // Kontekst hajmini cheklash uchun oxirgi 20 ta xabar yuboriladi
      const answer = await streamChat(cfg, coachSystem(data, profile), next.slice(-20).map((m) => ({ role: m.role, text: m.text })), setStreaming);
      const done: ChatMessage[] = [...next, { role: 'assistant', text: answer || '(bo\'sh javob)', at: Date.now() }];
      setMessages(done);
      persist(done);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      persist(next);
    } finally {
      setStreaming(null);
    }
  };

  return (
    <>
      <PageHeader
        title="AI murabbiy"
        subtitle={`Maqsadlaringiz, loyihalaringiz, moliya, odat va sog'lig'ingizni biladigan shaxsiy maslahatchi · ${providerLabel(cfg.provider)} (${cfg.model})`}
        action={
          messages.length > 0 ? (
            <Button
              variant="ghost"
              icon={<Trash2 className="h-4 w-4" />}
              onClick={() => {
                setMessages([]);
                persist([]);
              }}
            >
              Tozalash
            </Button>
          ) : undefined
        }
      />
      <Card className="flex min-h-[60vh] flex-col p-0 sm:p-0">
        <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
          {messages.length === 0 && streaming === null && (
            <div className="py-6 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white">
                <Bot className="h-6 w-6" />
              </div>
              <p className="font-medium text-slate-800">Salom{profile.name ? `, ${profile.name}` : ''}! Nima haqida gaplashamiz?</p>
              <p className="mt-1 text-sm text-slate-500">Murabbiy ilovadagi barcha ma'lumotlaringizni hisobga oladi.</p>
              <div className="mx-auto mt-5 grid max-w-2xl gap-2 sm:grid-cols-2">
                {STARTERS.map((s) => (
                  <button key={s} onClick={() => send(s)} className="rounded-xl border border-slate-200 p-3 text-left text-sm text-slate-700 hover:border-indigo-300 hover:bg-indigo-50/40">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => <Bubble key={i} role={m.role} text={m.text} />)}
          {streaming !== null && <Bubble role="assistant" text={streaming || '…'} />}
          <AIErrorNote error={error} />
          <div ref={bottom} />
        </div>
        <form
          className="flex items-end gap-2 border-t border-slate-100 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <Textarea
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder="Savolingizni yozing... (Enter — yuborish, Shift+Enter — yangi qator)"
            className="max-h-40 min-h-[44px]"
          />
          <Button type="submit" loading={streaming !== null} disabled={!input.trim()} aria-label="Yuborish">
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </Card>
    </>
  );
}

function Bubble({ role, text }: { role: 'user' | 'assistant'; text: string }) {
  const me = role === 'user';
  return (
    <div className={`flex gap-2.5 ${me ? 'flex-row-reverse' : ''}`}>
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${me ? 'bg-slate-200 text-slate-600' : 'bg-gradient-to-br from-violet-600 to-indigo-600 text-white'}`}>
        {me ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>
      <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${me ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-800'}`}>
        {me ? <p className="whitespace-pre-wrap text-sm">{text}</p> : <Markdown text={text} />}
      </div>
    </div>
  );
}
