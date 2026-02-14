-- Market schema v2: multi-source support (Polymarket + Kalshi)
-- Drops and recreates tables with new structure; tables likely empty from 005

DROP TABLE IF EXISTS "market_signals";
DROP TABLE IF EXISTS "market_snapshots";
DROP TABLE IF EXISTS "markets";

CREATE TABLE "markets" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "category" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "markets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "markets_source_external_id_key" ON "markets"("source", "external_id");
CREATE INDEX "markets_source_status_idx" ON "markets"("source", "status");

CREATE TABLE "market_snapshots" (
    "id" TEXT NOT NULL,
    "market_id" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL,
    "probability" DOUBLE PRECISION,
    "price_yes" DOUBLE PRECISION,
    "price_no" DOUBLE PRECISION,
    "volume" DOUBLE PRECISION,
    "liquidity" DOUBLE PRECISION,
    "spread" DOUBLE PRECISION,
    "raw" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "market_snapshots_market_id_ts_idx" ON "market_snapshots"("market_id", "ts");
ALTER TABLE "market_snapshots" ADD CONSTRAINT "market_snapshots_market_id_fkey"
    FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "market_signals" (
    "id" TEXT NOT NULL,
    "market_id" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL,
    "score" INTEGER NOT NULL,
    "confidence" TEXT NOT NULL,
    "explanation" TEXT,
    "features" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_signals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "market_signals_market_id_ts_idx" ON "market_signals"("market_id", "ts");
ALTER TABLE "market_signals" ADD CONSTRAINT "market_signals_market_id_fkey"
    FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
