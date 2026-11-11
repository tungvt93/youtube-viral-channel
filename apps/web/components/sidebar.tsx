import Link from "next/link";
import styles from "./sidebar.module.css";

/** PRD §13.1 main navigation. */
const NAV_ITEMS: { label: string; href?: string }[] = [
  { label: "Overview", href: "/" },
  { label: "Viral Videos", href: "/videos" },
  { label: "Channel Discovery", href: "/channels" },
  { label: "Topic Trends", href: "/topics" },
  { label: "Watchlist", href: "/watchlist" },
  { label: "Alerts", href: "/alerts" },
  { label: "Discovery Sources", href: "/discovery" },
  { label: "Settings", href: "/settings" },
  { label: "System Health", href: "/system" },
];

export function Sidebar() {
  return (
    <nav className={styles.sidebar} aria-label="Main navigation">
      <div className={styles.brand}>YVI</div>
      <ul className={styles.nav} style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {NAV_ITEMS.map((item) =>
          item.href ? (
            <li key={item.label}>
              <Link href={item.href} className={styles.link}>
                {item.label}
              </Link>
            </li>
          ) : (
            <li key={item.label}>
              <span className={styles.disabled} aria-disabled="true">
                {item.label}
              </span>
            </li>
          ),
        )}
      </ul>
    </nav>
  );
}
