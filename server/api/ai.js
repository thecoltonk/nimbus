import { defineEventHandler, readBody } from 'h3';
import OpenAI from 'openai';
import { getPool } from '../db/index.js';

// Cost per 1,000 tokens by provider (USD). Last reviewed: 2025-05.
// Update these values quarterly as providers adjust pricing.
const COST_PER_1K_TOKENS = {
  anthropic:  0.015,
  openai:     0.010,
  google:     0.005,
  'x-ai':     0.002,
  deepseek:   0.002,
  moonshotai: 0.002,
  minimax:    0.003,
  perplexity: 0.008,
  qwen:       0.002,
  'z-ai':     0.003,
  default:    0.010,
};

const DAILY_BUDGET_USD = 0.50;

function getProvider(modelId) {
  if (!modelId) return 'default';
  const prefix = modelId.split('/')[0].toLowerCase();
  return COST_PER_1K_TOKENS[prefix] !== undefined ? prefix : 'default';
}

function calcSpendUsd(tokens, provider) {
  const rate = COST_PER_1K_TOKENS[provider] ?? COST_PER_1K_TOKENS.default;
  return (tokens / 1000) * rate;
}

async function getSpendToday(userEmail) {
  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT COALESCE(SUM(spend_usd), 0)::float AS total
       FROM daily_token_usage
       WHERE client_id = $1 AND date = CURRENT_DATE`,
      [userEmail]
    );
    return parseFloat(result.rows[0].total);
  } catch (err) {
    console.error('[AI] getSpendToday failed:', err.message);
    return 0;
  }
}

async function recordSpend(userEmail, provider, tokens, spendUsd) {
  if (!userEmail || tokens <= 0) return;
  console.log(`[AI] Recording $${spendUsd.toFixed(6)} spend (${tokens} tokens, ${provider})`);
  try {
    const pool = getPool();
    await pool.query(
      `INSERT INTO daily_token_usage (client_id, user_email, date, provider, tokens_used, spend_usd)
       VALUES ($1, $2, CURRENT_DATE, $3, $4, $5)
       ON CONFLICT (client_id, date, provider)
       DO UPDATE SET
         tokens_used = daily_token_usage.tokens_used + EXCLUDED.tokens_used,
         spend_usd   = daily_token_usage.spend_usd + EXCLUDED.spend_usd,
         updated_at  = NOW()`,
      [userEmail, userEmail, provider, tokens, spendUsd]
    );
  } catch (err) {
    console.error('[AI] DB insert failed:', err.message);
  }
}

function estimateTokens(inputJson, outputText) {
  const inputChars = typeof inputJson === 'string' ? inputJson.length : JSON.stringify(inputJson || []).length;
  const outputChars = (outputText || '').length;
  const estimate = Math.ceil((inputChars + outputChars) / 4);
  console.log(`[AI] Token estimate: input=${inputChars} chars, output=${outputChars} chars, tokens≈${estimate}`);
  return estimate;
}

export default defineEventHandler(async (event) => {
  const body = await readBody(event);

  const customApiKey = body.customApiKey;
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
        code: 401,
      }
    }));
    return;
  }

  const modelId = body.model;
  const provider = getProvider(modelId);

  let userEmail = null;
  if (usingServerKey) {
    const session = await getUserSession(event);
    userEmail = session?.user?.email;

    if (!userEmail) {
      event.node.res.statusCode = 401;
      event.node.res.setHeader('Content-Type', 'application/json');
      event.node.res.end(JSON.stringify({
        error: {
          type: 'authentication_required',
          message: 'Please sign in with Google to use the shared server key. Add your own API key in Settings for keyless access.',
          code: 401,
          requiresAuth: true,
        }
      }));
      return;
    }

    const todaySpend = await getSpendToday(userEmail);
    if (todaySpend >= DAILY_BUDGET_USD) {
      const now = new Date();
      const resetUtc = new Date(Date.UTC(
        now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1
      ));
      event.node.res.statusCode = 429;
      event.node.res.setHeader('Content-Type', 'application/json');
      event.node.res.end(JSON.stringify({
        error: {
          type: 'rate_limit_error',
          message: `Daily budget of $${DAILY_BUDGET_USD.toFixed(2)} reached. Add your own API key in Settings for unlimited usage, or wait for the daily reset.`,
          code: 429,
          resetAt: resetUtc.toISOString(),
          spendUsd: todaySpend,
          dailyBudget: DAILY_BUDGET_USD,
        }
      }));
      return;
    }
  }

  const openai = new OpenAI({
    apiKey,
    baseURL: 'https://ai.hackclub.com/proxy/v1',
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

      if (usingServerKey && userEmail) {
        const tokens = completion.usage?.total_tokens
          ?? estimateTokens(requestMessages, completion.choices?.[0]?.message?.content);
        await recordSpend(userEmail, provider, tokens, calcSpendUsd(tokens, provider));
      }

      event.node.res.setHeader('Content-Type', 'application/json');
      event.node.res.end(JSON.stringify(completion));
      return;
    }

    // ── Streaming branch ──────────────────────────────────────────────────
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

    if (usingServerKey && userEmail) {
      const tokens = estimateTokens(requestMessages, fullText);
      await recordSpend(userEmail, provider, tokens, calcSpendUsd(tokens, provider));
    }

  } catch (error) {
    console.error('[AI] Chat completion error:', error);

    if (stream === false) {
      event.node.res.statusCode = error.status || 500;
      event.node.res.setHeader('Content-Type', 'application/json');
      event.node.res.end(JSON.stringify({
        error: {
          type: error.type || 'api_error',
          message: error.message || 'Failed to connect to AI service',
          code: error.status || 500,
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
          code: error.status || 500,
        }
      })}\n\n`);
      event.node.res.write('data: [DONE]\n\n');
      event.node.res.end();
    }
  }
});
