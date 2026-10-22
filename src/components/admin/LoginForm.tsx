"use client";
import { useState } from "react";
import { adminPost } from "./api";

export default function LoginForm() {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function go(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await adminPost("/api/admin/login", { password: pw });
      window.location.href = "/admin";
    } catch (x) {
      setErr((x as Error).message);
      setBusy(false);
    }
  }
  return (
    <form onSubmit={go} className="card mx-auto mt-24 max-w-sm space-y-4 p-6">
      <h1 className="font-display text-xl font-bold">Admin</h1>
      <input className="input" type="password" autoFocus placeholder="Password" value={pw} onChange={(e) => setPw(e.target.value)} />
      {err && <div className="text-sm text-rose">{err}</div>}
      <button className="btn w-full" disabled={busy || !pw}>{busy ? "..." : "Sign in"}</button>
    </form>
  );
}
