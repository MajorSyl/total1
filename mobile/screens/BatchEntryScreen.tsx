import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
  ScrollView,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { LinearGradient } from "expo-linear-gradient";
import * as Notifications from "expo-notifications";
import { supabase } from "../lib/supabase";

async function sendLocalExpiryAlert(productName: string, daysRemaining: number) {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") return;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: daysRemaining <= 0 ? "⚠️ Lote vencido registrado" : "⏳ Lote próximo a vencer",
        body:
          daysRemaining <= 0
            ? `${productName} ya está vencido. Considera retirarlo de las estanterías.`
            : `${productName} vence en ${daysRemaining} día(s). Revísalo pronto.`,
        sound: true,
      },
      trigger: null,
    });
  } catch (_e) {
    // Notification permission not available — skip silently
  }
}

export default function BatchEntryScreen({ route, navigation }: any) {
  const { product } = route.params;

  const [quantity, setQuantity] = useState("");
  const [batchNumber, setBatchNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState<Date>(
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  );
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!quantity || isNaN(Number(quantity)) || Number(quantity) <= 0) {
      Alert.alert("Revisa la cantidad", "Ingresa una cantidad válida mayor que 0.");
      return;
    }

    setSaving(true);
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
        .select("id, store_id")
        .eq("auth_user_id", user.id)
        .single();

      if (staffError || !staffRow) {
        Alert.alert(
          "Cuenta no configurada",
          "Tu perfil de personal ya no está disponible. Pídele a un administrador que verifique tu cuenta."
        );
        return;
      }

      const { error } = await supabase.from("batches").insert({
        product_id: product.id,
        store_id: staffRow?.store_id,
        registered_by: staffRow?.id,
        batch_number: batchNumber || null,
        quantity: Number(quantity),
        expiry_date: expiryDate.toISOString().split("T")[0],
        status: "active",
      });

      if (error) throw error;

      // Send immediate local notification if batch is expired or near expiry
      const daysRemaining = Math.floor((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      if (daysRemaining <= 3) {
        await sendLocalExpiryAlert(product.name, daysRemaining);
      }

      Alert.alert(
        "Lote guardado",
        `Lote registrado para ${product.name}.`,
        [{ text: "Escanear siguiente", onPress: () => navigation.navigate("BarcodeScan") }]
      );
    } catch (err: any) {
      Alert.alert("Error al guardar", err.message ?? "Inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.productCard}>
        <View style={styles.productBadge}>
          <Text style={styles.productBadgeText}>
            {product.name.split(" ").slice(0, 2).map((w: string) => w[0]?.toUpperCase()).join("")}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.productName}>{product.name}</Text>
          <Text style={styles.productMeta}>Código: {product.barcode}</Text>
          {product.category && <Text style={styles.productMeta}>{product.category}</Text>}
        </View>
      </View>

      <Text style={styles.label}>Cantidad{product.unit ? ` (${product.unit})` : ""}</Text>
      <TextInput
        style={styles.input}
        keyboardType="numeric"
        value={quantity}
        onChangeText={setQuantity}
        placeholder="ej. 24"
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

      <Text style={styles.label}>Fecha de vencimiento</Text>
      <TouchableOpacity style={styles.dateButton} onPress={() => setShowPicker(true)}>
        <Text style={styles.dateButtonText}>{expiryDate.toLocaleDateString("es-VE")}</Text>
      </TouchableOpacity>
      {showPicker && (
        <DateTimePicker
          value={expiryDate}
          mode="date"
          minimumDate={new Date()}
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={(_, date) => {
            setShowPicker(Platform.OS === "ios");
            if (date) setExpiryDate(date);
          }}
        />
      )}

      <TouchableOpacity onPress={handleSave} disabled={saving} activeOpacity={0.85}>
        <LinearGradient
          colors={saving ? ["#93c5fd", "#93c5fd"] : ["#2F5FE0", "#4C7DFF"]}
          style={styles.saveButton}
        >
          <Text style={styles.saveButtonText}>{saving ? "Guardando…" : "Guardar lote"}</Text>
        </LinearGradient>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, backgroundColor: "#F4F6FA", flexGrow: 1 },
  productCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
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
  dateButton: {
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  dateButtonText: { fontSize: 16, color: "#111827" },
  saveButton: {
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 28,
  },
  saveButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
