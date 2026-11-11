import styles from "./watchlist-toggle.module.css";

/** Star/unstar control (PRD FR-VID-08/FR-CH-06) shared by the videos/channels list+detail pages and the watchlist page — the caller binds the entity id into the Server Action via `.bind(null, id)` so this component stays entity-agnostic. */
export function WatchlistToggle({
  isWatchlisted,
  starAction,
  unstarAction,
}: {
  isWatchlisted: boolean;
  starAction: () => Promise<void>;
  unstarAction: () => Promise<void>;
}) {
  return (
    <form action={isWatchlisted ? unstarAction : starAction} className={styles.form}>
      <button type="submit" className={styles.button} aria-label={isWatchlisted ? "Remove from watchlist" : "Add to watchlist"} title={isWatchlisted ? "Remove from watchlist" : "Add to watchlist"}>
        {isWatchlisted ? "★" : "☆"}
      </button>
    </form>
  );
}
