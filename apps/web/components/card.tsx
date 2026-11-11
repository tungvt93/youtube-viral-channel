import styles from "./card.module.css";

export function Card({ label, value }: { label: string; value: string | number }) {
  return (
    <div className={styles.card}>
      <p className={styles.label}>{label}</p>
      <p className={styles.value}>{value}</p>
    </div>
  );
}

/** For a card whose metric this phase doesn't compute yet — never renders a fabricated `0` (PRD §13.7). */
export function UnavailableCard({ label }: { label: string }) {
  return (
    <div className={styles.card}>
      <p className={styles.label}>{label}</p>
      <p className={styles.unavailable}>Not available yet</p>
    </div>
  );
}
