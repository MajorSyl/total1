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

function statusColor(days: number) {
  if (days <= 0) return { fg: "#DC2626", bg: "#FEE2E2" };
  if (days <= 3) return { fg: "#DC2626", bg: "#FEE2E2" };
  if (days <= 7) return { fg: "#D97706", bg: "#FEF3C7" };
  return { fg: "#16A34A", bg: "#DCFCE7" };
}

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
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
      fresh: batches.filter((b) => b.days_remaining > 7).length,
      total: batches.length,
    }),
    [batches]
  );

  const categoryBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach((b) => {
      const cat = b.category ?? "Uncategorized";
      map[cat] = (map[cat] ?? 0) + 1;
    });
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);
  }, [filtered]);

  return (
    <div
      className="min-h-screen px-6 py-8 max-w-md mx-auto md:max-w-2xl"
      style={{ backgroundColor: "#F4F6FA", color: "#14171F", fontFamily: "Inter, system-ui, sans-serif" }}
    >
      {/* Header */}
      <header className="flex items-center justify-between mb-6">
        <div>
          <p className="text-sm" style={{ color: "#6B7280" }}>
            Welcome back,
          </p>
          <h1 className="text-lg font-semibold">Manager</h1>
        </div>
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center"
          style={{ backgroundColor: "#FFFFFF", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}
        >
          🔔
        </div>
      </header>

      {/* Hero card */}
      <div
        className="rounded-3xl p-6 mb-6 text-white"
        style={{
          background: "linear-gradient(135deg, #2F5FE0 0%, #4C7DFF 100%)",
          boxShadow: "0 8px 24px rgba(47,95,224,0.25)",
        }}
      >
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm text-white/80">Total Batches Tracked</p>
          <span
            className="text-xs font-medium px-2 py-1 rounded-full"
            style={{ backgroundColor: "rgba(255,255,255,0.2)" }}
          >
            {counts.fresh} fresh
          </span>
        </div>
        <p className="text-4xl font-bold mb-5">{counts.total}</p>
        <div className="flex gap-3">
          <button
            className="flex-1 rounded-xl py-2.5 text-sm font-semibold"
            style={{ backgroundColor: "#FFFFFF", color: "#2F5FE0" }}
          >
            Scan product
          </button>
          <button
            className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-white"
            style={{ backgroundColor: "rgba(255,255,255,0.18)" }}
          >
            View alerts
          </button>
        </div>
      </div>

      {/* Insights */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-[15px]">Expiry Insights</h2>
        <span className="text-sm font-medium" style={{ color: "#2F5FE0" }}>
          View all
        </span>
      </div>
      <div className="space-y-3 mb-6">
        {counts.expired > 0 && (
          <InsightCard
            icon="⚠️"
            iconBg="#FEE2E2"
            title={`${counts.expired} batch${counts.expired === 1 ? "" : "es"} already expired`}
            body="These should be pulled from shelves and marked disposed today."
          />
        )}
        {counts.urgent > 0 && (
          <InsightCard
            icon="⏳"
            iconBg="#FEF3C7"
            title={`${counts.urgent} expiring within 3 days`}
            body="Consider discounting these to move stock before they turn over."
          />
        )}
        {counts.expired === 0 && counts.urgent === 0 && (
          <InsightCard
            icon="✅"
            iconBg="#DCFCE7"
            title="Nothing urgent right now"
            body="No batches are expired or expiring within 3 days."
          />
        )}
      </div>

      {/* Category breakdown */}
      {categoryBreakdown.length > 0 && (
        <>
          <h2 className="font-semibold text-[15px] mb-3">Breakdown by category</h2>
          <div
            className="rounded-2xl p-5 mb-6"
            style={{ backgroundColor: "#FFFFFF", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}
          >
            {categoryBreakdown.map(([cat, count]) => {
              const pct = Math.round((count / filtered.length) * 100);
              return (
                <div key={cat} className="mb-4 last:mb-0">
                  <div className="flex items-center justify-between mb-1.5 text-sm">
                    <span className="font-medium">{cat}</span>
                    <span style={{ color: "#6B7280" }}>
                      {count} · {pct}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full" style={{ backgroundColor: "#EEF1F6" }}>
                    <div
                      className="h-2 rounded-full"
                      style={{ width: `${pct}%`, backgroundColor: "#2F5FE0" }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Filter pills */}
      <div className="flex gap-2 mb-3">
        {(["all", "urgent", "expired"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="px-4 py-1.5 rounded-full text-sm font-medium capitalize"
            style={
              filter === f
                ? { backgroundColor: "#2F5FE0", color: "#FFFFFF" }
                : { backgroundColor: "#FFFFFF", color: "#6B7280", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }
            }
          >
            {f === "all" ? "All batches" : f}
          </button>
        ))}
      </div>

      {/* Batch list */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ backgroundColor: "#FFFFFF", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}
      >
        {loading && (
          <p className="p-6 text-sm" style={{ color: "#6B7280" }}>
            Loading batches…
          </p>
        )}
        {error && (
          <p className="p-6 text-sm" style={{ color: "#DC2626" }}>
            Couldn't load data: {error}
          </p>
        )}
        {!loading && !error && filtered.length === 0 && (
          <p className="p-6 text-sm" style={{ color: "#6B7280" }}>
            Nothing here. Everything in this view is fresh.
          </p>
        )}
        {!loading &&
          !error &&
          filtered.map((b, i) => {
            const { fg, bg } = statusColor(b.days_remaining);
            const label = b.days_remaining <= 0 ? "Expired" : `${b.days_remaining}d left`;
            return (
              <div
                key={b.batch_id}
                className="flex items-center gap-3 px-5 py-4"
                style={{ borderTop: i === 0 ? "none" : "1px solid #F0F1F5" }}
              >
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
                  style={{ backgroundColor: "#EEF1F6", color: "#2F5FE0" }}
                >
                  {initials(b.product_name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-[14px] truncate">{b.product_name}</p>
                  <p className="text-xs" style={{ color: "#6B7280" }}>
                    {b.category ?? "Uncategorized"} · {b.store_name}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-mono mb-1" style={{ color: "#6B7280" }}>
                    {b.expiry_date}
                  </p>
                  <span
                    className="text-xs font-semibold px-2 py-0.5 rounded-full"
                    style={{ color: fg, backgroundColor: bg }}
                  >
                    {label}
                  </span>
                </div>
              </div>
            );
          })}
      </div>

      {/* Bottom tab bar */}
      <nav
        className="fixed bottom-0 left-0 right-0 flex justify-around py-3 border-t"
        style={{ backgroundColor: "#FFFFFF", borderColor: "#F0F1F5" }}
      >
        {[
          { icon: "🏠", label: "Home" },
          { icon: "📦", label: "Batches" },
          { icon: "🔔", label: "Alerts" },
          { icon: "👤", label: "Sign out" },
        ].map((t, i) => (
          <button
            key={t.label}
            onClick={i === 3 ? handleSignOut : undefined}
            className="flex flex-col items-center gap-0.5 text-xs"
            style={{ color: i === 0 ? "#2F5FE0" : "#9CA3AF" }}
          >
            <span>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
      <div className="h-16" />
    </div>
  );
}

function InsightCard({
  icon,
  iconBg,
  title,
  body,
}: {
  icon: string;
  iconBg: string;
  title: string;
  body: string;
}) {
  return (
    <div
      className="flex gap-3 rounded-2xl p-4"
      style={{ backgroundColor: "#FFFFFF", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}
    >
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-sm"
        style={{ backgroundColor: iconBg }}
      >
        {icon}
      </div>
      <div>
        <p className="font-medium text-[14px] mb-0.5">{title}</p>
        <p className="text-xs" style={{ color: "#6B7280" }}>
          {body}
        </p>
      </div>
    </div>
  );
}
