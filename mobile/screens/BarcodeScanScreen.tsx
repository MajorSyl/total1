import React, { useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { supabase } from "../lib/supabase";

type Product = {
  id: string;
  barcode: string;
  name: string;
  category: string | null;
  image_url: string | null;
  unit: string | null;
};

export default function BarcodeScanScreen({ navigation }: any) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);
  const lockRef = useRef(false);

  if (!permission) {
    return <View style={styles.center}><ActivityIndicator /></View>;
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.message}>
          Necesitamos acceso a la cámara para escanear códigos de barras.
        </Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Conceder permiso</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleBarcodeScanned = async ({ data }: { data: string }) => {
    if (lockRef.current) return;
    lockRef.current = true;
    setScanned(true);
    setLoading(true);

    try {
      const { data: product, error } = await supabase
        .from("products")
        .select("id, barcode, name, category, image_url, unit")
        .eq("barcode", data)
        .maybeSingle();

      if (error) throw error;

      if (product) {
        navigation.navigate("BatchEntry", { product });
      } else {
        navigation.navigate("NewProduct", { barcode: data });
      }
    } catch (err: any) {
      Alert.alert("Error de búsqueda", err.message ?? "Inténtalo de nuevo.");
    } finally {
      setLoading(false);
      setTimeout(() => {
        lockRef.current = false;
        setScanned(false);
      }, 1500);
    }
  };

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        barcodeScannerSettings={{
          barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "code128"],
        }}
        onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
      />

      <View style={styles.overlay}>
        <View style={styles.scanFrame} />
        <Text style={styles.hint}>Alinea el código dentro del marco</Text>
      </View>

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.loadingText}>Buscando producto…</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  message: { textAlign: "center", marginBottom: 16, fontSize: 16, color: "#111827" },
  button: { backgroundColor: "#2F5FE0", paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },
  buttonText: { color: "#fff", fontWeight: "600" },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  scanFrame: {
    width: 260,
    height: 160,
    borderWidth: 3,
    borderColor: "#4C7DFF",
    borderRadius: 16,
    backgroundColor: "transparent",
  },
  hint: { color: "#fff", marginTop: 16, fontSize: 14 },
  loadingOverlay: {
    position: "absolute",
    bottom: 60,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  loadingText: { color: "#fff", marginTop: 8 },
});
