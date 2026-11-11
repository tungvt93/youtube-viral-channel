import type { ReactNode } from "react";
import { Sidebar } from "../../components/sidebar";
import styles from "../layout.module.css";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <Sidebar />
      <main className={styles.content}>{children}</main>
    </div>
  );
}
