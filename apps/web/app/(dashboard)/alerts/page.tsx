import Link from "next/link";
import { fetchApi } from "../../../lib/api";
import { AlertReadToggle } from "../../../components/alert-read-toggle";
import tableStyles from "../../../components/data-table.module.css";
import styles from "./alerts.module.css";
import { markAlertRead } from "./actions";

interface AlertListItemDto {
  id: string;
  alertType: string;
  entityType: string;
  entityId: string;
  message: string;
  severity: string;
  isRead: boolean;
  triggeredAt: string;
  readAt: string | null;
}

/** `entityId` is a bare foreign key for video/channel alerts but a composite `"${marketId}:${topicId}"` for topic alerts (plan Decisions/Risks) — split on `:` before linking to the topic detail page. */
function entityHref(entityType: string, entityId: string): string | null {
  if (entityType === "video") return `/videos/${entityId}`;
  if (entityType === "channel") return `/channels/${entityId}`;
  if (entityType === "topic") {
    const topicId = entityId.split(":")[1];
    return topicId ? `/topics/${topicId}` : null;
  }
  return null;
}

/** Alerts page (PRD §11.7/§16.7) — lists in-app alerts newest-first, with a mark-read action per row. */
export default async function AlertsPage() {
  const alerts = await fetchApi<AlertListItemDto[]>("/alerts");

  return (
    <div>
      <h1 className={styles.heading}>Alerts</h1>

      <div className={styles.panel}>
        {alerts.length > 0 ? (
          <table className={tableStyles.table}>
            <thead>
              <tr>
                <th>Message</th>
                <th>Type</th>
                <th>Triggered</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((alert) => {
                const href = entityHref(alert.entityType, alert.entityId);
                return (
                  <tr key={alert.id}>
                    <td>{href ? <Link href={href}>{alert.message}</Link> : alert.message}</td>
                    <td>{alert.alertType}</td>
                    <td>{alert.triggeredAt.slice(0, 16).replace("T", " ")}</td>
                    <td>
                      <AlertReadToggle isRead={alert.isRead} markReadAction={markAlertRead.bind(null, alert.id)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className={tableStyles.empty}>No alerts yet.</p>
        )}
      </div>
    </div>
  );
}
