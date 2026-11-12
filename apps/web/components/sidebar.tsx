import Link from "next/link";
import { fetchApi } from "../lib/api";
import styles from "./sidebar.module.css";

interface KeywordSearchDto {
  id: string;
}

/** PRD §13.1 main navigation. */
const NAV_ITEMS: { label: string; href?: string }[] = [
  { label: "Overview", href: "/" },
  { label: "Viral Videos", href: "/videos" },
  { label: "Channel Discovery", href: "/channels" },
  { label: "Topic Trends", href: "/topics" },
  { label: "Watchlist", href: "/watchlist" },
  { label: "Alerts", href: "/alerts" },
  { label: "Search", href: "/search" },
  { label: "Settings", href: "/settings" },
  { label: "System Health", href: "/system" },
];

export async function Sidebar() {
  const unseen = await fetchApi<KeywordSearchDto[]>("/keyword-searches?unseen=true");

  return (
    <nav className={styles.sidebar} aria-label="Main navigation">
      <div className={styles.brand}>YVI</div>
      <ul className={styles.nav} style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {NAV_ITEMS.map((item) =>
          item.href ? (
            <li key={item.label}>
              <Link href={item.href} className={styles.link}>
                {item.label}
                {item.label === "Search" && unseen.length > 0 ? (
                  <span className={styles.badge} data-testid="unseen-search-badge">
                    {unseen.length}
                  </span>
                ) : null}
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
