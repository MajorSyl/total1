// screens/NewProductScreen.tsx

import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView } from "react-native";
import { supabase } from "../lib/supabase";

export default function NewProductScreen({ route, navigation }: any) {
  const { barcode } = route.params;

  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [unit, setUnit] = useState("");
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert("Missing name", "Enter a product name.");
      return;
    }

    setSaving(true);
    try {
      const { data: product, error } = await supabase
        .from("products")
        .insert({ barcode, name: name.trim(), category: category.trim() || null, unit: unit.trim() || null })
        .select()
        .single();

      if (error) throw error;

      // Straight into batch entry for this newly created product
      navigation.replace("BatchEntry", { product });
    } catch (err: any) {
      Alert.alert("Could not create product", err.message ?? "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>New product</Text>
      <Text style={styles.subtitle}>Barcode {barcode} isn't registered yet.</Text>

      <Text style={styles.label}>Product name</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Whole Milk 1L" />

      <Text style={styles.label}>Category</Text>
      <TextInput style={styles.input} value={category} onChangeText={setCategory} placeholder="e.g. Dairy" />

      <Text style={styles.label}>Unit</Text>
      <TextInput style={styles.input} value={unit} onChangeText={setUnit} placeholder="e.g. bottle, kg, box" />

      <TouchableOpacity style={[styles.button, saving && styles.buttonDisabled]} onPress={handleCreate} disabled={saving}>
        <Text style={styles.buttonText}>{saving ? "Creating…" : "Create & add batch"}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, flexGrow: 1, backgroundColor: "#fff" },
  title: { fontSize: 20, fontWeight: "700", color: "#111827" },
  subtitle: { fontSize: 14, color: "#6b7280", marginTop: 4, marginBottom: 20 },
  label: { fontSize: 14, fontWeight: "600", color: "#374151", marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderColor: "#d1d5db", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  button: { backgroundColor: "#2563eb", borderRadius: 8, paddingVertical: 14, alignItems: "center", marginTop: 28 },
  buttonDisabled: { backgroundColor: "#93c5fd" },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
