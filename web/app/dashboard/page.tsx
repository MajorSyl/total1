"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

// ---- Types ----

type Tab = "home" | "batches" | "alerts";

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

type AlertRow = {
  id: string;
  batch_id: string;
  threshold_days: number;
  urgency: "warning" | "urgent" | "expired";
  sent_at: string | null;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  created_at: string;
  batches: {
    expiry_date: string;
    quantity: number;
    products: { name: string; barcode: string };
  } | null;
};

type Product = {
  id: string;
  barcode: string;
  name: string;
  category: string | null;
  unit: string | null;
};

type StaffInfo = { id: string; store_id: string };
type ScanStep = "lookup" | "batch";

// ---- Helpers ----

function statusColor(days: number) {
  if (days <= 0) return { fg: "#DC2626", bg: "#FEE2E2" };
  if (days <= 3) return { fg: "#DC2626", bg: "#FEE2E2" };
  if (days <= 7) return { fg: "#D97706", bg: "#FEF3C7" };
  return { fg: "#16A34A", bg: "#DCFCE7" };
}

function urgencyColor(urgency: AlertRow["urgency"]) {
  if (urgency === "expired") return { fg: "#DC2626", bg: "#FEE2E2" };
  if (urgency === "urgent") return { fg: "#D97706", bg: "#FEF3C7" };
  return { fg: "#2563EB", bg: "#DBEAFE" };
}

function initials(name: string) {
  return name.split(" ").slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
}

// ---- Main Component ----

export default function DashboardPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("home");

  // Existing batch state — real-time subscription is untouched
  const [batches, setBatches] = useState<ExpiringBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "urgent" | "expired">("all");

  // New state
  const [staffInfo, setStaffInfo] = useState<StaffInfo | null>(null);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [alertsError, setAlertsError] = useState<string | null>(null);
  const [showScanModal, setShowScanModal] = useState(false);

  // Auth guard (unchanged)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.replace("/login");
    });
  }, [router]);

  // Load staff info for batch writes and alert acknowledge
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      supabase
        .from("staff")
        .select("id, store_id")
        .eq("auth_user_id", data.user.id)
        .single()
        .then(({ data: row }) => {
          if (row) setStaffInfo(row as StaffInfo);
        });
    });
  }, []);

  // Real-time batch subscription (unchanged logic)
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

  // Load alerts on mount (bell badge) and refresh on tab switch
  const loadAlerts = async () => {
    setAlertsLoading(true);
    setAlertsError(null);
    const { data, error } = await supabase
      .from("alerts")
      .select(`
        id, batch_id, threshold_days, urgency, sent_at,
        acknowledged_at, acknowledged_by, created_at,
        batches(expiry_date, quantity, products(name, barcode))
      `)
      .order("created_at", { ascending: false });
    if (error) setAlertsError(error.message);
    else setAlerts((data ?? []) as unknown as AlertRow[]);
    setAlertsLoading(false);
  };

  useEffect(() => { loadAlerts(); }, []);
  useEffect(() => { if (tab === "alerts") loadAlerts(); }, [tab]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const handleAcknowledge = async (alertId: string) => {
    if (!staffInfo) return;
    await supabase
      .from("alerts")
      .update({ acknowledged_at: new Date().toISOString(), acknowledged_by: staffInfo.id })
      .eq("id", alertId);
    loadAlerts();
  };

  // Existing filter/count memos — unchanged
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
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 4);
  }, [filtered]);

  const unacknowledgedCount = alerts.filter((a) => !a.acknowledged_at).length;

  const FilterPills = () => (
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
  );

  return (
    <div
      className="min-h-screen px-6 py-8 max-w-md mx-auto md:max-w-2xl"
      style={{ backgroundColor: "#F4F6FA", color: "#14171F", fontFamily: "Inter, system-ui, sans-serif" }}
    >
      {/* Header */}
      <header className="flex items-center justify-between mb-6">
        <div>
          <p className="text-sm" style={{ color: "#6B7280" }}>Welcome back,</p>
          <h1 className="text-lg font-semibold">Manager</h1>
        </div>
        <button
          onClick={() => setTab("alerts")}
          className="w-10 h-10 rounded-full flex items-center justify-center relative"
          style={{ backgroundColor: "#FFFFFF", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}
        >
          🔔
          {unacknowledgedCount > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full flex items-center justify-center text-white"
              style={{ fontSize: 9, fontWeight: 700, backgroundColor: "#DC2626" }}
            >
              {unacknowledgedCount > 9 ? "9+" : unacknowledgedCount}
            </span>
          )}
        </button>
      </header>

      {/* ---- HOME TAB ---- */}
      {tab === "home" && (
        <>
          {/* Hero card */}
          <div
            className="rounded-3xl p-6 mb-6 text-white"
            style={{ background: "linear-gradient(135deg, #2F5FE0 0%, #4C7DFF 100%)", boxShadow: "0 8px 24px rgba(47,95,224,0.25)" }}
          >
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm text-white/80">Total Batches Tracked</p>
              <span className="text-xs font-medium px-2 py-1 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.2)" }}>
                {counts.fresh} fresh
              </span>
            </div>
            <p className="text-4xl font-bold mb-5">{counts.total}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowScanModal(true)}
                className="flex-1 rounded-xl py-2.5 text-sm font-semibold"
                style={{ backgroundColor: "#FFFFFF", color: "#2F5FE0" }}
              >
                + Add batch
              </button>
              <button
                onClick={() => setTab("alerts")}
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
            <button onClick={() => setTab("batches")} className="text-sm font-medium" style={{ color: "#2F5FE0" }}>
              View all
            </button>
          </div>
          <div className="space-y-3 mb-6">
            {counts.expired > 0 && (
              <InsightCard icon="⚠️" iconBg="#FEE2E2"
                title={`${counts.expired} batch${counts.expired === 1 ? "" : "es"} already expired`}
                body="These should be pulled from shelves and marked disposed today."
              />
            )}
            {counts.urgent > 0 && (
              <InsightCard icon="⏳" iconBg="#FEF3C7"
                title={`${counts.urgent} expiring within 3 days`}
                body="Consider discounting these to move stock before they turn over."
              />
            )}
            {counts.expired === 0 && counts.urgent === 0 && (
              <InsightCard icon="✅" iconBg="#DCFCE7"
                title="Nothing urgent right now"
                body="No batches are expired or expiring within 3 days."
              />
            )}
          </div>

          {/* Category breakdown */}
          {categoryBreakdown.length > 0 && (
            <>
              <h2 className="font-semibold text-[15px] mb-3">Breakdown by category</h2>
              <div className="rounded-2xl p-5 mb-6" style={{ backgroundColor: "#FFFFFF", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                {categoryBreakdown.map(([cat, count]) => {
                  const pct = Math.round((count / filtered.length) * 100);
                  return (
                    <div key={cat} className="mb-4 last:mb-0">
                      <div className="flex items-center justify-between mb-1.5 text-sm">
                        <span className="font-medium">{cat}</span>
                        <span style={{ color: "#6B7280" }}>{count} · {pct}%</span>
                      </div>
                      <div className="h-2 rounded-full" style={{ backgroundColor: "#EEF1F6" }}>
                        <div className="h-2 rounded-full" style={{ width: `${pct}%`, backgroundColor: "#2F5FE0" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Filter pills (unchanged) */}
          <FilterPills />

          {/* Batch list (unchanged) */}
          <BatchList batches={filtered} loading={loading} error={error} />
        </>
      )}

      {/* ---- BATCHES TAB ---- */}
      {tab === "batches" && (
        <>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-[17px]">All Batches</h2>
            <button
              onClick={() => setShowScanModal(true)}
              className="px-4 py-1.5 rounded-full text-sm font-semibold text-white"
              style={{ backgroundColor: "#2F5FE0" }}
            >
              + Add
            </button>
          </div>
          <FilterPills />
          <BatchList batches={filtered} loading={loading} error={error} />
        </>
      )}

      {/* ---- ALERTS TAB ---- */}
      {tab === "alerts" && (
        <>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-[17px]">
              Alerts
              {unacknowledgedCount > 0 && (
                <span className="ml-2 text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: "#FEE2E2", color: "#DC2626" }}>
                  {unacknowledgedCount} new
                </span>
              )}
            </h2>
            <button onClick={loadAlerts} className="text-sm font-medium" style={{ color: "#2F5FE0" }}>
              Refresh
            </button>
          </div>
          <AlertsView alerts={alerts} loading={alertsLoading} error={alertsError} onAcknowledge={handleAcknowledge} />
        </>
      )}

      {/* Bottom tab bar */}
      <nav
        className="fixed bottom-0 left-0 right-0 flex justify-around py-3 border-t"
        style={{ backgroundColor: "#FFFFFF", borderColor: "#F0F1F5" }}
      >
        {(["home", "batches", "alerts"] as const).map((t) => {
          const meta = { home: { icon: "🏠", label: "Home" }, batches: { icon: "📦", label: "Batches" }, alerts: { icon: "🔔", label: "Alerts" } }[t];
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="flex flex-col items-center gap-0.5 text-xs relative"
              style={{ color: tab === t ? "#2F5FE0" : "#9CA3AF" }}
            >
              <span>{meta.icon}</span>
              {meta.label}
              {t === "alerts" && unacknowledgedCount > 0 && (
                <span
                  className="absolute -top-0.5 right-3 w-3.5 h-3.5 rounded-full flex items-center justify-center text-white"
                  style={{ fontSize: 8, fontWeight: 700, backgroundColor: "#DC2626" }}
                >
                  {unacknowledgedCount}
                </span>
              )}
            </button>
          );
        })}
        <button
          onClick={handleSignOut}
          className="flex flex-col items-center gap-0.5 text-xs"
          style={{ color: "#9CA3AF" }}
        >
          <span>👤</span>
          Sign out
        </button>
      </nav>
      <div className="h-16" />

      {/* Manual entry modal */}
      {showScanModal && staffInfo && (
        <ScanModal
          staffInfo={staffInfo}
          onClose={() => setShowScanModal(false)}
          onSuccess={() => setShowScanModal(false)}
        />
      )}
      {showScanModal && !staffInfo && (
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.5)", zIndex: 50 }}
          onClick={() => setShowScanModal(false)}
        >
          <div className="rounded-2xl p-6 bg-white">
            <p className="text-sm" style={{ color: "#6B7280" }}>Loading staff profile…</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- BatchList (extracted so both Home and Batches tabs reuse it) ----

function BatchList({ batches, loading, error }: { batches: ExpiringBatch[]; loading: boolean; error: string | null }) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: "#FFFFFF", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
      {loading && <p className="p-6 text-sm" style={{ color: "#6B7280" }}>Loading batches…</p>}
      {error && <p className="p-6 text-sm" style={{ color: "#DC2626" }}>Couldn't load data: {error}</p>}
      {!loading && !error && batches.length === 0 && (
        <p className="p-6 text-sm" style={{ color: "#6B7280" }}>Nothing here. Everything in this view is fresh.</p>
      )}
      {!loading && !error && batches.map((b, i) => {
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
              <p className="text-xs font-mono mb-1" style={{ color: "#6B7280" }}>{b.expiry_date}</p>
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
  );
}

// ---- AlertsView ----

function AlertsView({
  alerts,
  loading,
  error,
  onAcknowledge,
}: {
  alerts: AlertRow[];
  loading: boolean;
  error: string | null;
  onAcknowledge: (id: string) => void;
}) {
  if (loading) return <p className="py-8 text-center text-sm" style={{ color: "#6B7280" }}>Loading alerts…</p>;
  if (error) return <p className="py-8 text-center text-sm" style={{ color: "#DC2626" }}>Error: {error}</p>;
  if (alerts.length === 0) {
    return (
      <div className="rounded-2xl p-8 text-center" style={{ backgroundColor: "#FFFFFF", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
        <p className="text-2xl mb-2">✅</p>
        <p className="font-medium text-[14px]">No alerts</p>
        <p className="text-xs mt-1" style={{ color: "#6B7280" }}>All batches are within safe thresholds.</p>
      </div>
    );
  }
  return (
    <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: "#FFFFFF", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
      {alerts.map((a, i) => {
        const { fg, bg } = urgencyColor(a.urgency);
        const product = a.batches?.products;
        const acknowledged = !!a.acknowledged_at;
        return (
          <div
            key={a.id}
            className="px-5 py-4"
            style={{ borderTop: i === 0 ? "none" : "1px solid #F0F1F5", opacity: acknowledged ? 0.55 : 1 }}
          >
            <div className="flex items-start gap-3">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-sm mt-0.5"
                style={{ backgroundColor: bg }}
              >
                {a.urgency === "expired" ? "⚠️" : a.urgency === "urgent" ? "⏳" : "🔔"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <p className="font-medium text-[14px]">{product?.name ?? "Unknown product"}</p>
                  <span
                    className="text-xs font-semibold px-2 py-0.5 rounded-full capitalize"
                    style={{ color: fg, backgroundColor: bg }}
                  >
                    {a.urgency}
                  </span>
                </div>
                <p className="text-xs" style={{ color: "#6B7280" }}>
                  {product?.barcode} · expires {a.batches?.expiry_date} · {a.threshold_days}d threshold
                </p>
                <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>
                  {a.sent_at
                    ? `Sent ${new Date(a.sent_at).toLocaleDateString()}`
                    : "Not yet sent"}
                  {acknowledged && ` · Acknowledged ${new Date(a.acknowledged_at!).toLocaleDateString()}`}
                </p>
              </div>
              {!acknowledged && (
                <button
                  onClick={() => onAcknowledge(a.id)}
                  className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg"
                  style={{ backgroundColor: "#EEF1F6", color: "#2F5FE0" }}
                >
                  Ack
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---- ScanModal (manual batch entry, web substitute for camera scan) ----

function ScanModal({
  staffInfo,
  onClose,
  onSuccess,
}: {
  staffInfo: StaffInfo;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [step, setStep] = useState<ScanStep>("lookup");
  const [barcode, setBarcode] = useState("");
  const [looking, setLooking] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [isNew, setIsNew] = useState(false);

  const [productName, setProductName] = useState("");
  const [productCategory, setProductCategory] = useState("");
  const [productUnit, setProductUnit] = useState("");

  const [quantity, setQuantity] = useState("");
  const [batchNumber, setBatchNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split("T")[0];
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleLookup = async () => {
    if (!barcode.trim()) return;
    setLooking(true);
    setLookupError(null);
    const { data, error } = await supabase
      .from("products")
      .select("id, barcode, name, category, unit")
      .eq("barcode", barcode.trim())
      .maybeSingle();
    setLooking(false);
    if (error) { setLookupError(error.message); return; }
    setProduct(data as Product | null);
    setIsNew(!data);
    setStep("batch");
  };

  const handleSave = async () => {
    if (!quantity || isNaN(Number(quantity)) || Number(quantity) <= 0) {
      setSaveError("Enter a valid quantity greater than 0.");
      return;
    }
    if (!expiryDate) { setSaveError("Enter an expiry date."); return; }
    if (isNew && !productName.trim()) { setSaveError("Enter a product name."); return; }

    setSaving(true);
    setSaveError(null);
    try {
      let productId = product?.id;

      if (isNew) {
        const { data: newProduct, error: pErr } = await supabase
          .from("products")
          .insert({
            barcode: barcode.trim(),
            name: productName.trim(),
            category: productCategory.trim() || null,
            unit: productUnit.trim() || null,
          })
          .select("id")
          .single();
        if (pErr) throw pErr;
        productId = newProduct.id;
      }

      const { error: bErr } = await supabase.from("batches").insert({
        product_id: productId,
        store_id: staffInfo.store_id,
        registered_by: staffInfo.id,
        batch_number: batchNumber.trim() || null,
        quantity: Number(quantity),
        expiry_date: expiryDate,
        status: "active",
      });
      if (bErr) throw bErr;

      onSuccess();
    } catch (err: any) {
      setSaveError(err.message ?? "Save failed. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-end justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.5)", zIndex: 50 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-lg rounded-t-3xl p-6 pb-10"
        style={{ backgroundColor: "#FFFFFF", maxHeight: "90vh", overflowY: "auto" }}
      >
        <div className="w-10 h-1 rounded-full mx-auto mb-5" style={{ backgroundColor: "#E5E7EB" }} />

        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-[17px]">
            {step === "lookup"
              ? "Register batch"
              : isNew
              ? "New product + batch"
              : `Batch for ${product?.name}`}
          </h2>
          <button onClick={onClose} style={{ color: "#9CA3AF", fontSize: 20, lineHeight: 1 }}>✕</button>
        </div>

        {step === "lookup" && (
          <>
            <label className="block text-[13px] font-semibold mb-1.5" style={{ color: "#374151" }}>
              Barcode number
            </label>
            <input
              type="text"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLookup()}
              placeholder="e.g. 5000000000001"
              autoFocus
              className="w-full rounded-xl px-4 py-3 text-[15px] mb-4 border"
              style={{ borderColor: "#E5E7EB", outline: "none", color: "#14171F", backgroundColor: "#F9FAFB", boxSizing: "border-box" }}
            />
            {lookupError && <p className="text-sm mb-3" style={{ color: "#DC2626" }}>{lookupError}</p>}
            <button
              onClick={handleLookup}
              disabled={looking || !barcode.trim()}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white"
              style={{
                background: looking || !barcode.trim() ? "#93c5fd" : "linear-gradient(135deg, #2F5FE0, #4C7DFF)",
                cursor: looking || !barcode.trim() ? "not-allowed" : "pointer",
              }}
            >
              {looking ? "Looking up…" : "Look up barcode →"}
            </button>
          </>
        )}

        {step === "batch" && (
          <>
            {/* Known product card */}
            {!isNew && product && (
              <div
                className="rounded-xl p-4 mb-5 flex items-center gap-3"
                style={{ backgroundColor: "#EEF1F6" }}
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                  style={{ backgroundColor: "#2F5FE0", color: "#fff" }}
                >
                  {initials(product.name)}
                </div>
                <div>
                  <p className="font-semibold text-[14px]">{product.name}</p>
                  <p className="text-xs" style={{ color: "#6B7280" }}>
                    {product.barcode}{product.category ? ` · ${product.category}` : ""}
                    {product.unit ? ` · ${product.unit}` : ""}
                  </p>
                </div>
              </div>
            )}

            {/* New product fields */}
            {isNew && (
              <div className="rounded-xl p-4 mb-5 border" style={{ borderColor: "#FDE68A", backgroundColor: "#FFFBEB" }}>
                <p className="text-xs font-semibold mb-3" style={{ color: "#D97706" }}>
                  Barcode {barcode} not found — fill in product details
                </p>
                <label className="block text-[12px] font-semibold mb-1" style={{ color: "#374151" }}>Product name *</label>
                <input
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="e.g. Whole Milk 1L"
                  className="w-full rounded-lg px-3 py-2 text-sm mb-3 border"
                  style={{ borderColor: "#E5E7EB", backgroundColor: "#fff", boxSizing: "border-box" }}
                />
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="block text-[12px] font-semibold mb-1" style={{ color: "#374151" }}>Category</label>
                    <input
                      value={productCategory}
                      onChange={(e) => setProductCategory(e.target.value)}
                      placeholder="e.g. Dairy"
                      className="w-full rounded-lg px-3 py-2 text-sm border"
                      style={{ borderColor: "#E5E7EB", backgroundColor: "#fff", boxSizing: "border-box" }}
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-[12px] font-semibold mb-1" style={{ color: "#374151" }}>Unit</label>
                    <input
                      value={productUnit}
                      onChange={(e) => setProductUnit(e.target.value)}
                      placeholder="e.g. bottle"
                      className="w-full rounded-lg px-3 py-2 text-sm border"
                      style={{ borderColor: "#E5E7EB", backgroundColor: "#fff", boxSizing: "border-box" }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Batch fields */}
            <label className="block text-[13px] font-semibold mb-1.5" style={{ color: "#374151" }}>
              Quantity{product?.unit ? ` (${product.unit})` : ""} *
            </label>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="e.g. 24"
              className="w-full rounded-xl px-4 py-3 text-[15px] mb-3 border"
              style={{ borderColor: "#E5E7EB", outline: "none", color: "#14171F", backgroundColor: "#F9FAFB", boxSizing: "border-box" }}
            />

            <label className="block text-[13px] font-semibold mb-1.5" style={{ color: "#374151" }}>Expiry date *</label>
            <input
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              className="w-full rounded-xl px-4 py-3 text-[15px] mb-3 border"
              style={{ borderColor: "#E5E7EB", outline: "none", color: "#14171F", backgroundColor: "#F9FAFB", boxSizing: "border-box" }}
            />

            <label className="block text-[13px] font-semibold mb-1.5" style={{ color: "#374151" }}>
              Batch / lot number (optional)
            </label>
            <input
              value={batchNumber}
              onChange={(e) => setBatchNumber(e.target.value)}
              placeholder="e.g. LOT-2026-0714"
              className="w-full rounded-xl px-4 py-3 text-[15px] mb-5 border"
              style={{ borderColor: "#E5E7EB", outline: "none", color: "#14171F", backgroundColor: "#F9FAFB", boxSizing: "border-box" }}
            />

            {saveError && <p className="text-sm mb-3" style={{ color: "#DC2626" }}>{saveError}</p>}

            <div className="flex gap-3">
              <button
                onClick={() => { setStep("lookup"); setProduct(null); setIsNew(false); setSaveError(null); }}
                className="flex-1 py-3 rounded-xl text-sm font-semibold"
                style={{ backgroundColor: "#EEF1F6", color: "#374151" }}
              >
                ← Back
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-3 rounded-xl text-sm font-semibold text-white"
                style={{
                  background: saving ? "#93c5fd" : "linear-gradient(135deg, #2F5FE0, #4C7DFF)",
                  cursor: saving ? "not-allowed" : "pointer",
                }}
              >
                {saving ? "Saving…" : "Save batch"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---- InsightCard (unchanged) ----

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
        <p className="text-xs" style={{ color: "#6B7280" }}>{body}</p>
      </div>
    </div>
  );
}
