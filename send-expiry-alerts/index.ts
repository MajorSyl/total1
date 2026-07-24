// Supabase Edge Function: send-expiry-alerts
// Scheduled to run daily (right after the check_expiry_thresholds() DB job).
// Reads unsent alert rows, sends email + push notifications, marks them sent.
//
// Deploy with: supabase functions deploy send-expiry-alerts
// Schedule via Supabase Dashboard > Edge Functions > Cron, or pg_cron calling
// this function's URL with the service role key.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
// const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"; // if using Expo push

Deno.serve(async () => {
  // 1. Get all unsent alerts, joined with batch/product/store/staff info
  const { data: alerts, error } = await supabase
    .from("alerts")
    .select(
      `
      id, threshold_days, urgency,
      batches (
        id, expiry_date, quantity, batch_number,
        products ( name, barcode, category ),
        stores ( id, name ),
        registered_by ( id, full_name, email, push_token )
      )
    `
    )
    .is("sent_at", null);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  if (!alerts || alerts.length === 0) {
    return new Response(JSON.stringify({ message: "No alerts to send" }), { status: 200 });
  }

  // 2. Group alerts by store so managers get one digest email, not N separate ones
  const byStore: Record<string, any[]> = {};
  for (const alert of alerts) {
    const storeId = alert.batches?.stores?.id ?? "unknown";
    byStore[storeId] = byStore[storeId] || [];
    byStore[storeId].push(alert);
  }

  const results = [];

  for (const [storeId, storeAlerts] of Object.entries(byStore)) {
    // Find managers/staff for this store to notify
    const { data: recipients } = await supabase
      .from("staff")
      .select("email, full_name, push_token")
      .eq("store_id", storeId)
      .in("role", ["manager", "admin"]);

    const lines = storeAlerts.map((a) => {
      const p = a.batches?.products;
      const b = a.batches;
      return `- ${p?.name} (barcode: ${p?.barcode}, batch: ${b?.batch_number ?? "N/A"}) — ` +
        `${a.urgency === "expired" ? "EXPIRED" : `expires ${b?.expiry_date} (in ${a.threshold_days} days)`}`;
    });

    const emailBody = `Expiry alert summary:\n\n${lines.join("\n")}`;

    for (const recipient of recipients ?? []) {
      if (recipient.email) {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "alerts@yourdomain.com",
            to: recipient.email,
            subject: `[Expiry Alert] ${storeAlerts.length} product(s) need attention`,
            text: emailBody,
          }),
        });
      }

      // Push notification example (Expo) — uncomment when mobile app is wired up
      // if (recipient.push_token) {
      //   await fetch(EXPO_PUSH_URL, {
      //     method: "POST",
      //     headers: { "Content-Type": "application/json" },
      //     body: JSON.stringify({
      //       to: recipient.push_token,
      //       title: "Expiry Alert",
      //       body: `${storeAlerts.length} product(s) expiring soon`,
      //     }),
      //   });
      // }
    }

    // 3. Mark these alerts as sent
    const alertIds = storeAlerts.map((a) => a.id);
    await supabase.from("alerts").update({ sent_at: new Date().toISOString() }).in("id", alertIds);

    results.push({ storeId, count: storeAlerts.length, recipients: recipients?.length ?? 0 });
  }

  return new Response(JSON.stringify({ sent: results }), { status: 200 });
});
