import Anthropic from '@anthropic-ai/sdk';
import type { z } from 'zod';
import { validateAgentJSON } from './schemas.js';

// Tiered models (operator decision): Sonnet 4.6 for Extract + the council,
// Opus 4.8 for the Sutra synthesis the judges read closely.
export const COUNCIL_MODEL = 'claude-sonnet-4-6';
export const SUTRA_MODEL = 'claude-opus-4-8';

const TIMEOUT_MS = 90_000; // brief: 90s timeout per agent
const MAX_TOKENS = 4096;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
    client = new Anthropic({ apiKey });
  }
  return client;
}

/** Pull the first JSON object out of model text, tolerating ```json fences. */
function extractJSON(text: string): string {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1] : text;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return body.trim();
  return body.slice(start, end + 1);
}

function firstText(message: Anthropic.Message): string {
  for (const block of message.content) {
    if (block.type === 'text') return block.text;
  }
  return '';
}

export interface AgentCall<T> {
  model: string;
  system: string;
  user: string;
  schema: z.ZodType<T>;
  effort?: 'low' | 'medium' | 'high';
  label: string;
}

/**
 * One agent = one Anthropic call, isolated context, JSON-only response,
 * zod-validated. Timeout 90s, one retry (brief §4 / §6). The model output shape
 * is never trusted: it goes through validateAgentJSON (the same choke point the
 * zod-rejection test exercises) and a failure triggers exactly one stricter
 * retry before giving up.
 */
export async function callAgentJSON<T>(opts: AgentCall<T>): Promise<T> {
  const { model, system, user, schema, effort, label } = opts;
  const anthropic = getClient();

  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const userContent =
      attempt === 0
        ? user
        : `${user}\n\nIMPORTANT: Your previous reply was not valid JSON matching the required shape. Respond with ONLY a single JSON object, no prose, no markdown fences.`;
    try {
      const message = await anthropic.messages.create(
        {
          model,
          max_tokens: MAX_TOKENS,
          system,
          messages: [{ role: 'user', content: userContent }],
          ...(effort ? { output_config: { effort } } : {}),
        } as Anthropic.MessageCreateParamsNonStreaming,
        { timeout: TIMEOUT_MS, maxRetries: 0 },
      );
      return validateAgentJSON(schema, extractJSON(firstText(message)));
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(
    `Agent "${label}" failed after retry: ${
      lastErr instanceof Error ? lastErr.message : String(lastErr)
    }`,
  );
}
