"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import styles from "./login.module.css";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        setError("Invalid email or password");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={onSubmit}>
      <p className={styles.title}>Sign in</p>
      <label className={styles.field}>
        Email
        <input className={styles.input} type="email" name="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoFocus />
      </label>
      <label className={styles.field}>
        Password
        <input className={styles.input} type="password" name="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
      </label>
      {error && <p className={styles.error}>{error}</p>}
      <button className={styles.button} type="submit" disabled={submitting}>
        {submitting ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
