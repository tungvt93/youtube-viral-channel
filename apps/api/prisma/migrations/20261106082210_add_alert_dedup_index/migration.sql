-- CreateIndex
CREATE INDEX "alerts_alert_type_entity_type_entity_id_triggered_at_idx" ON "alerts"("alert_type", "entity_type", "entity_id", "triggered_at" DESC);
