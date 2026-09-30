import { useCallback } from 'react';
import { ADVICE_SCHEMA, REVIEW_SCHEMA, generateJSON, getAIConfig, type JSONRequest } from './ai';
import { useData } from './store';
import type { AIAdvice, AIReview } from './types';

type Req = Omit<JSONRequest, 'schema'>;

/** Joriy profil sozlamalari (provayder, model) bilan AI chaqiruvlari */
export function useAI() {
  const { profile } = useData();

  const json = useCallback(<T,>(req: JSONRequest) => generateJSON<T>(getAIConfig(profile), req), [profile]);

  const review = useCallback(
    async (req: Req): Promise<AIReview> => {
      const res = await generateJSON<Omit<AIReview, 'provider' | 'model' | 'at'>>(getAIConfig(profile), {
        ...req,
        schema: REVIEW_SCHEMA,
      });
      const d = res.data;
      return {
        score: Math.max(0, Math.min(100, Math.round(Number(d.score) || 0))),
        verdict: d.verdict ?? 'insufficient_evidence',
        summary: d.summary ?? '',
        strengths: d.strengths ?? [],
        gaps: d.gaps ?? [],
        recommendations: d.recommendations ?? [],
        next_step: d.next_step ?? '',
        provider: res.provider,
        model: res.model,
        at: Date.now(),
      };
    },
    [profile],
  );

  const advice = useCallback(
    async (req: Req): Promise<AIAdvice> => {
      const res = await generateJSON<Omit<AIAdvice, 'provider' | 'model' | 'at'>>(getAIConfig(profile), {
        ...req,
        schema: ADVICE_SCHEMA,
      });
      const d = res.data;
      return {
        summary: d.summary ?? '',
        score: Math.max(0, Math.min(100, Math.round(Number(d.score) || 0))),
        highlights: d.highlights ?? [],
        concerns: d.concerns ?? [],
        recommendations: d.recommendations ?? [],
        provider: res.provider,
        model: res.model,
        at: Date.now(),
      };
    },
    [profile],
  );

  return { json, review, advice };
}
