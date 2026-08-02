import { redirect } from "next/navigation";
import { LoginForm } from "@/components/admin/LoginForm";
import { getSession } from "@/lib/server-api";
import { safeAdminReturnPath } from "@/lib/auth-contract";
import styles from "../admin.module.css";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ returnPath?: string }> }) {
  const [{ returnPath }, session] = await Promise.all([searchParams, getSession()]);
  if (session.status === 200) redirect(safeAdminReturnPath(returnPath));
  return <main className={styles.centered} id="main-content"><LoginForm returnPath={safeAdminReturnPath(returnPath)} /></main>;
}
