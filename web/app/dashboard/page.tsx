"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

type ExpiringBatch = {
  batch_id: string;
  product_name: string;
  barcode: string;
  category: string | null;
  store_name: string;
  batch_number: string | null;
  quantity: number;
  expiry_date: string;
  days_remaining: number;
  status: "active" | "expired";
};

// Freshness window used to scale the bar — batches beyond this just show full green
const FRESHNESS_WINDOW_DAYS = 30;

function freshnessColor(days: number) {
  if (days <= 0) return "var(--danger)";
  if (days <= 3) return "var(--danger)";
  if (days <= 7) return "var(--warning)";
  return "var(--safe)";
}

function FreshnessBar({ days }: { days: number }) {
  const pct = Math.max(0, Math.min(100, (days / FRESHNESS_WINDOW_DAYS) * 100));
  const color = freshnessColor(days);
  const label = days <= 0 ? "Expired" : `${days}d left`;

  return (
    <div className="flex items-center gap-3 min-w-[160px]">
      <div className="relative h-1.5 flex-1 rounded-full bg-[var(--border)] overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span
        className="font-mono text-xs tabular-nums whitespace-nowrap"
        style={{ color }}
      >
        {label}
      </span>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [batches, setBatches] = useState<ExpiringBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "urgent" | "expired">("all");

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.replace("/login");
    });
  }, [router]);

  useEffect(() => {
    let active = true;

    async function load() {
      const { data, error } = await supabase
        .from("v_expiring_batches")
        .select("*")
        .order("expiry_date", { ascending: true });

      if (!active) return;
      if (error) setError(error.message);
      else setBatches(data as ExpiringBatch[]);
      setLoading(false);
    }

    load();

    // Live updates: refresh whenever batches change
    const channel = supabase
      .channel("dashboard-batches")
      .on("postgres_changes", { event: "*", schema: "public", table: "batches" }, load)
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const filtered = useMemo(() => {
    if (filter === "expired") return batches.filter((b) => b.status === "expired");
    if (filter === "urgent") return batches.filter((b) => b.days_remaining > 0 && b.days_remaining <= 3);
    return batches;
  }, [batches, filter]);

  const counts = useMemo(
    () => ({
      expired: batches.filter((b) => b.status === "expired").length,
      urgent: batches.filter((b) => b.days_remaining > 0 && b.days_remaining <= 3).length,
      total: batches.length,
    }),
    [batches]
  );

  return (
    <div
      className="min-h-screen px-8 py-10"
      style={{
        // Design tokens — see design plan in project notes
        // @ts-ignore CSS custom properties
        "--bg": "#14161A",
        "--surface": "#1B1E24",
        "--surface-alt": "#22262E",
        "--border": "#2A2F38",
        "--text": "#E7E9EC",
        "--text-muted": "#8A909B",
        "--accent": "#5B8DEF",
        "--danger": "#E5484D",
        "--warning": "#F5A623",
        "--safe": "#34D399",
        backgroundColor: "var(--bg)",
        color: "var(--text)",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <header className="mb-10 flex items-end justify-between">
        <div>
          <p
            className="text-xs uppercase tracking-[0.2em] mb-2"
            style={{ color: "var(--text-muted)" }}
          >
            Inventory freshness
          </p>
          <h1
            className="text-3xl font-semibold tracking-tight"
            style={{ fontFamily: "'Space Grotesk', Inter, system-ui, sans-serif" }}
          >
            Expiry dashboard
          </h1>
        </div>
        <div className="flex items-center gap-6">
          <p className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>
            {new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
          </p>
          <button
            onClick={handleSignOut}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors"
            style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-10">
        <SummaryCard label="Expired" value={counts.expired} color="var(--danger)" active={filter === "expired"} onClick={() => setFilter(filter === "expired" ? "all" : "expired")} />
        <SummaryCard label="Urgent (≤3 days)" value={counts.urgent} color="var(--warning)" active={filter === "urgent"} onClick={() => setFilter(filter === "urgent" ? "all" : "urgent")} />
        <SummaryCard label="Total tracked" value={counts.total} color="var(--accent)" active={filter === "all"} onClick={() => setFilter("all")} />
      </div>

      {/* Table */}
      <div
        className="rounded-xl overflow-hidden border"
        style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
      >
        {loading && (
          <p className="p-6 text-sm" style={{ color: "var(--text-muted)" }}>
            Loading batches…
          </p>
        )}
        {error && (
          <p className="p-6 text-sm" style={{ color: "var(--danger)" }}>
            Couldn't load data: {error}
          </p>
        )}
        {!loading && !error && filtered.length === 0 && (
          <p className="p-6 text-sm" style={{ color: "var(--text-muted)" }}>
            Nothing here. Everything in this view is fresh.
          </p>
        )}
        {!loading && !error && filtered.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: "var(--surface-alt)" }}>
                {["Product", "Store", "Batch", "Qty", "Expires", "Freshness"].map((h) => (
                  <th
                    key={h}
                    className="text-left px-5 py-3 font-medium text-xs uppercase tracking-wide"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => (
                <tr
                  key={b.batch_id}
                  className="border-t"
                  style={{ borderColor: "var(--border)" }}
                >
                  <td className="px-5 py-3">
                    <div className="font-medium">{b.product_name}</div>
                    <div className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
                      {b.barcode}
                    </div>
                  </td>
                  <td className="px-5 py-3" style={{ color: "var(--text-muted)" }}>
                    {b.store_name}
                  </td>
                  <td className="px-5 py-3 font-mono text-xs" style={{ color: "var(--text-muted)" }}>
                    {b.batch_number ?? "—"}
                  </td>
                  <td className="px-5 py-3 font-mono tabular-nums">{b.quantity}</td>
                  <td className="px-5 py-3 font-mono text-xs" style={{ color: "var(--text-muted)" }}>
                    {b.expiry_date}
                  </td>
                  <td className="px-5 py-3">
                    <FreshnessBar days={b.days_remaining} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  color,
  active,
  onClick,
}: {
  label: string;
  value: number;
  color: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="text-left rounded-xl border p-5 transition-colors"
      style={{
        borderColor: active ? color : "var(--border)",
        backgroundColor: "var(--surface)",
      }}
    >
      <p className="text-xs uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>
        {label}
      </p>
      <p className="text-3xl font-semibold font-mono tabular-nums" style={{ color }}>
        {value}
      </p>
    </button>
  );
}
