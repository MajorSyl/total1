"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (authError) throw authError;

      const { data: staffRow, error: staffError } = await supabase
        .from("staff")
        .select("id")
        .eq("auth_user_id", data.user.id)
        .maybeSingle();

      if (staffError) throw staffError;

      if (!staffRow) {
        await supabase.auth.signOut();
        throw new Error("No staff profile linked to this account. Ask an admin to add you.");
      }

      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message ?? "Login failed — check your details.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#14161A",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <div
        style={{
          backgroundColor: "#1B1E24",
          border: "1px solid #2A2F38",
          borderRadius: 16,
          padding: "40px 36px",
          width: "100%",
          maxWidth: 400,
        }}
      >
        <p style={{ color: "#8A909B", fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 8 }}>
          Mall Expiry Tracker
        </p>
        <h1 style={{ color: "#E7E9EC", fontSize: 24, fontWeight: 600, marginBottom: 28 }}>
          Manager sign in
        </h1>

        <form onSubmit={handleLogin}>
          <label style={{ display: "block", color: "#8A909B", fontSize: 12, marginBottom: 6 }}>
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="you@mall.com"
            style={{
              display: "block",
              width: "100%",
              padding: "10px 14px",
              backgroundColor: "#22262E",
              border: "1px solid #2A2F38",
              borderRadius: 8,
              color: "#E7E9EC",
              fontSize: 15,
              marginBottom: 16,
              boxSizing: "border-box",
              outline: "none",
            }}
          />

          <label style={{ display: "block", color: "#8A909B", fontSize: 12, marginBottom: 6 }}>
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="••••••••"
            style={{
              display: "block",
              width: "100%",
              padding: "10px 14px",
              backgroundColor: "#22262E",
              border: "1px solid #2A2F38",
              borderRadius: 8,
              color: "#E7E9EC",
              fontSize: 15,
              marginBottom: 24,
              boxSizing: "border-box",
              outline: "none",
            }}
          />

          {error && (
            <p style={{ color: "#E5484D", fontSize: 13, marginBottom: 16 }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              display: "block",
              width: "100%",
              padding: "12px",
              backgroundColor: loading ? "#2a3d6b" : "#2563eb",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontSize: 15,
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
