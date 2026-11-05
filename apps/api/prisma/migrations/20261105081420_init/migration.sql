-- CreateTable
CREATE TABLE "markets" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(2) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "default_language" VARCHAR(10) NOT NULL,
    "timezone" VARCHAR(64) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "markets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discovery_queries" (
    "id" TEXT NOT NULL,
    "market_id" TEXT NOT NULL,
    "topic_id" TEXT,
    "query" TEXT NOT NULL,
    "language" VARCHAR(10) NOT NULL,
    "strategy" VARCHAR(40) NOT NULL,
    "priority" SMALLINT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "max_pages_per_run" SMALLINT NOT NULL,
    "frequency_minutes" INTEGER NOT NULL,
    "last_run_at" TIMESTAMP(3),
    "config" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discovery_queries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "videos" (
    "id" TEXT NOT NULL,
    "youtube_video_id" VARCHAR(32) NOT NULL,
    "channel_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "published_at" TIMESTAMP(3) NOT NULL,
    "duration_seconds" INTEGER,
    "category_id" VARCHAR(32) NOT NULL,
    "default_language" VARCHAR(10),
    "thumbnail_url" TEXT,
    "current_view_count" BIGINT,
    "current_like_count" BIGINT,
    "current_comment_count" BIGINT,
    "video_license" VARCHAR(32),
    "privacy_status" VARCHAR(32),
    "embeddable" BOOLEAN,
    "live_broadcast_content" VARCHAR(32),
    "format_classification" VARCHAR(32) NOT NULL DEFAULT 'unknown',
    "format_confidence" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "first_discovered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_enriched_at" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "videos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channels" (
    "id" TEXT NOT NULL,
    "youtube_channel_id" VARCHAR(32) NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "custom_url" TEXT,
    "thumbnail_url" TEXT,
    "creator_country" VARCHAR(2),
    "published_at" TIMESTAMP(3),
    "uploads_playlist_id" VARCHAR(128),
    "current_subscriber_count" BIGINT,
    "current_view_count" BIGINT,
    "current_video_count" BIGINT,
    "subscriber_count_hidden" BOOLEAN NOT NULL DEFAULT false,
    "first_discovered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_enriched_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discovery_events" (
    "id" TEXT NOT NULL,
    "video_id" TEXT NOT NULL,
    "market_id" TEXT NOT NULL,
    "discovery_query_id" TEXT,
    "source" VARCHAR(40) NOT NULL,
    "source_rank" INTEGER,
    "discovered_at" TIMESTAMP(3) NOT NULL,
    "source_payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discovery_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_snapshots" (
    "id" BIGSERIAL NOT NULL,
    "video_id" TEXT NOT NULL,
    "collected_at" TIMESTAMP(3) NOT NULL,
    "view_count" BIGINT,
    "like_count" BIGINT,
    "comment_count" BIGINT,
    "fetch_status" VARCHAR(20) NOT NULL,
    "source" VARCHAR(40) NOT NULL,
    "raw_hash" VARCHAR(64),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "video_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_snapshots" (
    "id" BIGSERIAL NOT NULL,
    "channel_id" TEXT NOT NULL,
    "collected_at" TIMESTAMP(3) NOT NULL,
    "subscriber_count" BIGINT,
    "view_count" BIGINT,
    "video_count" BIGINT,
    "fetch_status" VARCHAR(20) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channel_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topics" (
    "id" TEXT NOT NULL,
    "slug" VARCHAR(160) NOT NULL,
    "canonical_name" VARCHAR(200) NOT NULL,
    "description" TEXT NOT NULL,
    "parent_topic_id" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'candidate',
    "confidence" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "created_by" VARCHAR(20) NOT NULL,
    "merged_into_topic_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topic_localizations" (
    "id" TEXT NOT NULL,
    "topic_id" TEXT NOT NULL,
    "language" VARCHAR(10) NOT NULL,
    "localized_name" VARCHAR(200) NOT NULL,
    "synonyms" JSONB NOT NULL DEFAULT '[]',
    "seed_keywords" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "topic_localizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_topics" (
    "video_id" TEXT NOT NULL,
    "topic_id" TEXT NOT NULL,
    "relation_type" VARCHAR(20) NOT NULL,
    "confidence" DECIMAL(5,4) NOT NULL,
    "classification_model" VARCHAR(60) NOT NULL,
    "prompt_version" VARCHAR(40) NOT NULL,
    "classified_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_topics_pkey" PRIMARY KEY ("video_id","topic_id")
);

-- CreateTable
CREATE TABLE "trend_snapshots" (
    "id" BIGSERIAL NOT NULL,
    "market_id" TEXT NOT NULL,
    "topic_id" TEXT NOT NULL,
    "window_start" TIMESTAMP(3) NOT NULL,
    "window_end" TIMESTAMP(3) NOT NULL,
    "unique_video_count" INTEGER NOT NULL,
    "unique_channel_count" INTEGER NOT NULL,
    "total_observed_views" BIGINT,
    "median_vph" DECIMAL NOT NULL,
    "p90_vph" DECIMAL NOT NULL,
    "outlier_video_count" INTEGER NOT NULL,
    "momentum_score" DECIMAL(5,2) NOT NULL,
    "sample_confidence" DECIMAL(5,4) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trend_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_scores" (
    "id" TEXT NOT NULL,
    "video_id" TEXT NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL,
    "viral_score" DECIMAL(6,2) NOT NULL,
    "score_breakdown" JSONB NOT NULL,
    "data_confidence" DECIMAL(5,4) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "video_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_scores" (
    "id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL,
    "channel_score" DECIMAL(6,2) NOT NULL,
    "score_breakdown" JSONB NOT NULL,
    "data_confidence" DECIMAL(5,4) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channel_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "watchlist_items" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "entity_type" VARCHAR(20) NOT NULL,
    "entity_id" TEXT NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "watchlist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" TEXT NOT NULL,
    "alert_type" VARCHAR(40) NOT NULL,
    "entity_type" VARCHAR(20) NOT NULL,
    "entity_id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "severity" VARCHAR(20) NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "triggered_at" TIMESTAMP(3) NOT NULL,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_runs" (
    "id" TEXT NOT NULL,
    "job_name" VARCHAR(100) NOT NULL,
    "queue" VARCHAR(60) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3),
    "duration_ms" INTEGER,
    "result_count" INTEGER,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_usage_logs" (
    "id" BIGSERIAL NOT NULL,
    "endpoint" VARCHAR(100) NOT NULL,
    "quota_estimate" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "market_id" TEXT,
    "request_time" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_usage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_classification_runs" (
    "id" TEXT NOT NULL,
    "video_id" TEXT,
    "model" VARCHAR(60) NOT NULL,
    "prompt_version" VARCHAR(40) NOT NULL,
    "input_hash" VARCHAR(64) NOT NULL,
    "output" JSONB,
    "status" VARCHAR(20) NOT NULL,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "ai_classification_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "key" VARCHAR(100) NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "role" VARCHAR(20) NOT NULL DEFAULT 'admin',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "session_token" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "markets_code_key" ON "markets"("code");

-- CreateIndex
CREATE INDEX "discovery_queries_market_id_enabled_priority_idx" ON "discovery_queries"("market_id", "enabled", "priority");

-- CreateIndex
CREATE INDEX "discovery_queries_topic_id_idx" ON "discovery_queries"("topic_id");

-- CreateIndex
CREATE UNIQUE INDEX "videos_youtube_video_id_key" ON "videos"("youtube_video_id");

-- CreateIndex
CREATE INDEX "videos_published_at_idx" ON "videos"("published_at" DESC);

-- CreateIndex
CREATE INDEX "videos_current_view_count_idx" ON "videos"("current_view_count" DESC);

-- CreateIndex
CREATE INDEX "videos_channel_id_published_at_idx" ON "videos"("channel_id", "published_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "channels_youtube_channel_id_key" ON "channels"("youtube_channel_id");

-- CreateIndex
CREATE INDEX "discovery_events_market_id_discovered_at_idx" ON "discovery_events"("market_id", "discovered_at" DESC);

-- CreateIndex
CREATE INDEX "discovery_events_video_id_discovered_at_idx" ON "discovery_events"("video_id", "discovered_at" DESC);

-- CreateIndex
CREATE INDEX "discovery_events_source_discovered_at_idx" ON "discovery_events"("source", "discovered_at" DESC);

-- CreateIndex
CREATE INDEX "video_snapshots_video_id_collected_at_idx" ON "video_snapshots"("video_id", "collected_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "video_snapshots_video_id_collected_at_key" ON "video_snapshots"("video_id", "collected_at");

-- CreateIndex
CREATE INDEX "channel_snapshots_channel_id_collected_at_idx" ON "channel_snapshots"("channel_id", "collected_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "channel_snapshots_channel_id_collected_at_key" ON "channel_snapshots"("channel_id", "collected_at");

-- CreateIndex
CREATE UNIQUE INDEX "topics_slug_key" ON "topics"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "topic_localizations_topic_id_language_key" ON "topic_localizations"("topic_id", "language");

-- CreateIndex
CREATE UNIQUE INDEX "trend_snapshots_market_id_topic_id_window_start_window_end_key" ON "trend_snapshots"("market_id", "topic_id", "window_start", "window_end");

-- CreateIndex
CREATE INDEX "video_scores_video_id_computed_at_idx" ON "video_scores"("video_id", "computed_at" DESC);

-- CreateIndex
CREATE INDEX "channel_scores_channel_id_computed_at_idx" ON "channel_scores"("channel_id", "computed_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "watchlist_items_user_id_entity_type_entity_id_key" ON "watchlist_items"("user_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "alerts_is_read_triggered_at_idx" ON "alerts"("is_read", "triggered_at" DESC);

-- CreateIndex
CREATE INDEX "job_runs_queue_started_at_idx" ON "job_runs"("queue", "started_at" DESC);

-- CreateIndex
CREATE INDEX "api_usage_logs_endpoint_request_time_idx" ON "api_usage_logs"("endpoint", "request_time" DESC);

-- CreateIndex
CREATE INDEX "ai_classification_runs_status_created_at_idx" ON "ai_classification_runs"("status", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_session_token_key" ON "sessions"("session_token");

-- AddForeignKey
ALTER TABLE "discovery_queries" ADD CONSTRAINT "discovery_queries_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discovery_queries" ADD CONSTRAINT "discovery_queries_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "videos" ADD CONSTRAINT "videos_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discovery_events" ADD CONSTRAINT "discovery_events_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discovery_events" ADD CONSTRAINT "discovery_events_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discovery_events" ADD CONSTRAINT "discovery_events_discovery_query_id_fkey" FOREIGN KEY ("discovery_query_id") REFERENCES "discovery_queries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_snapshots" ADD CONSTRAINT "video_snapshots_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_snapshots" ADD CONSTRAINT "channel_snapshots_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topics" ADD CONSTRAINT "topics_parent_topic_id_fkey" FOREIGN KEY ("parent_topic_id") REFERENCES "topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topics" ADD CONSTRAINT "topics_merged_into_topic_id_fkey" FOREIGN KEY ("merged_into_topic_id") REFERENCES "topics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "topic_localizations" ADD CONSTRAINT "topic_localizations_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_topics" ADD CONSTRAINT "video_topics_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_topics" ADD CONSTRAINT "video_topics_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trend_snapshots" ADD CONSTRAINT "trend_snapshots_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trend_snapshots" ADD CONSTRAINT "trend_snapshots_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_scores" ADD CONSTRAINT "video_scores_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_scores" ADD CONSTRAINT "channel_scores_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watchlist_items" ADD CONSTRAINT "watchlist_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_usage_logs" ADD CONSTRAINT "api_usage_logs_market_id_fkey" FOREIGN KEY ("market_id") REFERENCES "markets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_classification_runs" ADD CONSTRAINT "ai_classification_runs_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
