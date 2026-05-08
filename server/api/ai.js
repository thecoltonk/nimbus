import { defineEventHandler, readBody } from 'h3';
import OpenAI from 'openai';
import { getPool } from '../db/index.js';

// Daily token limits per provider (roughly $0.50 equivalent each)
const DAILY_TOKEN_LIMITS = {
  anthropic:  25000,
  openai:     40000,
  google:     400000,
  deepseek:   200000,
  minimax:    150000,
  moonshotai: 150000,
  perplexity:  50000,
  qwen:       150000,
  'x-ai':      50000,
  'z-ai':     100000,
  default:    100000,
};

function getProvider(modelId) {
  if (!modelId) return 'default';
  const prefix = modelId.split('/')[0].toLowerCase();
  return DAILY_TOKEN_LIMITS[prefix] !== undefined ? prefix : 'default';
}

function getDailyLimit(modelId) {
  return DAILY_TOKEN_LIMITS[getProvider(modelId)] ?? DAILY_TOKEN_LIMITS.default;
}

async function getTokensUsedToday(clientId, provider) {
  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT COALESCE(SUM(tokens_used), 0)::integer AS total
       FROM daily_token_usage
       WHERE client_id = $1 AND date = CURRENT_DATE AND provider = $2`,
      [clientId, provider]
    );
    return parseInt(result.rows[0].total, 10);
  } catch (err) {
    console.error('[AI] getTokensUsedToday failed:', err.message);
    return 0;
  }
}

async function recordTokenUsage(clientId, provider, tokensUsed) {
  if (!clientId || tokensUsed <= 0) {
    console.warn('[AI] recordTokenUsage skipped — clientId:', clientId, 'tokens:', tokensUsed);
    return;
  }
  console.log(`[AI] Tokens consumed: ${tokensUsed} (provider: ${provider}, client: ${clientId.slice(0, 8)}…)`);
  try {
    const pool = getPool();
    await pool.query(
      `INSERT INTO daily_token_usage (client_id, date, provider, tokens_used)
       VALUES ($1, CURRENT_DATE, $2, $3)
       ON CONFLICT (client_id, date, provider)
       DO UPDATE SET
         tokens_used = daily_token_usage.tokens_used + EXCLUDED.tokens_used,
         updated_at = NOW()`,
      [clientId, provider, tokensUsed]
    );
    console.log(`[AI] Token usage recorded successfully.`);
  } catch (err) {
    console.error('[AI] DB insert failed:', err.message, err.stack);
  }
}

// Character-based token estimate (4 chars ≈ 1 token)
function estimateTokens(inputJson, outputText) {
  const inputChars = typeof inputJson === 'string' ? inputJson.length : JSON.stringify(inputJson || []).length;
  const outputChars = (outputText || '').length;
  const estimate = Math.ceil((inputChars + outputChars) / 4);
  console.log(`[AI] Token estimate (chars): input=${inputChars}, output=${outputChars}, tokens≈${estimate}`);
  return estimate;
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event);

  const customApiKey = body.customApiKey;
  const clientId = body.clientId;
  // Snapshot messages before stripping internal fields
  const requestMessages = body.messages;
  delete body.customApiKey;
  delete body.clientId;

  const config = useRuntimeConfig(event);

  const serverKey = config.hackclubAiKey || process.env.NUXT_HACKCLUB_AI_KEY || process.env.HCAI_API_KEY;
  const usingServerKey = !customApiKey && !!serverKey;
  const apiKey = customApiKey || serverKey;

  if (!apiKey) {
    event.node.res.statusCode = 401;
    event.node.res.setHeader('Content-Type', 'application/json');
    event.node.res.end(JSON.stringify({
      error: {
        type: 'authentication_error',
        message: 'No API key available. Please add your own API key in Settings.',
        code: 401
      }
    }));
    return;
  }

  const modelId = body.model;
  const provider = getProvider(modelId);
  const dailyLimit = getDailyLimit(modelId);

  // Rate-limit check (server key only)
  if (usingServerKey && clientId) {
    const used = await getTokensUsedToday(clientId, provider);
    if (used >= dailyLimit) {
      const now = new Date();
      const resetUtc = new Date(Date.UTC(
        now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1
      ));
      event.node.res.statusCode = 429;
      event.node.res.setHeader('Content-Type', 'application/json');
      event.node.res.end(JSON.stringify({
        error: {
          type: 'rate_limit_error',
          message: 'Daily server token limit reached. Add your own API key in Settings for unlimited usage, or wait for the daily reset.',
          code: 429,
          resetAt: resetUtc.toISOString(),
          tokensUsed: used,
          dailyLimit,
          provider,
        }
      }));
      return;
    }
  }

  const openai = new OpenAI({
    apiKey,
    baseURL: 'https://ai.hackclub.com/proxy/v1'
  });

  const { stream = true, ...rest } = body;
  const completionParams = { ...rest, stream };

  try {
    // ── Non-streaming branch ──────────────────────────────────────────────
    if (!stream) {
      const completion = await openai.chat.completions.create({
        ...completionParams,
        stream: false,
      });

      if (usingServerKey && clientId) {
        const tokens = completion.usage?.total_tokens
          ?? estimateTokens(requestMessages, completion.choices?.[0]?.message?.content);
        await recordTokenUsage(clientId, provider, tokens);
      }

      event.node.res.setHeader('Content-Type', 'application/json');
      event.node.res.end(JSON.stringify(completion));
      return;
    }

    // ── Streaming branch ──────────────────────────────────────────────────
    // NOTE: Do NOT pass stream_options — the HCAI proxy may not support it
    // and will cause the request to fail. We fall back to char estimation instead.
    const streamResp = await openai.chat.completions.create({
      ...completionParams,
      stream: true,
    });

    event.node.res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    event.node.res.setHeader('Cache-Control', 'no-cache');
    event.node.res.setHeader('Connection', 'keep-alive');
    event.node.res.setHeader('Transfer-Encoding', 'chunked');

    let fullText = '';

    for await (const chunk of streamResp) {
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) fullText += delta;
      event.node.res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    }

    event.node.res.write('data: [DONE]\n\n');
    event.node.res.end();

    if (usingServerKey && clientId) {
      const estimatedTokens = Math.ceil(fullText.length / 4);
      console.log('>>> [DEBUG] ATTEMPTING POSTGRES INSERT:', estimatedTokens, 'tokens for', provider);
      try {
        const pool = getPool();
        await pool.query(
          `INSERT INTO daily_token_usage (client_id, date, provider, tokens_used)
           VALUES ($1, CURRENT_DATE, $2, $3)
           ON CONFLICT (client_id, date, provider)
           DO UPDATE SET
             tokens_used = daily_token_usage.tokens_used + EXCLUDED.tokens_used,
             updated_at = NOW()`,
          [clientId, provider, estimatedTokens]
        );
        console.log(`[AI] Token usage recorded successfully.`);
      } catch (error) {
        console.error('>>> [DEBUG] POSTGRES INSERT FAILED:', error);
      }
    }

  } catch (error) {
    console.error('[AI] Chat completion error:', error);

    if (stream === false) {
      event.node.res.setHeader('Content-Type', 'application/json');
      event.node.res.statusCode = error.status || 500;
      event.node.res.end(JSON.stringify({
        error: {
          type: error.type || 'api_error',
          message: error.message || 'Failed to connect to AI service',
          code: error.status || 500
        }
      }));
    } else {
      event.node.res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      event.node.res.setHeader('Cache-Control', 'no-cache');
      event.node.res.setHeader('Connection', 'keep-alive');

      event.node.res.write(`data: ${JSON.stringify({
        error: {
          type: error.type || 'api_error',
          message: error.message || 'Failed to connect to AI service',
          code: error.status || 500
        }
      })}\n\n`);
      event.node.res.write('data: [DONE]\n\n');
      event.node.res.end();
    }
  }
});
