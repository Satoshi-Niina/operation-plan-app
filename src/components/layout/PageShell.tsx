import { ReactNode } from "react";
import { AppHeader } from "./AppHeader";
import styles from "./PageShell.module.css";

type PageShellProps = { tenant: string; children: ReactNode };

export function PageShell({ tenant, children }: PageShellProps) {
  return <><AppHeader tenant={tenant} /><main className={styles.main}>{children}</main></>;
}
