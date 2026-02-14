-- Market feature tables (Polymarket + Kalshi)
-- Used by Prisma ORM - schema must match prisma/schema.prisma

CREATE TABLE IF NOT EXISTS "markets" (
    "id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "markets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "markets_external_id_key" ON "markets"("external_id");
CREATE INDEX IF NOT EXISTS "markets_source_status_idx" ON "markets"("source", "status");

CREATE TABLE IF NOT EXISTS "market_snapshots" (
    "id" TEXT NOT NULL,
    "market_id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "volume" DOUBLE PRECISION,
    "liquidity" DOUBLE PRECISION,
    "spread" DOUBLE PRECISION,
    "bid" DOUBLE PRECISION,
    "ask" DOUBLE PRECISION,
    "raw_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "market_snapshots_market_id_timestamp_idx" ON "market_snapshots"("market_id", "timestamp");
ALTER TABLE "market_snapshots" ADD CONSTRAINT "market_snapshots_market_id_fkey" 
    FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "market_signals" (
    "id" TEXT NOT NULL,
    "market_id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "ai_score" INTEGER NOT NULL,
    "confidence" TEXT,
    "labels" TEXT[],
    "explanation" TEXT,
    "explanation_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_signals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "market_signals_market_id_timestamp_idx" ON "market_signals"("market_id", "timestamp");
ALTER TABLE "market_signals" ADD CONSTRAINT "market_signals_market_id_fkey" 
    FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
