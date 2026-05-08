-- Nimbus Chat Database Schema
-- Run this SQL to initialize the database tables

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users table (lightweight, keyed by session/device fingerprint)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Conversations table
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL DEFAULT 'Untitled',
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  branch_path JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_last_updated ON conversations(last_updated DESC);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
  id VARCHAR(255) PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'tool', 'system')),
  content TEXT,
  timestamp TIMESTAMPTZ,
  complete BOOLEAN DEFAULT TRUE,
  -- Branching metadata
  parent_id VARCHAR(255),
  branch_index INTEGER NOT NULL DEFAULT 0,
  -- User message fields
  attachments JSONB,
  -- Assistant message fields
  reasoning TEXT,
  reasoning_start_time DOUBLE PRECISION,
  reasoning_end_time DOUBLE PRECISION,
  reasoning_duration DOUBLE PRECISION,
  tool_calls JSONB,
  api_call_time DOUBLE PRECISION,
  first_token_time DOUBLE PRECISION,
  completion_time DOUBLE PRECISION,
  token_count INTEGER,
  total_tokens INTEGER,
  prompt_tokens INTEGER,
  annotations JSONB,
  parts JSONB,
  -- Tool message fields
  tool_call_id VARCHAR(255),
  tool_name VARCHAR(255),
  -- Ordering
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_position ON messages(conversation_id, position);

-- Daily token usage tracking for server-key rate limiting
CREATE TABLE IF NOT EXISTS daily_token_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id VARCHAR(255) NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  provider VARCHAR(50) NOT NULL DEFAULT 'default',
  tokens_used INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, date, provider)
);
CREATE INDEX IF NOT EXISTS idx_daily_token_usage_client_date ON daily_token_usage(client_id, date);

-- Migration: add USD cost tracking and authenticated user email
ALTER TABLE daily_token_usage ADD COLUMN IF NOT EXISTS user_email VARCHAR(255);
ALTER TABLE daily_token_usage ADD COLUMN IF NOT EXISTS spend_usd DECIMAL(10,6) NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_daily_token_usage_email_date ON daily_token_usage(user_email, date);
