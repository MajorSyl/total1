// Supabase Edge Function: send-expiry-alerts
// Sends push notifications and email digests for unsent expiry alerts.
// Called daily by Supabase cron, or manually via the dashboard trigger button.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = Deno.env.get("ALERT_FROM_EMAIL") ?? "alertas@totalmund.com";

Deno.serve(async () => {
  // Step 1: simple query with no nested joins — avoids PostgREST 3-level
  // join issues that silently return zero rows on fresh projects.
  const { data: alerts, error } = await supabase
    .from("alerts")
    .select("id, threshold_days, urgency, batch_id")
    .is("sent_at", null);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  if (!alerts || alerts.length === 0) {
    return new Response(JSON.stringify({ message: "Sin alertas pendientes de envío" }), { status: 200 });
  }

  // Step 2: fetch batch details (one level deep — products and stores)
  const batchIds = [...new Set(alerts.map((a) => a.batch_id as string))];
  const { data: batches, error: batchError } = await supabase
    .from("batches")
    .select("id, expiry_date, quantity, batch_number, store_id, products ( name, barcode, category ), stores ( id, name )")
    .in("id", batchIds);

  if (batchError) {
    return new Response(JSON.stringify({ error: batchError.message }), { status: 500 });
  }

  const batchMap: Record<string, any> = {};
  for (const b of batches ?? []) {
    batchMap[b.id] = b;
  }

  // Group enriched alerts by store
  const byStore: Record<string, any[]> = {};
  for (const alert of alerts) {
    const batch = batchMap[alert.batch_id as string];
    const storeId = (batch as any)?.stores?.id ?? "unknown";
    byStore[storeId] = byStore[storeId] ?? [];
    byStore[storeId].push({ ...alert, batch });
  }

  const results = [];

  for (const [storeId, storeAlerts] of Object.entries(byStore)) {
    const { data: recipients } = await supabase
      .from("staff")
      .select("email, full_name, push_token")
      .eq("store_id", storeId)
      .in("role", ["manager", "admin"]);

    const expired = storeAlerts.filter((a) => a.urgency === "expired");
    const expiring = storeAlerts.filter((a) => a.urgency !== "expired");

    const pushTokens = (recipients ?? [])
      .map((r) => r.push_token)
      .filter((t): t is string => !!t);

    if (pushTokens.length > 0) {
      const messages = [];
      if (expired.length > 0) {
        messages.push({
          to: pushTokens,
          title: "Total Mundo — Lotes vencidos",
          body: `⚠️ ${expired.length} lote${expired.length === 1 ? "" : "s"} vencido${expired.length === 1 ? "" : "s"} — acción inmediata requerida`,
          sound: "default",
        });
      }
      if (expiring.length > 0) {
        messages.push({
          to: pushTokens,
          title: "Total Mundo — Próximos a vencer",
          body: `⏳ ${expiring.length} lote${expiring.length === 1 ? "" : "s"} próximo${expiring.length === 1 ? "" : "s"} a vencer`,
          sound: "default",
        });
      }
      for (const msg of messages) {
        await fetch(EXPO_PUSH_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(msg),
        });
      }
    }

    if (RESEND_API_KEY) {
      const lines = storeAlerts.map((a) => {
        const p = (a.batch as any)?.products;
        const b = a.batch as any;
        const state = a.urgency === "expired"
          ? "VENCIDO"
          : `vence ${b?.expiry_date} (en ${a.threshold_days} días)`;
        return `• ${p?.name ?? "Producto"} (cód: ${p?.barcode ?? "—"}, lote: ${b?.batch_number ?? "S/N"}) — ${state}`;
      });

      for (const recipient of recipients ?? []) {
        if (!recipient.email) continue;
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: FROM_EMAIL,
            to: recipient.email,
            subject: `Total Mundo — ${storeAlerts.length} alerta${storeAlerts.length === 1 ? "" : "s"} de vencimiento`,
            text: `Hola ${recipient.full_name ?? ""},\n\nResumen de alertas de vencimiento:\n\n${lines.join("\n")}\n\nRevisa el panel de administración para más detalles.`,
          }),
        });
      }
    }

    const alertIds = storeAlerts.map((a) => a.id);
    await supabase
      .from("alerts")
      .update({ sent_at: new Date().toISOString() })
      .in("id", alertIds);

    results.push({
      storeId,
      alertCount: storeAlerts.length,
      pushRecipients: pushTokens.length,
      emailRecipients: (recipients ?? []).filter((r) => r.email).length,
    });
  }

  return new Response(JSON.stringify({ sent: results }), { status: 200 });
});
