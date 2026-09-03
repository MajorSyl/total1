import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { supabase } from "../lib/supabase";

// Formats a "YYYY-MM-DD" date string as "DD/MM/YYYY" (Venezuelan convention).
// Reformats the string directly rather than going through a Date object,
// since parsing a date-only string as UTC and rendering it in a UTC-4
// timezone can roll the displayed date back by one day.
function formatDate(isoDate: string | null | undefined): string {
  if (!isoDate) return "—";
  const [y, m, d] = isoDate.split("-");
  return y && m && d ? `${d}/${m}/${y}` : isoDate;
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("es-VE");
}

type BatchDetail = {
  id: string;
  batch_number: string | null;
  quantity: number;
  expiry_date: string;
  status: string;
  created_at: string;
  products: { name: string; barcode: string; category: string | null } | null;
};

export default function BatchDetailScreen({ route, navigation }: any) {
  const { batchId } = route.params;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [batch, setBatch] = useState<BatchDetail | null>(null);

  const [editing, setEditing] = useState(false);
  const [quantity, setQuantity] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [batchNumber, setBatchNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await supabase
      .from("batches")
      .select("id, batch_number, quantity, expiry_date, status, created_at, products ( name, barcode, category )")
      .eq("id", batchId)
      .single();
    if (error) {
      setLoadError(error.message);
    } else {
      const b = data as unknown as BatchDetail;
      setBatch(b);
      setQuantity(String(b.quantity));
      setExpiryDate(b.expiry_date);
      setBatchNumber(b.batch_number ?? "");
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [batchId]);

  const handleSave = async () => {
    if (!batch) return;
    if (!quantity || isNaN(Number(quantity)) || Number(quantity) <= 0) {
      setSaveError("Ingresa una cantidad válida mayor que 0.");
      return;
    }
    if (!expiryDate) {
      setSaveError("Ingresa una fecha de vencimiento.");
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert("Sesión expirada", "Vuelve a iniciar sesión para continuar.");
        return;
      }
      const { data: staffRow, error: staffError } = await supabase
        .from("staff")
        .select("id")
        .eq("auth_user_id", user.id)
        .single();
      if (staffError || !staffRow) {
        Alert.alert(
          "Cuenta no configurada",
          "Tu perfil de personal ya no está disponible. Pídele a un administrador que verifique tu cuenta."
        );
        return;
      }

      const changes = {
        quantity: Number(quantity),
        expiry_date: expiryDate,
        batch_number: batchNumber.trim() || null,
        updated_at: new Date().toISOString(),
      };

      const { error: updateError } = await supabase
        .from("batches")
        .update(changes)
        .eq("id", batch.id);
      if (updateError) throw updateError;

      await supabase.from("audit_log").insert({
        table_name: "batches",
        row_id: batch.id,
        action: "UPDATE",
        old_data: { quantity: batch.quantity, expiry_date: batch.expiry_date, batch_number: batch.batch_number },
        new_data: changes,
        performed_by: staffRow.id,
      });

      setEditing(false);
      await load();
      Alert.alert("Lote actualizado", "Los cambios se guardaron correctamente.");
    } catch (err: any) {
      setSaveError(err.message ?? "Error al guardar. Inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      "¿Eliminar este lote?",
      "El lote quedará marcado como eliminado y desaparecerá del inventario. La acción queda registrada en el historial de auditoría.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Sí, eliminar",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            try {
              const { error } = await supabase.rpc("soft_delete_batch", { p_batch_id: batchId });
              if (error) throw error;
              navigation.goBack();
            } catch (err: any) {
              Alert.alert("No se pudo eliminar", err.message ?? "Inténtalo de nuevo.");
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2F5FE0" />
      </View>
    );
  }

  if (loadError || !batch) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Error al cargar el lote: {loadError ?? "no encontrado"}</Text>
      </View>
    );
  }

  const product = batch.products;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.productCard}>
        <View style={styles.productBadge}>
          <Text style={styles.productBadgeText}>
            {(product?.name ?? "?").split(" ").slice(0, 2).map((w) => w[0]?.toUpperCase()).join("")}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.productName}>{product?.name ?? "Producto desconocido"}</Text>
          <Text style={styles.productMeta}>Código: {product?.barcode ?? "—"}</Text>
          {product?.category && <Text style={styles.productMeta}>{product.category}</Text>}
        </View>
      </View>

      {!editing ? (
        <>
          <DetailRow label="Cantidad" value={`${batch.quantity} unid.`} />
          <DetailRow label="Fecha de vencimiento" value={formatDate(batch.expiry_date)} />
          <DetailRow label="Número de lote" value={batch.batch_number ?? "Sin número"} />
          <DetailRow label="Fecha de registro" value={formatDateTime(batch.created_at)} />
          <DetailRow label="Estado" value={batch.status === "expired" ? "Vencido" : batch.status === "active" ? "Activo" : batch.status} />

          <TouchableOpacity onPress={() => setEditing(true)} activeOpacity={0.85} style={{ marginTop: 24 }}>
            <View style={styles.editButton}>
              <Text style={styles.editButtonText}>Editar lote</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleDelete} disabled={deleting} activeOpacity={0.85} style={{ marginTop: 12 }}>
            <View style={styles.deleteButton}>
              <Text style={styles.deleteButtonText}>{deleting ? "Eliminando…" : "Eliminar lote"}</Text>
            </View>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={styles.label}>Cantidad</Text>
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            value={quantity}
            onChangeText={setQuantity}
            placeholder="ej. 24"
            placeholderTextColor="#9CA3AF"
          />

          <Text style={styles.label}>Fecha de vencimiento (AAAA-MM-DD)</Text>
          <TextInput
            style={styles.input}
            value={expiryDate}
            onChangeText={setExpiryDate}
            placeholder="2026-12-31"
            placeholderTextColor="#9CA3AF"
          />

          <Text style={styles.label}>Número de lote (opcional)</Text>
          <TextInput
            style={styles.input}
            value={batchNumber}
            onChangeText={setBatchNumber}
            placeholder="ej. LOT-2026-0714"
            placeholderTextColor="#9CA3AF"
          />

          {saveError && <Text style={styles.errorInline}>{saveError}</Text>}

          <View style={{ flexDirection: "row", gap: 12, marginTop: 20 }}>
            <TouchableOpacity
              style={{ flex: 1 }}
              onPress={() => {
                setEditing(false);
                setSaveError(null);
                setQuantity(String(batch.quantity));
                setExpiryDate(batch.expiry_date);
                setBatchNumber(batch.batch_number ?? "");
              }}
            >
              <View style={styles.cancelButton}>
                <Text style={styles.cancelButtonText}>Cancelar</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={{ flex: 1 }} onPress={handleSave} disabled={saving} activeOpacity={0.85}>
              <LinearGradient
                colors={saving ? ["#93c5fd", "#93c5fd"] : ["#2F5FE0", "#4C7DFF"]}
                style={styles.saveButton}
              >
                <Text style={styles.saveButtonText}>{saving ? "Guardando…" : "Guardar cambios"}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </>
      )}
    </ScrollView>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, backgroundColor: "#F4F6FA", flexGrow: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  errorText: { color: "#DC2626", textAlign: "center", fontSize: 14 },
  errorInline: { color: "#DC2626", fontSize: 13, marginTop: 8 },
  productCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  productBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#EEF1F6",
    alignItems: "center",
    justifyContent: "center",
  },
  productBadgeText: { color: "#2F5FE0", fontWeight: "700", fontSize: 14 },
  productName: { fontSize: 16, fontWeight: "700", color: "#111827" },
  productMeta: { fontSize: 12, color: "#6b7280", marginTop: 2 },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 8,
  },
  detailLabel: { fontSize: 13, color: "#6B7280", fontWeight: "600" },
  detailValue: { fontSize: 13, color: "#111827", fontWeight: "600" },
  label: { fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6, marginTop: 14 },
  input: {
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#14171F",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  editButton: {
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    backgroundColor: "#EEF1F6",
  },
  editButtonText: { color: "#2F5FE0", fontWeight: "700", fontSize: 16 },
  deleteButton: {
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    backgroundColor: "#FEE2E2",
  },
  deleteButtonText: { color: "#DC2626", fontWeight: "700", fontSize: 16 },
  cancelButton: {
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    backgroundColor: "#EEF1F6",
  },
  cancelButtonText: { color: "#374151", fontWeight: "700", fontSize: 16 },
  saveButton: {
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
  },
  saveButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
