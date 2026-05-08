import { defineEventHandler } from 'h3';
import { getPool } from '../db/index.js';

const DAILY_BUDGET_USD = 0.50;

export default defineEventHandler(async (event) => {
  const now = new Date();
  const resetUtc = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1
  ));

  const session = await getUserSession(event);
  const userEmail = session?.user?.email;

  if (!userEmail) {
    return {
      unauthenticated: true,
      totalSpend: 0,
      totalTokens: 0,
      budget: DAILY_BUDGET_USD,
      percentage: 0,
      resetAt: resetUtc.toISOString(),
    };
  }

  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT COALESCE(SUM(spend_usd), 0)::float AS total_spend,
              COALESCE(SUM(tokens_used), 0)::integer AS total_tokens
       FROM daily_token_usage
       WHERE client_id = $1 AND date = CURRENT_DATE`,
      [userEmail]
    );

    const totalSpend = parseFloat(result.rows[0].total_spend);
    const totalTokens = parseInt(result.rows[0].total_tokens, 10);
    const percentage = Math.min(100, (totalSpend / DAILY_BUDGET_USD) * 100);

    return {
      unauthenticated: false,
      totalSpend,
      totalTokens,
      budget: DAILY_BUDGET_USD,
      percentage,
      resetAt: resetUtc.toISOString(),
    };
  } catch (err) {
    console.error('[Usage API] DB error:', err);
    return {
      unauthenticated: false,
      totalSpend: 0,
      totalTokens: 0,
      budget: DAILY_BUDGET_USD,
      percentage: 0,
      resetAt: resetUtc.toISOString(),
    };
  }
});
