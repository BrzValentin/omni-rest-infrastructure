"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { mutate, BrowserApiError } from "@/lib/browser-api";
import type { Session } from "@/lib/auth-contract";
import styles from "@/app/admin/admin.module.css";

export function LoginForm({ returnPath }: { returnPath: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    if (!emailRef.current?.validity.valid || !password) {
      setError("Enter a valid email and password."); emailRef.current?.focus(); return;
    }
    setPending(true); setError(null);
    try {
      const session = await mutate<Session>("/api/v1/auth/login", "POST", { email, password, returnPath });
      router.replace(session?.returnPath ?? "/admin"); router.refresh();
    } catch (caught) {
      setPassword("");
      const api = caught instanceof BrowserApiError ? caught : null;
      setError(api?.status === 429 ? "Too many attempts. Wait 15 minutes, then try again." : api?.status === 0 ? "Check your connection and try again." : api?.status === 503 ? "Sign-in is temporarily unavailable. Try again later." : "The email or password is invalid.");
    } finally { setPending(false); }
  }

  return <section className={styles.loginCard} aria-labelledby="login-title">
    <p className={styles.eyebrow}>Owner Portal</p><h1 id="login-title">Sign In</h1>
    <p>Manage the restaurant’s published information.</p>
    <form onSubmit={submit} noValidate>
      <label htmlFor="email">Email</label>
      <input ref={emailRef} id="email" name="email" type="email" autoComplete="username" spellCheck={false} required value={email} onChange={(e) => setEmail(e.target.value)} />
      <label htmlFor="password">Password</label>
      <div className={styles.passwordRow}><input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /><button type="button" aria-pressed={showPassword} onClick={() => setShowPassword((value) => !value)}>{showPassword ? "Hide" : "Show"}</button></div>
      <p className={styles.error} role="alert" aria-live="polite">{error}</p>
      <button className={styles.primaryButton} type="submit" disabled={pending}>{pending ? "Signing in…" : "Sign In"}</button>
    </form>
  </section>;
}
