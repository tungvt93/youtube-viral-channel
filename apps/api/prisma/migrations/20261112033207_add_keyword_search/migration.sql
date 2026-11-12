-- CreateTable
CREATE TABLE "keyword_searches" (
    "id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "market_id" TEXT NOT NULL,
    "language" VARCHAR(10) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'queued',
    "job_run_id" TEXT,
    "videos_found" INTEGER,
    "recommended_videos_found" INTEGER,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "acknowledged_at" TIMESTAMP(3),

    CONSTRAINT "keyword_searches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "keyword_searches_created_at_idx" ON "keyword_searches"("created_at" DESC);

-- CreateIndex
CREATE INDEX "keyword_searches_status_acknowledged_at_idx" ON "keyword_searches"("status", "acknowledged_at");

-- AddForeignKey
ALTER TABLE "keyword_searches" ADD CONSTRAINT "keyword_searches_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
