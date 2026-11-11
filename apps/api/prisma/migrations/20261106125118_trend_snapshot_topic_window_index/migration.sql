-- CreateIndex
CREATE INDEX "trend_snapshots_topic_id_window_end_idx" ON "trend_snapshots"("topic_id", "window_end" DESC);
