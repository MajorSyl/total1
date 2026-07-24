// screens/BatchEntryScreen.tsx
// Install: npx expo install @react-native-community/datetimepicker

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
import { supabase } from "../lib/supabase";

export default function BatchEntryScreen({ route, navigation }: any) {
  const { product } = route.params;

  const [quantity, setQuantity] = useState("");
  const [batchNumber, setBatchNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState<Date>(
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // default: 7 days out
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
      // storeId + registeredBy should come from auth/session context in the real app
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
        <Text style={styles.productName}>{product.name}</Text>
        <Text style={styles.productMeta}>Barcode: {product.barcode}</Text>
        {product.category && <Text style={styles.productMeta}>Category: {product.category}</Text>}
      </View>

      <Text style={styles.label}>Quantity{product.unit ? ` (${product.unit})` : ""}</Text>
      <TextInput
        style={styles.input}
        keyboardType="numeric"
        value={quantity}
        onChangeText={setQuantity}
        placeholder="e.g. 24"
      />

      <Text style={styles.label}>Batch / lot number (optional)</Text>
      <TextInput
        style={styles.input}
        value={batchNumber}
        onChangeText={setBatchNumber}
        placeholder="e.g. LOT-2026-0714"
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
            setShowPicker(Platform.OS === "ios"); // iOS spinner stays open until dismissed
            if (date) setExpiryDate(date);
          }}
        />
      )}

      <TouchableOpacity
        style={[styles.saveButton, saving && styles.saveButtonDisabled]}
        onPress={handleSave}
        disabled={saving}
      >
        <Text style={styles.saveButtonText}>{saving ? "Saving…" : "Save batch"}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, backgroundColor: "#fff", flexGrow: 1 },
  productCard: {
    backgroundColor: "#f3f4f6",
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  productName: { fontSize: 18, fontWeight: "700", color: "#111827" },
  productMeta: { fontSize: 13, color: "#6b7280", marginTop: 2 },
  label: { fontSize: 14, fontWeight: "600", color: "#374151", marginBottom: 6, marginTop: 12 },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  dateButton: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  dateButtonText: { fontSize: 16, color: "#111827" },
  saveButton: {
    backgroundColor: "#2563eb",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 28,
  },
  saveButtonDisabled: { backgroundColor: "#93c5fd" },
  saveButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
