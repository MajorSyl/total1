// screens/BatchEntryScreen.tsx

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
import { supabase } from "../lib/supabase";

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
      Alert.alert("Check quantity", "Enter a valid quantity greater than 0.");
      return;
    }

    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data: staffRow } = await supabase
        .from("staff")
        .select("id, store_id")
        .eq("auth_user_id", user?.id)
        .single();

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

      Alert.alert("Saved", `Batch registered for ${product.name}.`, [
        { text: "Scan next", onPress: () => navigation.navigate("BarcodeScan") },
      ]);
    } catch (err: any) {
      Alert.alert("Save failed", err.message ?? "Please try again.");
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
        <View>
          <Text style={styles.productName}>{product.name}</Text>
          <Text style={styles.productMeta}>Barcode: {product.barcode}</Text>
          {product.category && <Text style={styles.productMeta}>{product.category}</Text>}
        </View>
      </View>

      <Text style={styles.label}>Quantity{product.unit ? ` (${product.unit})` : ""}</Text>
      <TextInput
        style={styles.input}
        keyboardType="numeric"
        value={quantity}
        onChangeText={setQuantity}
        placeholder="e.g. 24"
        placeholderTextColor="#9CA3AF"
      />

      <Text style={styles.label}>Batch / lot number (optional)</Text>
      <TextInput
        style={styles.input}
        value={batchNumber}
        onChangeText={setBatchNumber}
        placeholder="e.g. LOT-2026-0714"
        placeholderTextColor="#9CA3AF"
      />

      <Text style={styles.label}>Expiry date</Text>
      <TouchableOpacity style={styles.dateButton} onPress={() => setShowPicker(true)}>
        <Text style={styles.dateButtonText}>{expiryDate.toDateString()}</Text>
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
          <Text style={styles.saveButtonText}>{saving ? "Saving…" : "Save batch"}</Text>
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
