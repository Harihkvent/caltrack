import { useEffect, useMemo, useState } from "react";
import { StatusBar } from "expo-status-bar";
import * as ImagePicker from "expo-image-picker";
import type { Session } from "@supabase/supabase-js";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  createMeal,
  getGoals,
  getMeals,
  getSummary,
  patchGoals,
} from "./src/lib/api";
import { supabase } from "./src/lib/supabase";
import type { Meal, Profile, Summary } from "./src/types";

const todayIso = new Date().toISOString().slice(0, 10);

function generateIdempotencyKey() {
  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [source, setSource] = useState<"text" | "photo">("text");
  const [rawInput, setRawInput] = useState("");
  const [photoDataUrl, setPhotoDataUrl] = useState("");
  const [selectedDate, setSelectedDate] = useState(todayIso);
  const [summaryRange, setSummaryRange] = useState<"week" | "month">("week");

  const [meals, setMeals] = useState<Meal[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [goalCalories, setGoalCalories] = useState("");
  const [goalProtein, setGoalProtein] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoadingSession(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    void loadAll(session);
  }, [session, selectedDate, summaryRange]);

  const summaryText = useMemo(() => {
    if (!summary) return "No summary yet";
    return `Total ${summary.total_calories} kcal · Avg ${summary.avg_calories.toFixed(1)} kcal/day`;
  }, [summary]);

  async function loadAll(activeSession: Session) {
    setLoadingData(true);
    setError(null);
    try {
      const [mealsResult, summaryResult, profileResult] = await Promise.all([
        getMeals(activeSession, selectedDate),
        getSummary(activeSession, summaryRange),
        getGoals(activeSession),
      ]);
      setMeals(mealsResult);
      setSummary(summaryResult);
      setProfile(profileResult);
      setGoalCalories(String(profileResult.daily_calorie_goal));
      setGoalProtein(String(profileResult.daily_protein_goal_g));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed loading data");
    } finally {
      setLoadingData(false);
    }
  }

  async function signIn() {
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (signInError) setError(signInError.message);
  }

  async function signUp() {
    setError(null);
    const { error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });
    if (signUpError) setError(signUpError.message);
    else Alert.alert("Check your email", "Complete confirmation if email verification is enabled.");
  }

  async function signOut() {
    await supabase.auth.signOut();
    setMeals([]);
    setSummary(null);
    setProfile(null);
  }

  async function choosePhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("Photo library permission denied");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.6,
      base64: true,
    });
    if (!result.canceled && result.assets[0]?.base64) {
      setPhotoDataUrl(`data:image/jpeg;base64,${result.assets[0].base64}`);
    }
  }

  async function submitMeal() {
    if (!session) return;
    setError(null);
    try {
      const payload =
        source === "text"
          ? {
              source,
              raw_input: rawInput.trim(),
              idempotency_key: generateIdempotencyKey(),
            }
          : {
              source,
              raw_input: rawInput.trim() || undefined,
              photo_url: photoDataUrl,
              idempotency_key: generateIdempotencyKey(),
            };
      await createMeal(session, payload);
      setRawInput("");
      setPhotoDataUrl("");
      await loadAll(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed creating meal");
    }
  }

  async function saveGoals() {
    if (!session) return;
    setError(null);
    try {
      const updated = await patchGoals(session, {
        daily_calorie_goal: Number(goalCalories),
        daily_protein_goal_g: Number(goalProtein),
      });
      setProfile(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed updating goals");
    }
  }

  if (loadingSession) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.authCard}>
          <Text style={styles.title}>CalTrack</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            autoCapitalize="none"
            style={styles.input}
          />
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            secureTextEntry
            style={styles.input}
          />
          <View style={styles.row}>
            <Pressable style={styles.primaryButton} onPress={signIn}>
              <Text style={styles.buttonText}>Sign In</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={signUp}>
              <Text style={styles.buttonText}>Sign Up</Text>
            </Pressable>
          </View>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>
        <StatusBar style="dark" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>CalTrack</Text>
          <Pressable style={styles.secondaryButton} onPress={signOut}>
            <Text style={styles.buttonText}>Sign Out</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Log meal</Text>
          <View style={styles.row}>
            <Pressable
              style={[styles.toggleButton, source === "text" && styles.toggleButtonActive]}
              onPress={() => setSource("text")}
            >
              <Text style={styles.buttonText}>Text</Text>
            </Pressable>
            <Pressable
              style={[styles.toggleButton, source === "photo" && styles.toggleButtonActive]}
              onPress={() => setSource("photo")}
            >
              <Text style={styles.buttonText}>Photo</Text>
            </Pressable>
          </View>
          <TextInput
            value={rawInput}
            onChangeText={setRawInput}
            placeholder={source === "text" ? "2 eggs + toast" : "Optional caption"}
            multiline
            style={[styles.input, styles.textArea]}
          />
          {source === "photo" ? (
            <>
              <Pressable style={styles.secondaryButton} onPress={choosePhoto}>
                <Text style={styles.buttonText}>
                  {photoDataUrl ? "Photo selected" : "Choose photo"}
                </Text>
              </Pressable>
              <Text style={styles.helperText}>
                Picked image is sent as data URL to backend estimator.
              </Text>
            </>
          ) : null}
          <Pressable style={styles.primaryButton} onPress={submitMeal}>
            <Text style={styles.buttonText}>Submit meal</Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Daily meals</Text>
          <TextInput
            value={selectedDate}
            onChangeText={setSelectedDate}
            placeholder="YYYY-MM-DD"
            style={styles.input}
          />
          {meals.map((meal) => (
            <View key={meal.id} style={styles.mealRow}>
              <Text style={styles.mealTitle}>{meal.calories} kcal</Text>
              <Text style={styles.helperText}>
                P {meal.protein_g}g · C {meal.carbs_g}g · F {meal.fat_g}g
              </Text>
            </View>
          ))}
          {meals.length === 0 ? <Text style={styles.helperText}>No meals for this day.</Text> : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Summary</Text>
          <View style={styles.row}>
            <Pressable
              style={[styles.toggleButton, summaryRange === "week" && styles.toggleButtonActive]}
              onPress={() => setSummaryRange("week")}
            >
              <Text style={styles.buttonText}>Week</Text>
            </Pressable>
            <Pressable
              style={[styles.toggleButton, summaryRange === "month" && styles.toggleButtonActive]}
              onPress={() => setSummaryRange("month")}
            >
              <Text style={styles.buttonText}>Month</Text>
            </Pressable>
          </View>
          <Text style={styles.mealTitle}>{summaryText}</Text>
          {summary?.by_day.map((entry) => (
            <Text key={entry.day} style={styles.helperText}>
              {entry.day}: {entry.calories} kcal
            </Text>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Goals</Text>
          <TextInput
            value={goalCalories}
            onChangeText={setGoalCalories}
            placeholder="Daily calorie goal"
            keyboardType="number-pad"
            style={styles.input}
          />
          <TextInput
            value={goalProtein}
            onChangeText={setGoalProtein}
            placeholder="Daily protein goal (g)"
            keyboardType="number-pad"
            style={styles.input}
          />
          <Pressable style={styles.primaryButton} onPress={saveGoals}>
            <Text style={styles.buttonText}>Save goals</Text>
          </Pressable>
          {profile ? (
            <Text style={styles.helperText}>
              Current: {profile.daily_calorie_goal} kcal / {profile.daily_protein_goal_g}g protein
            </Text>
          ) : null}
        </View>

        {loadingData ? <ActivityIndicator /> : null}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </ScrollView>
      <StatusBar style="dark" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#f4f5f7",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    padding: 16,
    gap: 12,
  },
  authCard: {
    margin: 16,
    padding: 16,
    borderRadius: 12,
    backgroundColor: "#fff",
    gap: 10,
  },
  card: {
    borderRadius: 12,
    padding: 14,
    backgroundColor: "#fff",
    gap: 10,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  row: {
    flexDirection: "row",
    gap: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  input: {
    borderWidth: 1,
    borderColor: "#d5d8dd",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#fff",
  },
  textArea: {
    minHeight: 70,
    textAlignVertical: "top",
  },
  primaryButton: {
    backgroundColor: "#2166f3",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
  },
  secondaryButton: {
    backgroundColor: "#5b6270",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
  },
  toggleButton: {
    backgroundColor: "#667085",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
  },
  toggleButtonActive: {
    backgroundColor: "#2166f3",
  },
  buttonText: {
    color: "#fff",
    fontWeight: "600",
  },
  mealRow: {
    borderTopColor: "#eceef2",
    borderTopWidth: 1,
    paddingTop: 8,
    gap: 4,
  },
  mealTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  helperText: {
    color: "#5d6575",
  },
  errorText: {
    color: "#c32323",
  },
});
