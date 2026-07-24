import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Notifications from "expo-notifications";
import { supabase } from "../lib/supabase";

async function registerPushToken(staffId: string) {
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") return;
    // getExpoPushTokenAsync requires the EAS projectId to be configured in app.json
    // (run 'eas update:configure' once, then rebuild — this will start working automatically)
    const token = await Notifications.getExpoPushTokenAsync();
    await supabase
      .from("staff")
      .update({ push_token: token.data })
      .eq("id", staffId);
  } catch (_e) {
    // Silently ignore — push tokens require EAS projectId to be set up
  }
}

export default function LoginScreen({ navigation }: any) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert("Datos incompletos", "Ingresa tu correo y contraseña.");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;

      const { data: staffRow, error: staffError } = await supabase
        .from("staff")
        .select("id, full_name, role, store_id")
        .eq("auth_user_id", data.user.id)
        .maybeSingle();

      if (staffError) throw staffError;

      if (!staffRow) {
        await supabase.auth.signOut();
        Alert.alert(
          "Cuenta no configurada",
          "Tu acceso funciona, pero tu cuenta no tiene un perfil de personal asignado. Pídele a un administrador que te agregue."
        );
        return;
      }

      // Register push token in the background — non-blocking
      registerPushToken(staffRow.id);

      navigation.replace("BarcodeScan");
    } catch (err: any) {
      Alert.alert("Error de inicio de sesión", err.message ?? "Verifica tus datos e inténtalo de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <LinearGradient colors={["#2F5FE0", "#4C7DFF"]} style={styles.hero}>
        <Text style={styles.heroEyebrow}>Total Mundo</Text>
        <Text style={styles.heroTitle}>Inicio de sesión</Text>
        <Text style={styles.heroSubtitle}>Inicia sesión para escanear y registrar lotes.</Text>
      </LinearGradient>

      <View style={styles.card}>
        <Text style={styles.label}>Correo electrónico</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="correo@tienda.com"
          placeholderTextColor="#9CA3AF"
        />

        <Text style={styles.label}>Contraseña</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="••••••••"
          placeholderTextColor="#9CA3AF"
        />

        <TouchableOpacity onPress={handleLogin} disabled={loading} activeOpacity={0.85}>
          <LinearGradient
            colors={loading ? ["#93c5fd", "#93c5fd"] : ["#2F5FE0", "#4C7DFF"]}
            style={styles.button}
          >
            <Text style={styles.buttonText}>
              {loading ? "Iniciando sesión…" : "Iniciar sesión"}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F4F6FA" },
  hero: {
    paddingTop: 80,
    paddingBottom: 48,
    paddingHorizontal: 28,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  heroEyebrow: { color: "rgba(255,255,255,0.75)", fontSize: 13, fontWeight: "600", marginBottom: 8 },
  heroTitle: { color: "#fff", fontSize: 28, fontWeight: "700" },
  heroSubtitle: { color: "rgba(255,255,255,0.85)", fontSize: 14, marginTop: 8 },
  card: {
    marginTop: -24,
    marginHorizontal: 20,
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 24,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  label: { fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6, marginTop: 14 },
  input: {
    backgroundColor: "#F4F6FA",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#14171F",
  },
  button: {
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 28,
  },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
