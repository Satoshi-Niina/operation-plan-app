"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "./ModuleHeader.module.css";

type ModuleHeaderProps = { tenant: string; eyebrow: string; title: string; description: string };

export function ModuleHeader({ tenant, eyebrow, title, description }: ModuleHeaderProps) {
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  useEffect(() => {
    const handleDirtyChange = (event: Event) => setHasUnsavedChanges((event as CustomEvent<boolean>).detail);
    window.addEventListener("operation-dirty-change", handleDirtyChange);
    return () => window.removeEventListener("operation-dirty-change", handleDirtyChange);
  }, []);

  function confirmNavigation(event: React.MouseEvent<HTMLAnchorElement>) {
    if (!hasUnsavedChanges) return;
    event.preventDefault();
    window.alert("変更がありますので保存してください。");
  }

  return <div className={styles.header}><div><p className={styles.eyebrow}>{eyebrow}</p><h1>{title}</h1><p className={styles.description}>{description}</p></div><Link href={`/${tenant}`} className={styles.back} onClick={confirmNavigation}>トップへ戻る</Link></div>;
}
