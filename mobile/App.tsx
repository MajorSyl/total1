import React, { Component, useEffect, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import * as Notifications from "expo-notifications";
import { supabase } from "./lib/supabase";

import LoginScreen from "./screens/LoginScreen";
import BarcodeScanScreen from "./screens/BarcodeScanScreen";
import BatchEntryScreen from "./screens/BatchEntryScreen";
import NewProductScreen from "./screens/NewProductScreen";
import StoreInventoryScreen from "./screens/StoreInventoryScreen";

// Show notifications when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export type RootStackParamList = {
  Login: undefined;
  BarcodeScan: undefined;
  BatchEntry: { product: any };
  NewProduct: { barcode: string };
  StoreInventory: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

class ErrorBoundary extends Component<
  { children: React.ReactNode },
  { error: string | null }
> {
  state = { error: null };
  static getDerivedStateFromError(err: unknown) {
    return { error: String(err) };
  }
  render() {
    if (this.state.error) {
      return (
        <ScrollView
          contentContainerStyle={{ flex: 1, padding: 24, backgroundColor: "#fff" }}
        >
          <Text style={{ color: "#DC2626", fontSize: 16, fontWeight: "700", marginBottom: 12 }}>
            Error de la app — toma una captura y compártela:
          </Text>
          <Text style={{ fontFamily: "monospace", fontSize: 12, color: "#111" }}>
            {this.state.error}
          </Text>
        </ScrollView>
      );
    }
    return this.props.children;
  }
}

function AppNavigator() {
  const [checkingSession, setCheckingSession] = useState(true);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSignedIn(!!data.session);
      setCheckingSession(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(!!session);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  if (checkingSession) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: true }}>
        {signedIn ? (
          <>
            <Stack.Screen
              name="BarcodeScan"
              component={BarcodeScanScreen}
              options={({ navigation }) => ({
                title: "Escanear producto",
                headerRight: () => (
                  <TouchableOpacity
                    onPress={() => navigation.navigate("StoreInventory")}
                    style={{ paddingHorizontal: 4 }}
                  >
                    <Text style={{ color: "#2F5FE0", fontWeight: "600", fontSize: 14 }}>
                      Mi tienda
                    </Text>
                  </TouchableOpacity>
                ),
              })}
            />
            <Stack.Screen
              name="BatchEntry"
              component={BatchEntryScreen}
              options={{ title: "Registrar lote" }}
            />
            <Stack.Screen
              name="NewProduct"
              component={NewProductScreen}
              options={{ title: "Nuevo producto" }}
            />
            <Stack.Screen
              name="StoreInventory"
              component={StoreInventoryScreen}
              options={{ title: "Mi tienda" }}
            />
          </>
        ) : (
          <Stack.Screen
            name="Login"
            component={LoginScreen}
            options={{ headerShown: false }}
          />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppNavigator />
    </ErrorBoundary>
  );
}
