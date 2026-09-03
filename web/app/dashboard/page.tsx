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

type StaffInfo = { id: string; store_id: string; role: string; full_name: string | null };
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

function urgencyLabel(urgency: AlertRow["urgency"]) {
  if (urgency === "expired") return "Vencido";
  if (urgency === "urgent") return "Urgente";
  return "Advertencia";
}

function initials(name: string) {
  return name.split(" ").slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
}

// Formats a "YYYY-MM-DD" date string as "DD/MM/YYYY" (Venezuelan convention).
// Reformats the string directly rather than going through a Date object,
// since parsing a date-only string as UTC and rendering it in a UTC-4
// timezone can roll the displayed date back by one day.
function formatDate(isoDate: string | null | undefined): string {
  if (!isoDate) return "—";
  const [y, m, d] = isoDate.split("-");
  return y && m && d ? `${d}/${m}/${y}` : isoDate;
}

// ---- Main Component ----

export default function DashboardPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("home");

  const [batches, setBatches] = useState<ExpiringBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "urgent" | "expired">("all");

  const [staffInfo, setStaffInfo] = useState<StaffInfo | null>(null);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [alertsError, setAlertsError] = useState<string | null>(null);
  const [showScanModal, setShowScanModal] = useState(false);
  const [editingBatch, setEditingBatch] = useState<ExpiringBatch | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ExpiringBatch | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [sendingAlerts, setSendingAlerts] = useState(false);
  const [alertSendResult, setAlertSendResult] = useState<string | null>(null);

  // Auth guard
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.replace("/login");
    });
  }, [router]);

  // Staff info for batch writes and alert acknowledge
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      supabase
        .from("staff")
        .select("id, store_id, role, full_name")
        .eq("auth_user_id", data.user.id)
        .single()
        .then(({ data: row }) => {
          if (row) setStaffInfo(row as StaffInfo);
        });
    });
  }, []);

  // Real-time batch subscription
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

  // Load alerts on mount (for bell badge) and on tab switch
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

  const handleDelete = async (batch: ExpiringBatch) => {
    setDeletingId(batch.batch_id);
    try {
      const { error } = await supabase.rpc("soft_delete_batch", { p_batch_id: batch.batch_id });
      if (error) throw error;
      setConfirmDelete(null);
    } catch (err: any) {
      alert(err.message ?? "No se pudo eliminar el lote.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleSendAlerts = async () => {
    setSendingAlerts(true);
    setAlertSendResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("send-expiry-alerts");
      if (error) throw error;
      if (data?.message) {
        setAlertSendResult(data.message);
      } else if (data?.sent) {
        const total = (data.sent as any[]).reduce((s: number, r: any) => s + (r.alertCount ?? 0), 0);
        const pushTotal = (data.sent as any[]).reduce((s: number, r: any) => s + (r.pushRecipients ?? 0), 0);
        setAlertSendResult(
          total === 0
            ? "Sin alertas pendientes de envío."
            : `${total} alerta${total === 1 ? "" : "s"} enviada${total === 1 ? "" : "s"} a ${pushTotal} dispositivo${pushTotal === 1 ? "" : "s"}.`
        );
      }
      await loadAlerts();
    } catch (err: any) {
      setAlertSendResult(`Error: ${err.message ?? "No se pudo enviar."}`);
    } finally {
      setSendingAlerts(false);
    }
  };

  const handleAcknowledge = async (alertId: string) => {
    if (!staffInfo) return;
    await supabase
      .from("alerts")
      .update({ acknowledged_at: new Date().toISOString(), acknowledged_by: staffInfo.id })
      .eq("id", alertId);
    loadAlerts();
  };

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
      const cat = b.category ?? "Sin categoría";
      map[cat] = (map[cat] ?? 0) + 1;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 4);
  }, [filtered]);

  const unacknowledgedCount = alerts.filter((a) => !a.acknowledged_at).length;

  const FilterPills = () => (
    <div className="flex gap-2 mb-3">
      {(["all", "urgent", "expired"] as const).map((f) => {
        const labels = { all: "Todos", urgent: "Urgente", expired: "Vencido" };
        return (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="px-4 py-1.5 rounded-full text-sm font-medium"
            style={
              filter === f
                ? { backgroundColor: "#2F5FE0", color: "#FFFFFF" }
                : { backgroundColor: "#FFFFFF", color: "#6B7280", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }
            }
          >
            {labels[f]}
          </button>
        );
      })}
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
          <p className="text-sm" style={{ color: "#6B7280" }}>Bienvenido,</p>
          <h1 className="text-lg font-semibold">{staffInfo?.full_name ?? "Cargando…"}</h1>
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

      {/* ---- INICIO TAB ---- */}
      {tab === "home" && (
        <>
          {/* Hero card */}
          <div
            className="rounded-3xl p-6 mb-6 text-white"
            style={{ background: "linear-gradient(135deg, #2F5FE0 0%, #4C7DFF 100%)", boxShadow: "0 8px 24px rgba(47,95,224,0.25)" }}
          >
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm text-white/80">Total de lotes registrados</p>
              <span className="text-xs font-medium px-2 py-1 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.2)" }}>
                {counts.fresh} frescos
              </span>
            </div>
            <p className="text-4xl font-bold mb-5">{counts.total}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowScanModal(true)}
                className="flex-1 rounded-xl py-2.5 text-sm font-semibold"
                style={{ backgroundColor: "#FFFFFF", color: "#2F5FE0" }}
              >
                + Agregar lote
              </button>
              <button
                onClick={() => setTab("alerts")}
                className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-white"
                style={{ backgroundColor: "rgba(255,255,255,0.18)" }}
              >
                Ver alertas
              </button>
            </div>
          </div>

          {/* Insights */}
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-[15px]">Alertas de vencimiento</h2>
            <button onClick={() => setTab("batches")} className="text-sm font-medium" style={{ color: "#2F5FE0" }}>
              Ver todos
            </button>
          </div>
          <div className="space-y-3 mb-6">
            {counts.expired > 0 && (
              <InsightCard icon="⚠️" iconBg="#FEE2E2"
                title={`${counts.expired} lote${counts.expired === 1 ? "" : "s"} ya vencido${counts.expired === 1 ? "" : "s"}`}
                body="Estos deben ser retirados de las estanterías y marcados como dispuestos hoy."
              />
            )}
            {counts.urgent > 0 && (
              <InsightCard icon="⏳" iconBg="#FEF3C7"
                title={`${counts.urgent} lote${counts.urgent === 1 ? "" : "s"} vence${counts.urgent === 1 ? "" : "n"} en menos de 3 días`}
                body="Considera ofrecer descuentos para mover el inventario antes de que venza."
              />
            )}
            {counts.expired === 0 && counts.urgent === 0 && (
              <InsightCard icon="✅" iconBg="#DCFCE7"
                title="Todo en orden"
                body="Ningún lote vencido ni próximo a vencer en los próximos 3 días."
              />
            )}
          </div>

          {/* Category breakdown */}
          {categoryBreakdown.length > 0 && (
            <>
              <h2 className="font-semibold text-[15px] mb-3">Distribución por categoría</h2>
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

          <FilterPills />
          <BatchList batches={filtered} loading={loading} error={error} staffInfo={staffInfo} onEdit={setEditingBatch} onDelete={setConfirmDelete} />
        </>
      )}

      {/* ---- LOTES TAB ---- */}
      {tab === "batches" && (
        <>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-[17px]">Todos los lotes</h2>
            <button
              onClick={() => setShowScanModal(true)}
              className="px-4 py-1.5 rounded-full text-sm font-semibold text-white"
              style={{ backgroundColor: "#2F5FE0" }}
            >
              + Agregar
            </button>
          </div>
          <FilterPills />
          <BatchList batches={filtered} loading={loading} error={error} staffInfo={staffInfo} onEdit={setEditingBatch} onDelete={setConfirmDelete} />
        </>
      )}

      {/* ---- ALERTAS TAB ---- */}
      {tab === "alerts" && (
        <>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-[17px]">
              Alertas
              {unacknowledgedCount > 0 && (
                <span className="ml-2 text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: "#FEE2E2", color: "#DC2626" }}>
                  {unacknowledgedCount} nueva{unacknowledgedCount === 1 ? "" : "s"}
                </span>
              )}
            </h2>
            <button onClick={loadAlerts} className="text-sm font-medium" style={{ color: "#2F5FE0" }}>
              Actualizar
            </button>
          </div>

          {(staffInfo?.role === "manager" || staffInfo?.role === "admin") && (
            <div className="rounded-2xl p-4 mb-4" style={{ backgroundColor: "#FFFFFF", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <p className="text-[13px] font-semibold mb-1">Enviar alertas manualmente</p>
              <p className="text-xs mb-3" style={{ color: "#6B7280" }}>
                Envía notificaciones push y correo para todas las alertas aún no enviadas. Usa esto para probar que las notificaciones llegan antes de depender del cron diario.
              </p>
              {alertSendResult && (
                <p
                  className="text-xs font-medium mb-3 p-2 rounded-lg"
                  style={{
                    color: alertSendResult.startsWith("Error") ? "#DC2626" : "#16A34A",
                    backgroundColor: alertSendResult.startsWith("Error") ? "#FEE2E2" : "#DCFCE7",
                  }}
                >
                  {alertSendResult}
                </p>
              )}
              <button
                onClick={handleSendAlerts}
                disabled={sendingAlerts}
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-white"
                style={{
                  background: sendingAlerts ? "#93c5fd" : "linear-gradient(135deg, #2F5FE0, #4C7DFF)",
                  cursor: sendingAlerts ? "not-allowed" : "pointer",
                }}
              >
                {sendingAlerts ? "Enviando…" : "📣 Enviar alertas ahora"}
              </button>
            </div>
          )}

          <AlertsView alerts={alerts} loading={alertsLoading} error={alertsError} onAcknowledge={handleAcknowledge} />
        </>
      )}

      {/* Bottom tab bar */}
      <nav
        className="fixed bottom-0 left-0 right-0 flex justify-around py-3 border-t"
        style={{ backgroundColor: "#FFFFFF", borderColor: "#F0F1F5" }}
      >
        {(["home", "batches", "alerts"] as const).map((t) => {
          const meta = {
            home: { icon: "🏠", label: "Inicio" },
            batches: { icon: "📦", label: "Lotes" },
            alerts: { icon: "🔔", label: "Alertas" },
          }[t];
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
          Cerrar sesión
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
            <p className="text-sm" style={{ color: "#6B7280" }}>Cargando perfil…</p>
          </div>
        </div>
      )}

      {editingBatch && staffInfo && (
        <EditBatchModal
          batch={editingBatch}
          staffInfo={staffInfo}
          onClose={() => setEditingBatch(null)}
          onSaved={() => setEditingBatch(null)}
        />
      )}

      {confirmDelete && (
        <ConfirmDialog
          batch={confirmDelete}
          deleting={deletingId === confirmDelete.batch_id}
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

// ---- BatchList ----

function BatchList({
  batches, loading, error, staffInfo, onEdit, onDelete,
}: {
  batches: ExpiringBatch[];
  loading: boolean;
  error: string | null;
  staffInfo: StaffInfo | null;
  onEdit: (b: ExpiringBatch) => void;
  onDelete: (b: ExpiringBatch) => void;
}) {
  const isManager = staffInfo?.role === "manager" || staffInfo?.role === "admin";
  return (
    <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: "#FFFFFF", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
      {loading && <p className="p-6 text-sm" style={{ color: "#6B7280" }}>Cargando lotes…</p>}
      {error && <p className="p-6 text-sm" style={{ color: "#DC2626" }}>Error al cargar: {error}</p>}
      {!loading && !error && batches.length === 0 && (
        <p className="p-6 text-sm" style={{ color: "#6B7280" }}>Sin resultados. Todo dentro del rango seguro.</p>
      )}
      {!loading && !error && batches.map((b, i) => {
        const { fg, bg } = statusColor(b.days_remaining);
        const label = b.days_remaining <= 0 ? "Vencido" : `${b.days_remaining}d restantes`;
        return (
          <div
            key={b.batch_id}
            className="px-5 py-4"
            style={{ borderTop: i === 0 ? "none" : "1px solid #F0F1F5" }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-semibold shrink-0"
                style={{ backgroundColor: "#EEF1F6", color: "#2F5FE0" }}
              >
                {initials(b.product_name)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-[14px] truncate">{b.product_name}</p>
                <p className="text-xs" style={{ color: "#6B7280" }}>
                  {b.category ?? "Sin categoría"} · {b.store_name}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-xs font-mono mb-1" style={{ color: "#6B7280" }}>{formatDate(b.expiry_date)}</p>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ color: fg, backgroundColor: bg }}>
                  {label}
                </span>
              </div>
            </div>
            <div className="flex gap-2 mt-2 pl-[52px]">
              <button
                onClick={() => onEdit(b)}
                className="text-xs font-semibold px-3 py-1 rounded-lg"
                style={{ backgroundColor: "#EEF1F6", color: "#2F5FE0" }}
              >
                Editar
              </button>
              {isManager && (
                <button
                  onClick={() => onDelete(b)}
                  className="text-xs font-semibold px-3 py-1 rounded-lg"
                  style={{ backgroundColor: "#FEE2E2", color: "#DC2626" }}
                >
                  Eliminar
                </button>
              )}
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
  if (loading) return <p className="py-8 text-center text-sm" style={{ color: "#6B7280" }}>Cargando alertas…</p>;
  if (error) return <p className="py-8 text-center text-sm" style={{ color: "#DC2626" }}>Error: {error}</p>;
  if (alerts.length === 0) {
    return (
      <div className="rounded-2xl p-8 text-center" style={{ backgroundColor: "#FFFFFF", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
        <p className="text-2xl mb-2">✅</p>
        <p className="font-medium text-[14px]">Sin alertas</p>
        <p className="text-xs mt-1" style={{ color: "#6B7280" }}>Todos los lotes están dentro del límite seguro.</p>
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
                  <p className="font-medium text-[14px]">{product?.name ?? "Producto desconocido"}</p>
                  <span
                    className="text-xs font-semibold px-2 py-0.5 rounded-full"
                    style={{ color: fg, backgroundColor: bg }}
                  >
                    {urgencyLabel(a.urgency)}
                  </span>
                </div>
                <p className="text-xs" style={{ color: "#6B7280" }}>
                  {product?.barcode} · vence {formatDate(a.batches?.expiry_date)} · umbral {a.threshold_days}d
                </p>
                <p className="text-xs mt-0.5" style={{ color: "#9CA3AF" }}>
                  {a.sent_at
                    ? `Enviado el ${new Date(a.sent_at).toLocaleDateString("es-VE")}`
                    : "Sin enviar"}
                  {acknowledged && ` · Confirmado el ${new Date(a.acknowledged_at!).toLocaleDateString("es-VE")}`}
                </p>
              </div>
              {!acknowledged && (
                <button
                  onClick={() => onAcknowledge(a.id)}
                  className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg"
                  style={{ backgroundColor: "#EEF1F6", color: "#2F5FE0" }}
                >
                  Visto
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---- ScanModal (manual batch entry — web substitute for camera scan) ----

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
      setSaveError("Ingresa una cantidad válida mayor que 0.");
      return;
    }
    if (!expiryDate) { setSaveError("Ingresa una fecha de vencimiento."); return; }
    if (isNew && !productName.trim()) { setSaveError("Ingresa el nombre del producto."); return; }

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
      setSaveError(err.message ?? "Error al guardar. Inténtalo de nuevo.");
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
              ? "Registrar lote"
              : isNew
              ? "Nuevo producto + lote"
              : `Lote para ${product?.name}`}
          </h2>
          <button onClick={onClose} style={{ color: "#9CA3AF", fontSize: 20, lineHeight: 1 }}>✕</button>
        </div>

        {step === "lookup" && (
          <>
            <label className="block text-[13px] font-semibold mb-1.5" style={{ color: "#374151" }}>
              Código de barras
            </label>
            <input
              type="text"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLookup()}
              placeholder="ej. 5000000000001"
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
              {looking ? "Buscando…" : "Buscar código →"}
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
                  Código {barcode} no encontrado — ingresa los datos del producto
                </p>
                <label className="block text-[12px] font-semibold mb-1" style={{ color: "#374151" }}>Nombre del producto *</label>
                <input
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="ej. Leche Entera 1L"
                  className="w-full rounded-lg px-3 py-2 text-sm mb-3 border"
                  style={{ borderColor: "#E5E7EB", backgroundColor: "#fff", boxSizing: "border-box" }}
                />
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="block text-[12px] font-semibold mb-1" style={{ color: "#374151" }}>Categoría</label>
                    <input
                      value={productCategory}
                      onChange={(e) => setProductCategory(e.target.value)}
                      placeholder="ej. Lácteos"
                      className="w-full rounded-lg px-3 py-2 text-sm border"
                      style={{ borderColor: "#E5E7EB", backgroundColor: "#fff", boxSizing: "border-box" }}
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-[12px] font-semibold mb-1" style={{ color: "#374151" }}>Unidad</label>
                    <input
                      value={productUnit}
                      onChange={(e) => setProductUnit(e.target.value)}
                      placeholder="ej. botella"
                      className="w-full rounded-lg px-3 py-2 text-sm border"
                      style={{ borderColor: "#E5E7EB", backgroundColor: "#fff", boxSizing: "border-box" }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Batch fields */}
            <label className="block text-[13px] font-semibold mb-1.5" style={{ color: "#374151" }}>
              Cantidad{product?.unit ? ` (${product.unit})` : ""} *
            </label>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="ej. 24"
              className="w-full rounded-xl px-4 py-3 text-[15px] mb-3 border"
              style={{ borderColor: "#E5E7EB", outline: "none", color: "#14171F", backgroundColor: "#F9FAFB", boxSizing: "border-box" }}
            />

            <label className="block text-[13px] font-semibold mb-1.5" style={{ color: "#374151" }}>Fecha de vencimiento *</label>
            <input
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              className="w-full rounded-xl px-4 py-3 text-[15px] mb-3 border"
              style={{ borderColor: "#E5E7EB", outline: "none", color: "#14171F", backgroundColor: "#F9FAFB", boxSizing: "border-box" }}
            />

            <label className="block text-[13px] font-semibold mb-1.5" style={{ color: "#374151" }}>
              Número de lote (opcional)
            </label>
            <input
              value={batchNumber}
              onChange={(e) => setBatchNumber(e.target.value)}
              placeholder="ej. LOT-2026-0714"
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
                ← Volver
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
                {saving ? "Guardando…" : "Guardar lote"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---- EditBatchModal ----

function EditBatchModal({
  batch, staffInfo, onClose, onSaved,
}: {
  batch: ExpiringBatch;
  staffInfo: StaffInfo;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isManager = staffInfo.role === "manager" || staffInfo.role === "admin";

  const [productName, setProductName] = useState(batch.product_name);
  const [productCategory, setProductCategory] = useState(batch.category ?? "");
  const [quantity, setQuantity] = useState(String(batch.quantity));
  const [expiryDate, setExpiryDate] = useState(batch.expiry_date);
  const [batchNumber, setBatchNumber] = useState(batch.batch_number ?? "");
  const [status, setStatus] = useState<"active" | "expired">(
    batch.status === "expired" ? "expired" : "active"
  );
  const [productId, setProductId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("batches")
      .select("product_id")
      .eq("id", batch.batch_id)
      .single()
      .then(({ data }) => { if (data) setProductId(data.product_id); });
  }, [batch.batch_id]);

  const handleSave = async () => {
    if (!quantity || isNaN(Number(quantity)) || Number(quantity) <= 0) {
      setSaveError("Ingresa una cantidad válida mayor que 0.");
      return;
    }
    if (!expiryDate) { setSaveError("Ingresa una fecha de vencimiento."); return; }
    if (isManager && !productName.trim()) { setSaveError("El nombre del producto no puede estar vacío."); return; }

    setSaving(true);
    setSaveError(null);
    try {
      // Update product name/category (manager/admin only)
      if (isManager && productId) {
        const productChanges: Record<string, string | null> = {};
        if (productName.trim() !== batch.product_name) productChanges.name = productName.trim();
        const newCat = productCategory.trim() || null;
        if (newCat !== batch.category) productChanges.category = newCat;
        if (Object.keys(productChanges).length > 0) {
          const { error: pErr } = await supabase.from("products").update(productChanges).eq("id", productId);
          if (pErr) throw pErr;
          await supabase.from("audit_log").insert({
            table_name: "products", row_id: productId, action: "UPDATE",
            old_data: { name: batch.product_name, category: batch.category },
            new_data: productChanges, performed_by: staffInfo.id,
          });
        }
      }

      // Update batch fields
      const batchChanges = {
        quantity: Number(quantity),
        expiry_date: expiryDate,
        batch_number: batchNumber.trim() || null,
        status,
        updated_at: new Date().toISOString(),
      };
      const { error: bErr } = await supabase.from("batches").update(batchChanges).eq("id", batch.batch_id);
      if (bErr) throw bErr;

      await supabase.from("audit_log").insert({
        table_name: "batches", row_id: batch.batch_id, action: "UPDATE",
        old_data: { quantity: batch.quantity, expiry_date: batch.expiry_date, batch_number: batch.batch_number, status: batch.status },
        new_data: batchChanges, performed_by: staffInfo.id,
      });

      onSaved();
    } catch (err: any) {
      setSaveError(err.message ?? "Error al guardar. Inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = { borderColor: "#E5E7EB", outline: "none", color: "#14171F", backgroundColor: "#F9FAFB", boxSizing: "border-box" as const };

  return (
    <div className="fixed inset-0 flex items-end justify-center" style={{ backgroundColor: "rgba(0,0,0,0.5)", zIndex: 50 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg rounded-t-3xl p-6 pb-10" style={{ backgroundColor: "#FFFFFF", maxHeight: "90vh", overflowY: "auto" }}>
        <div className="w-10 h-1 rounded-full mx-auto mb-5" style={{ backgroundColor: "#E5E7EB" }} />
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-[17px]">Editar lote</h2>
          <button onClick={onClose} style={{ color: "#9CA3AF", fontSize: 20, lineHeight: 1 }}>✕</button>
        </div>

        {isManager && (
          <div className="rounded-xl p-4 mb-5 border" style={{ borderColor: "#E5E7EB", backgroundColor: "#F9FAFB" }}>
            <p className="text-[11px] font-semibold uppercase tracking-wide mb-3" style={{ color: "#9CA3AF" }}>Datos del producto</p>
            <label className="block text-[12px] font-semibold mb-1" style={{ color: "#374151" }}>Nombre *</label>
            <input value={productName} onChange={(e) => setProductName(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm mb-3 border" style={{ ...inputStyle, backgroundColor: "#fff" }} />
            <label className="block text-[12px] font-semibold mb-1" style={{ color: "#374151" }}>Categoría</label>
            <input value={productCategory} onChange={(e) => setProductCategory(e.target.value)}
              placeholder="ej. Lácteos" className="w-full rounded-lg px-3 py-2 text-sm border" style={{ ...inputStyle, backgroundColor: "#fff" }} />
          </div>
        )}

        <label className="block text-[13px] font-semibold mb-1.5" style={{ color: "#374151" }}>Cantidad *</label>
        <input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)}
          className="w-full rounded-xl px-4 py-3 text-[15px] mb-3 border" style={inputStyle} />

        <label className="block text-[13px] font-semibold mb-1.5" style={{ color: "#374151" }}>Fecha de vencimiento *</label>
        <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)}
          className="w-full rounded-xl px-4 py-3 text-[15px] mb-3 border" style={inputStyle} />

        <label className="block text-[13px] font-semibold mb-1.5" style={{ color: "#374151" }}>Número de lote (opcional)</label>
        <input value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} placeholder="ej. LOT-2026-0714"
          className="w-full rounded-xl px-4 py-3 text-[15px] mb-3 border" style={inputStyle} />

        <label className="block text-[13px] font-semibold mb-1.5" style={{ color: "#374151" }}>Estado</label>
        <select value={status} onChange={(e) => setStatus(e.target.value as "active" | "expired")}
          className="w-full rounded-xl px-4 py-3 text-[15px] mb-5 border" style={inputStyle}>
          <option value="active">Activo</option>
          <option value="expired">Vencido</option>
        </select>

        {saveError && <p className="text-sm mb-3" style={{ color: "#DC2626" }}>{saveError}</p>}

        <button onClick={handleSave} disabled={saving} className="w-full py-3 rounded-xl text-sm font-semibold text-white"
          style={{ background: saving ? "#93c5fd" : "linear-gradient(135deg, #2F5FE0, #4C7DFF)", cursor: saving ? "not-allowed" : "pointer" }}>
          {saving ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}

// ---- ConfirmDialog ----

function ConfirmDialog({
  batch, deleting, onConfirm, onCancel,
}: {
  batch: ExpiringBatch;
  deleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 flex items-center justify-center px-6"
      style={{ backgroundColor: "rgba(0,0,0,0.6)", zIndex: 60 }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="w-full max-w-sm rounded-2xl p-6" style={{ backgroundColor: "#FFFFFF", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        <p className="font-semibold text-[16px] mb-1">¿Eliminar este lote?</p>
        <p className="text-sm font-medium mb-0.5">{batch.product_name}</p>
        <p className="text-xs mb-4" style={{ color: "#6B7280" }}>
          Vence {batch.expiry_date} · {batch.quantity} uds.
        </p>
        <p className="text-xs mb-5 p-3 rounded-xl" style={{ color: "#92400E", backgroundColor: "#FFFBEB" }}>
          El lote quedará marcado como eliminado y desaparecerá de la lista. La acción queda registrada en el historial de auditoría.
        </p>
        <div className="flex gap-3">
          <button onClick={onCancel} disabled={deleting}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
            style={{ backgroundColor: "#EEF1F6", color: "#374151" }}>
            Cancelar
          </button>
          <button onClick={onConfirm} disabled={deleting}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white"
            style={{ backgroundColor: deleting ? "#FCA5A5" : "#DC2626", cursor: deleting ? "not-allowed" : "pointer" }}>
            {deleting ? "Eliminando…" : "Sí, eliminar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- InsightCard ----

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
