import { defineEventHandler, getQuery } from 'h3';
import { getPool } from '../db/index.js';

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

export default defineEventHandler(async (event) => {
  const { clientId } = getQuery(event);

  if (!clientId) {
    event.node.res.statusCode = 400;
    return { error: 'clientId is required' };
  }

  const now = new Date();
  const resetUtc = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1
  ));

  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT provider, tokens_used
       FROM daily_token_usage
       WHERE client_id = $1 AND date = CURRENT_DATE
       ORDER BY tokens_used DESC`,
      [clientId]
    );

    const usage = result.rows.map(row => ({
      provider: row.provider,
      tokensUsed: row.tokens_used,
      dailyLimit: DAILY_TOKEN_LIMITS[row.provider] ?? DAILY_TOKEN_LIMITS.default,
    }));

    return {
      usage,
      limits: DAILY_TOKEN_LIMITS,
      resetAt: resetUtc.toISOString(),
    };
  } catch (err) {
    console.error('[Usage API] DB error:', err);
    // If DB is unavailable, return empty usage
    return {
      usage: [],
      limits: DAILY_TOKEN_LIMITS,
      resetAt: resetUtc.toISOString(),
    };
  }
});
