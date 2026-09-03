import React, { useState } from "react";
import { Text, TextInput, TouchableOpacity, StyleSheet, Alert, ScrollView } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { supabase } from "../lib/supabase";

export default function NewProductScreen({ route, navigation }: any) {
  const { barcode } = route.params;

  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [unit, setUnit] = useState("");
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!name.trim()) {
      Alert.alert("Nombre requerido", "Ingresa el nombre del producto.");
      return;
    }

    setSaving(true);
    try {
      const { data: product, error } = await supabase
        .from("products")
        .insert({
          barcode,
          name: name.trim(),
          category: category.trim() || null,
          unit: unit.trim() || null,
        })
        .select()
        .single();

      if (error) throw error;

      navigation.replace("BatchEntry", { product });
    } catch (err: any) {
      Alert.alert("No se pudo crear el producto", err.message ?? "Inténtalo de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Nuevo producto</Text>
      <Text style={styles.subtitle}>El código {barcode} no está registrado todavía.</Text>

      <Text style={styles.label}>Nombre del producto</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="ej. Leche Entera 1L"
        placeholderTextColor="#9CA3AF"
      />

      <Text style={styles.label}>Categoría</Text>
      <TextInput
        style={styles.input}
        value={category}
        onChangeText={setCategory}
        placeholder="ej. Lácteos"
        placeholderTextColor="#9CA3AF"
      />

      <Text style={styles.label}>Unidad</Text>
      <TextInput
        style={styles.input}
        value={unit}
        onChangeText={setUnit}
        placeholder="ej. botella, kg, caja"
        placeholderTextColor="#9CA3AF"
      />

      <TouchableOpacity onPress={handleCreate} disabled={saving} activeOpacity={0.85}>
        <LinearGradient
          colors={saving ? ["#93c5fd", "#93c5fd"] : ["#2F5FE0", "#4C7DFF"]}
          style={styles.button}
        >
          <Text style={styles.buttonText}>{saving ? "Creando…" : "Crear y agregar lote"}</Text>
        </LinearGradient>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, flexGrow: 1, backgroundColor: "#F4F6FA" },
  title: { fontSize: 20, fontWeight: "700", color: "#111827" },
  subtitle: { fontSize: 14, color: "#6b7280", marginTop: 4, marginBottom: 20 },
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
  button: { borderRadius: 12, paddingVertical: 15, alignItems: "center", marginTop: 28 },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
