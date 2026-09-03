import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { supabase } from "../lib/supabase";

type BatchItem = {
  batch_id: string;
  product_name: string;
  barcode: string;
  category: string | null;
  quantity: number;
  expiry_date: string;
  days_remaining: number;
  status: string;
};

function statusColors(days: number) {
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

// Formats a "YYYY-MM-DD" date string as "DD/MM/YYYY" (Venezuelan convention).
// Reformats the string directly rather than going through a Date object,
// since parsing a date-only string as UTC and rendering it in a UTC-4
// timezone can roll the displayed date back by one day.
function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return y && m && d ? `${d}/${m}/${y}` : isoDate;
}

export default function StoreInventoryScreen() {
  const [batches, setBatches] = useState<BatchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("v_expiring_batches")
      .select("*")
      .order("expiry_date", { ascending: true });
    if (err) setError(err.message);
    else setBatches((data ?? []) as BatchItem[]);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load();
    const channel = supabase
      .channel("inventory-batches")
      .on("postgres_changes", { event: "*", schema: "public", table: "batches" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(true);
  }, [load]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2F5FE0" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Error al cargar: {error}</Text>
      </View>
    );
  }

  const expired = batches.filter((b) => b.days_remaining <= 0).length;
  const urgent = batches.filter((b) => b.days_remaining > 0 && b.days_remaining <= 3).length;

  return (
    <View style={styles.screen}>
      {/* Summary strip */}
      <View style={styles.summary}>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryCount, { color: "#DC2626" }]}>{expired}</Text>
          <Text style={styles.summaryLabel}>Vencidos</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryCount, { color: "#D97706" }]}>{urgent}</Text>
          <Text style={styles.summaryLabel}>Urgentes</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryCount, { color: "#2F5FE0" }]}>{batches.length}</Text>
          <Text style={styles.summaryLabel}>Total</Text>
        </View>
      </View>

      <FlatList
        data={batches}
        keyExtractor={(item) => item.batch_id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#2F5FE0"]} />
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyIcon}>✅</Text>
            <Text style={styles.emptyTitle}>Todo en orden</Text>
            <Text style={styles.emptyBody}>
              No hay lotes próximos a vencer. Escanea productos para registrar lotes.
            </Text>
          </View>
        }
        renderItem={({ item: b }) => {
          const { fg, bg } = statusColors(b.days_remaining);
          const label =
            b.days_remaining <= 0 ? "Vencido" : `${b.days_remaining}d restantes`;
          return (
            <View style={styles.row}>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{initials(b.product_name)}</Text>
              </View>
              <View style={styles.info}>
                <Text style={styles.name} numberOfLines={1}>{b.product_name}</Text>
                <Text style={styles.meta}>
                  {b.category ?? "Sin categoría"} · {b.quantity} unid. · vence {formatDate(b.expiry_date)}
                </Text>
              </View>
              <View style={[styles.chip, { backgroundColor: bg }]}>
                <Text style={[styles.chipText, { color: fg }]}>{label}</Text>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F4F6FA" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  errorText: { color: "#DC2626", textAlign: "center", fontSize: 14 },
  summary: {
    flexDirection: "row",
    backgroundColor: "#fff",
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    paddingVertical: 16,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  summaryItem: { flex: 1, alignItems: "center" },
  summaryCount: { fontSize: 22, fontWeight: "700" },
  summaryLabel: { fontSize: 11, color: "#6B7280", marginTop: 2 },
  summaryDivider: { width: 1, backgroundColor: "#F0F1F5" },
  list: { padding: 16, paddingBottom: 40 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  badge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#EEF1F6",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  badgeText: { color: "#2F5FE0", fontWeight: "700", fontSize: 13 },
  info: { flex: 1, marginRight: 10 },
  name: { fontSize: 14, fontWeight: "600", color: "#111827" },
  meta: { fontSize: 11, color: "#6B7280", marginTop: 2 },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  chipText: { fontSize: 11, fontWeight: "700" },
  emptyWrap: { alignItems: "center", paddingTop: 60, paddingHorizontal: 32 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: "#111827", marginBottom: 8 },
  emptyBody: { fontSize: 13, color: "#6B7280", textAlign: "center", lineHeight: 20 },
});
