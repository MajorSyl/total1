// screens/LoginScreen.tsx

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
import { supabase } from "../lib/supabase";

export default function LoginScreen({ navigation }: any) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert("Missing details", "Enter your email and password.");
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
          "Account not set up",
          "Your login works, but no staff profile is linked to it yet. Ask an admin to add you."
        );
        return;
      }

      navigation.replace("BarcodeScan");
    } catch (err: any) {
      Alert.alert("Login failed", err.message ?? "Check your details and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <LinearGradient colors={["#2F5FE0", "#4C7DFF"]} style={styles.hero}>
        <Text style={styles.heroEyebrow}>Mall Expiry Tracker</Text>
        <Text style={styles.heroTitle}>Staff sign in</Text>
        <Text style={styles.heroSubtitle}>Sign in to start scanning and registering batches.</Text>
      </LinearGradient>

      <View style={styles.card}>
        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="you@mall.com"
          placeholderTextColor="#9CA3AF"
        />

        <Text style={styles.label}>Password</Text>
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
            <Text style={styles.buttonText}>{loading ? "Signing in…" : "Sign in"}</Text>
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
