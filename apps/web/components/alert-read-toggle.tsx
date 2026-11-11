import styles from "./alert-read-toggle.module.css";

/** Mark-read control (PRD §11.7/§16.7) for the Alerts page — one-directional (unlike `WatchlistToggle`, there is no "mark unread"), so a read alert renders as static text instead of a second button. */
export function AlertReadToggle({
  isRead,
  markReadAction,
}: {
  isRead: boolean;
  markReadAction: () => Promise<void>;
}) {
  if (isRead) {
    return <span className={styles.read}>Read</span>;
  }

  return (
    <form action={markReadAction} className={styles.form}>
      <button type="submit" className={styles.button}>
        Mark read
      </button>
    </form>
  );
}
