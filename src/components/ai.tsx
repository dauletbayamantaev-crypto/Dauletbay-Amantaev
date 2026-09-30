import React, { useCallback, useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, Lightbulb, Sparkles, Target } from 'lucide-react';
import type { AIAdvice, AIReview } from '../lib/types';
import { VERDICTS, cls } from '../lib/utils';
import { providerLabel } from '../lib/ai';
import { Badge, ErrorNote } from './ui';

export function useAIRunner() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | null> => {
    setLoading(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setLoading(false);
    }
  }, []);
  return { loading, error, run, setError };
}

export function ScoreRing({ score, size = 64 }: { score: number; size?: number }) {
  const r = size / 2 - 5;
  const c = 2 * Math.PI * r;
  const color = score >= 75 ? '#10b981' : score >= 45 ? '#f59e0b' : '#f43f5e';
  return (
    <svg width={size} height={size} className="shrink-0" role="img" aria-label={`Baho ${score}/100`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth="6" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c - (c * Math.max(0, Math.min(100, score))) / 100}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="fill-slate-800 text-sm font-bold">
        {score}
      </text>
    </svg>
  );
}

function ListBlock({ title, items, icon, tone }: { title: string; items: string[]; icon: React.ReactNode; tone: string }) {
  if (!items?.length) return null;
  return (
    <div>
      <p className={cls('mb-1 flex items-center gap-1.5 text-sm font-semibold', tone)}>
        {icon}
        {title}
      </p>
      <ul className="space-y-1 pl-1">
        {items.map((x, i) => (
          <li key={i} className="flex gap-2 text-sm text-slate-700">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-slate-400" />
            <span>{x}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const meta = (provider: string, model: string, at: number) =>
  `${providerLabel(provider)} · ${model} · ${new Date(at).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}`;

export function AIReviewView({ review }: { review: AIReview }) {
  const v = VERDICTS[review.verdict] ?? VERDICTS.insufficient_evidence;
  return (
    <div className="space-y-3 rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-4">
      <div className="flex items-start gap-3">
        <ScoreRing score={review.score} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1 text-sm font-semibold text-violet-800">
              <Sparkles className="h-4 w-4" /> AI bahosi
            </span>
            <Badge className={v.tone}>{v.label}</Badge>
          </div>
          <p className="mt-1 text-sm text-slate-700">{review.summary}</p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <ListBlock title="Kuchli tomonlar" items={review.strengths} tone="text-emerald-700" icon={<CheckCircle2 className="h-4 w-4" />} />
        <ListBlock title="Kamchiliklar" items={review.gaps} tone="text-rose-700" icon={<AlertTriangle className="h-4 w-4" />} />
      </div>
      <ListBlock title="Tavsiyalar" items={review.recommendations} tone="text-indigo-700" icon={<Lightbulb className="h-4 w-4" />} />
      {review.next_step && (
        <div className="flex items-start gap-2 rounded-xl bg-white p-3 text-sm ring-1 ring-violet-100">
          <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
          <span>
            <b className="text-violet-800">Keyingi qadam:</b> {review.next_step}
          </span>
        </div>
      )}
      <p className="text-xs text-slate-400">{meta(review.provider, review.model, review.at)}</p>
    </div>
  );
}

export function AIAdviceView({ advice, title = 'AI tahlili' }: { advice: AIAdvice; title?: string }) {
  return (
    <div className="space-y-3 rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-4">
      <div className="flex items-start gap-3">
        <ScoreRing score={advice.score} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 text-sm font-semibold text-violet-800">
            <Sparkles className="h-4 w-4" /> {title}
          </p>
          <p className="mt-1 text-sm text-slate-700">{advice.summary}</p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <ListBlock title="Yaxshi tomonlar" items={advice.highlights} tone="text-emerald-700" icon={<CheckCircle2 className="h-4 w-4" />} />
        <ListBlock title="E'tibor bering" items={advice.concerns} tone="text-rose-700" icon={<AlertTriangle className="h-4 w-4" />} />
      </div>
      <ListBlock title="Tavsiyalar" items={advice.recommendations} tone="text-indigo-700" icon={<Target className="h-4 w-4" />} />
      <p className="text-xs text-slate-400">{meta(advice.provider, advice.model, advice.at)}</p>
    </div>
  );
}

export function AIErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <ErrorNote>
      {error}
      {/kalit/i.test(error) && (
        <a href="#/settings" className="ml-1 font-semibold underline">
          Sozlamalarga o'tish
        </a>
      )}
    </ErrorNote>
  );
}

/** Oddiy va xavfsiz markdown ko'rsatuvchi (sarlavha, ro'yxat, qalin matn) */
export function Markdown({ text }: { text: string }) {
  const lines = text.split('\n');
  const out: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? 'ol' : 'ul';
    out.push(
      <Tag key={out.length} className={cls('my-1 space-y-0.5 pl-5', list.ordered ? 'list-decimal' : 'list-disc')}>
        {list.items.map((it, i) => (
          <li key={i}>{inline(it)}</li>
        ))}
      </Tag>,
    );
    list = null;
  };
  for (const raw of lines) {
    const l = raw.trimEnd();
    const ul = /^\s*[-*•]\s+(.*)$/.exec(l);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(l);
    if (ul || ol) {
      const ordered = !!ol;
      if (!list || list.ordered !== ordered) {
        flush();
        list = { ordered, items: [] };
      }
      list.items.push((ul ?? ol)![1]);
      continue;
    }
    flush();
    const h = /^(#{1,4})\s+(.*)$/.exec(l);
    if (h) out.push(<p key={out.length} className="mt-2 font-semibold text-slate-900">{inline(h[2])}</p>);
    else if (l.trim()) out.push(<p key={out.length} className="my-1">{inline(l)}</p>);
  }
  flush();
  return <div className="text-sm leading-relaxed">{out}</div>;
}

function inline(s: string): React.ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <b key={i}>{part.slice(2, -2)}</b> : <React.Fragment key={i}>{part}</React.Fragment>,
  );
}
