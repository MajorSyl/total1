import React, { Component, useEffect, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { supabase } from "./lib/supabase";

import LoginScreen from "./screens/LoginScreen";
import BarcodeScanScreen from "./screens/BarcodeScanScreen";
import BatchEntryScreen from "./screens/BatchEntryScreen";
import NewProductScreen from "./screens/NewProductScreen";

export type RootStackParamList = {
  Login: undefined;
  BarcodeScan: undefined;
  BatchEntry: { product: any };
  NewProduct: { barcode: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

// Catches any render-time JS error and shows it on screen in production.
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
            App error — please screenshot and share this:
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
            <Stack.Screen name="BarcodeScan" component={BarcodeScanScreen} options={{ title: "Scan product" }} />
            <Stack.Screen name="BatchEntry" component={BatchEntryScreen} options={{ title: "Register batch" }} />
            <Stack.Screen name="NewProduct" component={NewProductScreen} options={{ title: "New product" }} />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
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
