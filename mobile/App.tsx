// App.tsx — root navigation for the mobile app
// Install: npx expo install @react-navigation/native @react-navigation/native-stack react-native-screens react-native-safe-area-context

import React, { useEffect, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ActivityIndicator, View } from "react-native";
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

export default function App() {
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
