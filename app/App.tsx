import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StatusBar } from "expo-status-bar";
import * as ImagePicker from "expo-image-picker";
import type { Session } from "@supabase/supabase-js";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Modal,
  Platform,
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
  getWeightHistory,
  logWeight,
  getWaterLogs,
  logWater,
  logEntry,
  getExercises,
  deleteDayEntries,
  deleteMeal,
  patchMeal,
  deleteExercise,
  patchExercise,
  getDashboard,
} from "./src/lib/api";
import { supabase } from "./src/lib/supabase";
import type { Meal, Profile, Summary, WeightLog, WaterDailySummary, Exercise } from "./src/types";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";

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

// ─── Toast system ────────────────────────────────────────────────────────────
type ToastType = "error" | "warning" | "info";
interface Toast { message: string; type: ToastType; id: number; }

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [loadingData, setLoadingData] = useState(false);

  // Toast notification state (replaces raw error state for in-app feedback)
  const [toast, setToast] = useState<Toast | null>(null);
  const toastAnim = useRef(new Animated.Value(0)).current;
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, type: ToastType = "error") => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    const id = Date.now();
    setToast({ message, type, id });
    toastAnim.setValue(0);
    Animated.spring(toastAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 80,
      friction: 8,
    }).start();
    toastTimerRef.current = setTimeout(() => dismissToast(), 4500);
  }, []);

  const dismissToast = useCallback(() => {
    Animated.timing(toastAnim, {
      toValue: 0,
      duration: 250,
      useNativeDriver: true,
    }).start(() => setToast(null));
  }, []);

  // Navigation tab: 'journal' | 'weight' | 'goals'
  const [activeTab, setActiveTab] = useState<"journal" | "weight" | "goals">("journal");

  // Auth states
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loadingAuth, setLoadingAuth] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  // Journal states
  const [source, setSource] = useState<"text" | "photo">("text");
  const [rawInput, setRawInput] = useState("");
  const [photoDataUrl, setPhotoDataUrl] = useState("");
  const [selectedDate, setSelectedDate] = useState(todayIso);
  const [submittingMeal, setSubmittingMeal] = useState(false);

  // Loaded database records
  const [meals, setMeals] = useState<Meal[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([]);
  const [waterSummary, setWaterSummary] = useState<WaterDailySummary | null>(null);

  // Theme state
  const [isDarkMode, setIsDarkMode] = useState(true);

  // Header controls states
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [currentCalDate, setCurrentCalDate] = useState(new Date());

  const colors = useMemo(() => {
    return {
      bg: isDarkMode ? "#09090b" : "#f4f4f5",
      card: isDarkMode ? "#18181b" : "#ffffff",
      border: isDarkMode ? "#27272a" : "#e4e4e7",
      text: isDarkMode ? "#fafafa" : "#18181b",
      textMuted: isDarkMode ? "#a1a1aa" : "#71717a",
      primary: "#a855f7",
      success: "#10b981",
      warning: "#f97316",
      water: "#3b82f6",
      navBg: isDarkMode ? "#18181b" : "#ffffff",
      inputBg: isDarkMode ? "#09090b" : "#e4e4e7",
    };
  }, [isDarkMode]);

  // Logging states
  const [submittingWeight, setSubmittingWeight] = useState(false);
  const [weightInput, setWeightInput] = useState("");
  const [weightSuccess, setWeightSuccess] = useState("");

  const [submittingWater, setSubmittingWater] = useState(false);

  // Goals Calculator states
  const [savingGoals, setSavingGoals] = useState(false);
  const [calcAge, setCalcAge] = useState("");
  const [calcWeight, setCalcWeight] = useState("");
  const [calcHeight, setCalcHeight] = useState("");
  const [calcGender, setCalcGender] = useState<"male" | "female">("male");
  const [calcActivity, setCalcActivity] = useState<"1.2" | "1.375" | "1.55" | "1.725" | "1.9">("1.2");
  const [calcGoal, setCalcGoal] = useState<"lose" | "maintain" | "gain">("lose");
  const [goalsSuccessMessage, setGoalsSuccessMessage] = useState("");

  // Edit / Delete entry state
  const [editingEntry, setEditingEntry] = useState<{
    type: "meal" | "exercise";
    id: string;
    calories: string;
    protein_g: string;
    carbs_g: string;
    fat_g: string;
    name: string;
    calories_burned: string;
  } | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  // Horizontal Date Strip (Last 7 days ending with selectedDate)
  const dateStrip = useMemo(() => {
    const [year, month, day] = selectedDate.split("-").map(Number);
    const arr = [];
    for (let i = 6; i >= 0; i--) {
      const dObj = new Date(year, month - 1, day - i);
      const iso = `${dObj.getFullYear()}-${String(dObj.getMonth() + 1).padStart(2, "0")}-${String(dObj.getDate()).padStart(2, "0")}`;
      arr.push({
        iso,
        dayNum: dObj.getDate(),
        dayName: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dObj.getDay()],
        isToday: iso === todayIso,
      });
    }
    return arr;
  }, [selectedDate]);

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
    void loadDashboard(session);
  }, [session, selectedDate]);

  async function loadDashboard(activeSession: Session) {
    setLoadingData(true);
    try {
      const dashboard = await getDashboard(activeSession, selectedDate);
      setMeals(dashboard.meals);
      setExercises(dashboard.exercises);
      setSummary(dashboard.summary);
      setProfile(dashboard.profile);
      setWeightLogs(dashboard.weight_history);
      setWaterSummary(dashboard.water);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed loading data");
    } finally {
      setLoadingData(false);
    }
  }

  // Auth Operations
  async function signIn() {
    setAuthError(null);
    setAuthMessage(null);
    setLoadingAuth(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) setAuthError(signInError.message);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Failed to sign in");
    } finally {
      setLoadingAuth(false);
    }
  }

  async function signUp() {
    setAuthError(null);
    setAuthMessage(null);
    setLoadingAuth(true);
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          // Redirect to the deployed app after email confirmation
          emailRedirectTo: "https://caltrack-bay.vercel.app",
        },
      });
      if (signUpError) {
        setAuthError(signUpError.message);
      } else {
        if (data.session) {
          setAuthMessage("Sign up successful! Logging you in...");
        } else {
          setAuthMessage("Check your email for a verification link. Tap it to confirm your account.");
        }
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : "Failed to sign up");
    } finally {
      setLoadingAuth(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setMeals([]);
    setSummary(null);
    setProfile(null);
    setWeightLogs([]);
    setWaterSummary(null);
    setAuthMessage(null);
    setAuthError(null);
  }

  async function resetDayLogs() {
    if (!session) return;
    Alert.alert(
      "Reset entries",
      `Are you sure you want to clear all meals, exercises, and water logs for ${selectedDate}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteDayEntries(session, selectedDate);
              setMeals([]);
              setExercises([]);
              setWaterSummary({ total_ml: 0, logs: [] });
              await loadDashboard(session);
              showToast("All entries cleared for this day.", "info");
            } catch (err) {
              showToast(err instanceof Error ? err.message : "Failed to clear logs");
            }
          },
        },
      ]
    );
  }

  // Choose photo for meal estimation from library
  async function choosePhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showToast("Photo library access was denied. Enable it in Settings to upload food photos.", "warning");
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

  // Take photo with camera for meal estimation
  async function takePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      showToast("Camera access was denied. Enable it in Settings to take photos.", "warning");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.6,
      base64: true,
    });
    if (!result.canceled && result.assets[0]?.base64) {
      setPhotoDataUrl(`data:image/jpeg;base64,${result.assets[0].base64}`);
    }
  }

  // Prompt choice between Camera & Library on native platforms
  async function selectPhotoSource() {
    if (Platform.OS === "web") {
      await choosePhoto();
      return;
    }

    Alert.alert(
      "Upload Food Photo",
      "Would you like to take a new photo with your camera or select one from your library?",
      [
        {
          text: "Take Photo (Camera)",
          onPress: () => void takePhoto(),
        },
        {
          text: "Choose from Library",
          onPress: () => void choosePhoto(),
        },
        {
          text: "Cancel",
          style: "cancel",
        },
      ]
    );
  }


  // Submit Entry Log (Meals/Exercises)
  async function submitMeal() {
    if (!session) return;
    setSubmittingMeal(true);
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
      await logEntry(session, payload);
      setRawInput("");
      setPhotoDataUrl("");
      await loadDashboard(session);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed logging entry");
    } finally {
      setSubmittingMeal(false);
    }
  }

  // Delete a single meal or exercise entry
  async function handleDeleteEntry(type: "meal" | "exercise", id: string) {
    if (!session) return;
    const doDelete = async () => {
      try {
        if (type === "meal") {
          await deleteMeal(session, id);
          setMeals((prev) => prev.filter((m) => m.id !== id));
        } else {
          await deleteExercise(session, id);
          setExercises((prev) => prev.filter((e) => e.id !== id));
        }
      } catch (err) {
        showToast(err instanceof Error ? err.message : "Failed to delete entry");
      }
    };
    // Alert.alert doesn't work on web — use window.confirm instead
    if (Platform.OS === "web") {
      if (window.confirm(`Delete this ${type}? This cannot be undone.`)) {
        await doDelete();
      }
    } else {
      Alert.alert(`Delete ${type}?`, "This entry will be permanently removed.", [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: doDelete },
      ]);
    }
  }

  // Save edits to a meal or exercise
  async function handleSaveEdit() {
    if (!session || !editingEntry) return;
    setSavingEdit(true);
    try {
      if (editingEntry.type === "meal") {
        const updated = await patchMeal(session, editingEntry.id, {
          calories: Number(editingEntry.calories) || undefined,
          protein_g: Number(editingEntry.protein_g) || undefined,
          carbs_g: Number(editingEntry.carbs_g) || undefined,
          fat_g: Number(editingEntry.fat_g) || undefined,
        });
        setMeals((prev) => prev.map((m) => (m.id === editingEntry.id ? updated : m)));
      } else {
        const updated = await patchExercise(session, editingEntry.id, {
          name: editingEntry.name || undefined,
          calories_burned: Number(editingEntry.calories_burned) || undefined,
        });
        setExercises((prev) => prev.map((e) => (e.id === editingEntry.id ? updated : e)));
      }
      setEditingEntry(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to save changes");
    } finally {
      setSavingEdit(false);
    }
  }

  // Weight Operations
  async function submitWeight() {
    if (!session || !weightInput) return;
    setSubmittingWeight(true);
    setWeightSuccess("");
    try {
      const newWeightLog = await logWeight(session, Number(weightInput));
      setWeightInput("");
      setWeightSuccess("Weight logged successfully!");
      setWeightLogs((prev) => [newWeightLog, ...prev]);
      setTimeout(() => setWeightSuccess(""), 3000);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to log weight");
    } finally {
      setSubmittingWeight(false);
    }
  }

  // Water Stepper Operations
  async function adjustWater(increment: boolean) {
    if (!session) return;
    setSubmittingWater(true);
    try {
      // 250ml = 1 cup. Decrement adds -250ml to total database entries
      const amount = increment ? 250 : -250;
      // Prevent negative total local visual glitches
      if (!increment && waterSummary && waterSummary.total_ml <= 0) {
        setSubmittingWater(false);
        return;
      }
      const newLog = await logWater(session, amount);
      setWaterSummary((prev) => {
        if (!prev) return { total_ml: Math.max(0, amount), logs: [newLog] };
        return {
          total_ml: Math.max(0, prev.total_ml + amount),
          logs: amount > 0 ? [newLog, ...prev.logs] : prev.logs.slice(1),
        };
      });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to update water");
    } finally {
      setSubmittingWater(false);
    }
  }

  // Goals Calculator Logic
  function calculateAndSaveGoals() {
    if (!session) return;
    const w = Number(calcWeight);
    const h = Number(calcHeight);
    const a = Number(calcAge);
    if (!w || !h || !a) {
      showToast("Please fill out all calculator fields.", "warning");
      return;
    }

    setSavingGoals(true);

    // Mifflin-St Jeor Equation
    let bmr = 10 * w + 6.25 * h - 5 * a;
    if (calcGender === "male") {
      bmr += 5;
    } else {
      bmr -= 161;
    }

    const activityFactors = {
      "1.2": 1.2,
      "1.375": 1.375,
      "1.55": 1.55,
      "1.725": 1.725,
      "1.9": 1.9,
    };
    const activityFactor = activityFactors[calcActivity];
    let tdee = bmr * activityFactor;

    // Adjust for Goal
    if (calcGoal === "lose") {
      tdee -= 500;
    } else if (calcGoal === "gain") {
      tdee += 500;
    }

    const targetCal = Math.round(tdee);
    // Protein target: 1.8g per kg bodyweight
    const targetProt = Math.round(w * 1.8);

    patchGoals(session, {
      daily_calorie_goal: targetCal,
      daily_protein_goal_g: targetProt,
    })
      .then((updated) => {
        setProfile(updated);
        setGoalsSuccessMessage(`Goals updated: ${targetCal} kcal & ${targetProt}g protein!`);
        setTimeout(() => setGoalsSuccessMessage(""), 5000);
      })
      .catch((err) => {
        showToast(err instanceof Error ? err.message : "Failed saving calculated goals");
      })
      .finally(() => {
        setSavingGoals(false);
      });
  }

  // Daily Summary Math
  const dailyCalories = useMemo(() => meals.reduce((acc, m) => acc + m.calories, 0), [meals]);
  const dailyExerciseCalories = useMemo(() => exercises.reduce((acc, e) => acc + e.calories_burned, 0), [exercises]);
  const dailyProtein = useMemo(() => meals.reduce((acc, m) => acc + Number(m.protein_g), 0), [meals]);
  const dailyCarbs = useMemo(() => meals.reduce((acc, m) => acc + Number(m.carbs_g), 0), [meals]);
  const dailyFat = useMemo(() => meals.reduce((acc, m) => acc + Number(m.fat_g), 0), [meals]);

  // Micros
  const dailySugar = useMemo(() => meals.reduce((acc, m) => acc + Number(m.sugar_g || 0), 0), [meals]);
  const dailyFiber = useMemo(() => meals.reduce((acc, m) => acc + Number(m.fiber_g || 0), 0), [meals]);
  const dailySodium = useMemo(() => meals.reduce((acc, m) => acc + Number(m.sodium_mg || 0), 0), [meals]);

  const calorieGoal = profile?.daily_calorie_goal ?? 2000;
  const proteinGoal = profile?.daily_protein_goal_g ?? 100;
  const carbsGoal = Math.round(calorieGoal * 0.5 / 4); // 50% calories, 4 cal/g
  const fatGoal = Math.round(calorieGoal * 0.25 / 9); // 25% calories, 9 cal/g

  const remainingCalories = calorieGoal - dailyCalories + dailyExerciseCalories;

  // Chronological timeline of meals and exercises
  const timelineEntries = useMemo(() => {
    const entries = [
      ...meals.map((m) => ({ ...m, timelineType: "meal" as const })),
      ...exercises.map((e) => ({ ...e, timelineType: "exercise" as const })),
    ];
    return entries.sort(
      (a, b) => new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime()
    );
  }, [meals, exercises]);

  const currentWaterCups = waterSummary ? Math.max(0, Math.round(waterSummary.total_ml / 250)) : 0;
  const waterGoalCups = 8; // 2L Target
  const remainingWaterCups = Math.max(0, waterGoalCups - currentWaterCups);

  if (loadingSession) {
    return (
      <SafeAreaView style={[styles.centerLoading, { backgroundColor: colors.bg }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  // Auth screen (Redesigned to dark/light theme)
  if (!session) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
        <View style={[styles.authContainer, { backgroundColor: colors.bg }]}>
          {/* Brand */}
          <View style={{ alignItems: "center", gap: 6, marginBottom: 8 }}>
            <Text style={[styles.authTitle, { color: colors.text }]}>CalTrack</Text>
            <Text style={[styles.authSubtitle, { color: colors.textMuted }]}>AI-powered nutrition tracking</Text>
          </View>

          {/* Auth feedback banners */}
          {authMessage ? (
            <View style={[styles.authAlertBox, { backgroundColor: isDarkMode ? "#052e16" : "#f0fdf4", borderColor: "#16a34a" }]}>
              <Text style={{ fontSize: 13, color: "#16a34a", fontWeight: "600", textAlign: "center" }}>✓ {authMessage}</Text>
            </View>
          ) : null}
          {authError ? (
            <View style={[styles.authAlertBox, { backgroundColor: isDarkMode ? "#450a0a" : "#fef2f2", borderColor: "#ef4444" }]}>
              <Text style={{ fontSize: 13, color: "#ef4444", fontWeight: "600", textAlign: "center" }}>⚠ {authError}</Text>
            </View>
          ) : null}

          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Email Address"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            style={[styles.darkInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg }]}
            editable={!loadingAuth}
          />
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            style={[styles.darkInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg }]}
            editable={!loadingAuth}
          />

          {/* Email/password buttons */}
          <View style={styles.authButtonGroup}>
            <Pressable
              style={[styles.primaryButton, loadingAuth && styles.disabledButton, { backgroundColor: colors.primary }]}
              onPress={signIn}
              disabled={loadingAuth}
            >
              <Text style={styles.buttonText}>{loadingAuth ? "Signing In..." : "Sign In"}</Text>
            </Pressable>
            <Pressable
              style={[styles.secondaryButton, loadingAuth && styles.disabledButton, { backgroundColor: isDarkMode ? "#27272a" : "#e4e4e7" }]}
              onPress={signUp}
              disabled={loadingAuth}
            >
              <Text style={[styles.buttonText, { color: colors.text }]}>{loadingAuth ? "Signing Up..." : "Sign Up"}</Text>
            </Pressable>
          </View>
        </View>
        <StatusBar style={isDarkMode ? "light" : "dark"} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      <StatusBar style={isDarkMode ? "light" : "dark"} />
      {/* Premium Header Bar */}
      <View style={[styles.header, { backgroundColor: colors.bg, borderBottomColor: colors.border }]}>
        <View style={styles.headerLeft}>
          <Pressable onPress={() => setIsDrawerOpen(true)} style={{ padding: 4, marginRight: 6 }}>
            <Ionicons name="menu" size={26} color={colors.text} />
          </Pressable>
          <Pressable
            onPress={() => {
              const [y, m, d] = selectedDate.split("-").map(Number);
              setCurrentCalDate(new Date(y, m - 1, 1));
              setIsCalendarOpen(true);
            }}
            style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 4 }}
          >
            <Text style={[styles.headerTitle, { color: colors.text }]}>
              {selectedDate === todayIso ? "Today" : selectedDate}
            </Text>
            <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
          </Pressable>
        </View>
        <View style={styles.headerRight}>
          <View style={[styles.streakContainer, { backgroundColor: isDarkMode ? "#27272a" : "#e4e4e7" }]}>
            <Ionicons name="flash" size={14} color="#f97316" />
            <Text style={[styles.streakText, { color: colors.text }]}>1</Text>
          </View>
          <Pressable
            style={[styles.signOutButton, { backgroundColor: isDarkMode ? "#27272a" : "#e4e4e7" }]}
            onPress={() => setIsDarkMode(!isDarkMode)}
          >
            <Ionicons name={isDarkMode ? "sunny" : "moon"} size={16} color={colors.text} />
          </Pressable>
        </View>
      </View>

      {/* Main Container */}
      <View style={[styles.flexOne, { backgroundColor: colors.bg }]}>
        {activeTab === "journal" && (
          <View style={[styles.flexOne, { backgroundColor: colors.bg }]}>
            <ScrollView style={styles.flexOne} contentContainerStyle={styles.scrollContent}>
              {/* Date Selection Strip */}
              <View style={[styles.dateStripContainer, { backgroundColor: colors.navBg, borderColor: colors.border }]}>
                {dateStrip.map((item) => {
                  const isSelected = selectedDate === item.iso;
                  return (
                    <Pressable
                      key={item.iso}
                      onPress={() => setSelectedDate(item.iso)}
                      style={[
                        styles.dateCard,
                        isSelected ? { backgroundColor: colors.success } : null,
                      ]}
                    >
                      <Text style={[styles.dateDayName, { color: isSelected ? "#ffffff" : colors.textMuted }]}>
                        {item.dayName}
                      </Text>
                      <Text style={[styles.dateDayNum, { color: isSelected ? "#ffffff" : colors.text }]}>
                        {item.dayNum}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Calories + Macros Display Cards (Journable-style Dual Columns) */}
              <View style={styles.summaryRow}>
                {/* Calories Card */}
                <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.cardHeaderRow}>
                    <Ionicons name="flame" size={16} color="#f97316" />
                    <Text style={[styles.cardHeaderTitle, { color: colors.textMuted }]}>Calories</Text>
                  </View>
                  <View style={styles.caloriesSplitRow}>
                    <View style={styles.calorieColumn}>
                      <Text style={[styles.calorieValueText, { color: colors.text }]}>{dailyCalories}</Text>
                      <Text style={[styles.calorieLabelText, { color: colors.textMuted }]}>Food</Text>
                    </View>
                    <View style={styles.calorieColumn}>
                      <Text style={[styles.calorieValueText, { color: colors.text }]}>{dailyExerciseCalories}</Text>
                      <Text style={[styles.calorieLabelText, { color: colors.textMuted }]}>Exercise</Text>
                    </View>
                    <View style={styles.calorieColumn}>
                      <Text style={[styles.calorieValueText, { color: colors.warning }]}>
                        {remainingCalories}
                      </Text>
                      <Text style={[styles.calorieLabelText, { color: colors.textMuted }]}>Remaining</Text>
                    </View>
                  </View>
                </View>

                {/* Macros Card */}
                <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={styles.cardHeaderRow}>
                    <MaterialCommunityIcons name="nutrition" size={16} color={colors.primary} />
                    <Text style={[styles.cardHeaderTitle, { color: colors.textMuted }]}>Macros</Text>
                  </View>
                  <View style={styles.macrosList}>
                    <View style={styles.macroItemRow}>
                      <Text style={[styles.macroLabel, { color: colors.textMuted }]}>Carbs</Text>
                      <Text style={[styles.macroValue, { color: colors.text }]}>
                        {Math.round(dailyCarbs)}/{carbsGoal}g
                      </Text>
                    </View>
                    <View style={styles.macroItemRow}>
                      <Text style={[styles.macroLabel, { color: colors.textMuted }]}>Protein</Text>
                      <Text style={[styles.macroValue, { color: colors.text }]}>
                        {Math.round(dailyProtein)}/{proteinGoal}g
                      </Text>
                    </View>
                    <View style={styles.macroItemRow}>
                      <Text style={[styles.macroLabel, { color: colors.textMuted }]}>Fat</Text>
                      <Text style={[styles.macroValue, { color: colors.text }]}>
                        {Math.round(dailyFat)}/{fatGoal}g
                      </Text>
                    </View>
                  </View>
                </View>
              </View>

              {/* Stepper-based Water Tracker Card */}
              <View style={[styles.glassCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.waterCardHeader}>
                  <Ionicons name="water" size={18} color={colors.water} />
                  <Text style={[styles.waterCardTitle, { color: colors.water }]}>Water: {((waterSummary?.total_ml ?? 0) / 1000).toFixed(2)}L</Text>
                </View>
                <View style={[styles.waterStepperRow, { backgroundColor: isDarkMode ? "#27272a" : "#e4e4e7" }]}>
                  <Pressable
                    style={[styles.stepperButton, submittingWater && styles.disabledButton, { backgroundColor: isDarkMode ? "#3f3f46" : "#d4d4d8" }]}
                    onPress={() => adjustWater(false)}
                    disabled={submittingWater}
                  >
                    <Text style={[styles.stepperButtonText, { color: colors.text }]}>−</Text>
                  </Pressable>
                  <View style={styles.waterDisplayColumn}>
                    <Text style={[styles.waterCupsText, { color: colors.text }]}>{currentWaterCups} Cups</Text>
                    <Text style={[styles.waterGoalLabel, { color: colors.textMuted }]}>
                      {remainingWaterCups > 0 ? `${remainingWaterCups} Cups Remaining` : "Goal Achieved! 🎉"}
                    </Text>
                  </View>
                  <Pressable
                    style={[styles.stepperButton, submittingWater && styles.disabledButton, { backgroundColor: isDarkMode ? "#3f3f46" : "#d4d4d8" }]}
                    onPress={() => adjustWater(true)}
                    disabled={submittingWater}
                  >
                    <Text style={[styles.stepperButtonText, { color: colors.text }]}>+</Text>
                  </Pressable>
                </View>
              </View>

              {/* Daily Entries Logs List */}
              <View style={[styles.glassCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>Logged timeline</Text>
                {timelineEntries.map((entry) => {
                  if (entry.timelineType === "meal") {
                    return (
                      <View key={entry.id} style={[styles.mealRowContainer, { borderBottomColor: colors.border }]}>
                        <View style={styles.mealRowHeader}>
                          <Text style={[styles.mealCaloriesText, { color: colors.warning }]}>{entry.calories} kcal</Text>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                            <Text style={[styles.mealTimeText, { color: colors.textMuted }]}>
                              {new Date(entry.logged_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </Text>
                            <Pressable
                              hitSlop={8}
                              style={{ padding: 4 }}
                              onPress={() => {
                                setEditingEntry({
                                  type: "meal",
                                  id: entry.id,
                                  calories: String(entry.calories),
                                  protein_g: String(Math.round(Number(entry.protein_g))),
                                  carbs_g: String(Math.round(Number(entry.carbs_g))),
                                  fat_g: String(Math.round(Number(entry.fat_g))),
                                  name: "",
                                  calories_burned: "",
                                });
                              }}
                            >
                              <Ionicons name="pencil" size={14} color={colors.primary} />
                            </Pressable>
                            <Pressable
                              hitSlop={8}
                              style={{ padding: 4 }}
                              onPress={() => handleDeleteEntry("meal", entry.id)}
                            >
                              <Ionicons name="trash-outline" size={14} color="#ef4444" />
                            </Pressable>
                          </View>
                        </View>
                        {/* Detailed macros & micros breakdown */}
                        <View style={styles.mealDetailsRow}>
                          <Text style={[styles.detailPill, { backgroundColor: isDarkMode ? "#27272a" : "#e4e4e7", color: colors.text }]}>C {Math.round(entry.carbs_g)}g</Text>
                          <Text style={[styles.detailPill, { backgroundColor: isDarkMode ? "#27272a" : "#e4e4e7", color: colors.text }]}>P {Math.round(entry.protein_g)}g</Text>
                          <Text style={[styles.detailPill, { backgroundColor: isDarkMode ? "#27272a" : "#e4e4e7", color: colors.text }]}>F {Math.round(entry.fat_g)}g</Text>
                        </View>
                        <View style={styles.mealDetailsRow}>
                          <Text style={[styles.microPill, { borderColor: colors.border, backgroundColor: colors.card, color: colors.textMuted }]}>Sugar {Math.round(entry.sugar_g || 0)}g</Text>
                          <Text style={[styles.microPill, { borderColor: colors.border, backgroundColor: colors.card, color: colors.textMuted }]}>Fiber {Math.round(entry.fiber_g || 0)}g</Text>
                          <Text style={[styles.microPill, { borderColor: colors.border, backgroundColor: colors.card, color: colors.textMuted }]}>Sodium {Math.round(entry.sodium_mg || 0)}mg</Text>
                        </View>
                        <View style={styles.foodItemsContainer}>
                          {entry.food_items.map((item, idx) => (
                            <Text key={idx} style={[styles.foodItemText, { color: isDarkMode ? "#d4d4d8" : "#27272a" }]}>
                              • {item.qty ? `${item.qty} ` : ""}{item.name} ({item.calories} kcal)
                            </Text>
                          ))}
                        </View>
                      </View>
                    );
                  } else {
                    return (
                      <View key={entry.id} style={[styles.mealRowContainer, { borderBottomColor: colors.border }]}>
                        <View style={styles.mealRowHeader}>
                          <Text style={[styles.mealCaloriesText, { color: colors.success }]}>-{entry.calories_burned} kcal</Text>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                            <Text style={[styles.mealTimeText, { color: colors.textMuted }]}>
                              {new Date(entry.logged_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </Text>
                            <Pressable
                              hitSlop={8}
                              style={{ padding: 4 }}
                              onPress={() => {
                                setEditingEntry({
                                  type: "exercise",
                                  id: entry.id,
                                  calories: "",
                                  protein_g: "",
                                  carbs_g: "",
                                  fat_g: "",
                                  name: entry.name,
                                  calories_burned: String(entry.calories_burned),
                                });
                              }}
                            >
                              <Ionicons name="pencil" size={14} color={colors.primary} />
                            </Pressable>
                            <Pressable
                              hitSlop={8}
                              style={{ padding: 4 }}
                              onPress={() => handleDeleteEntry("exercise", entry.id)}
                            >
                              <Ionicons name="trash-outline" size={14} color="#ef4444" />
                            </Pressable>
                          </View>
                        </View>
                        <View style={styles.mealDetailsRow}>
                          <View style={[styles.detailPill, { backgroundColor: isDarkMode ? "#065f46" : "#d1fae5", flexDirection: "row", alignItems: "center" }]}>
                            <Ionicons name="fitness" size={12} color={isDarkMode ? "#10b981" : "#065f46"} style={{ marginRight: 4 }} />
                            <Text style={{ color: isDarkMode ? "#10b981" : "#065f46", fontSize: 11, fontWeight: "700" }}>Exercise</Text>
                          </View>
                        </View>
                        <View style={styles.foodItemsContainer}>
                          <Text style={[styles.foodItemText, { fontWeight: "700", color: colors.text }]}>{entry.name}</Text>
                        </View>
                      </View>
                    );
                  }
                })}
                {timelineEntries.length === 0 ? (
                  <Text style={[styles.helperText, { color: colors.textMuted }]}>No entries logged for this day.</Text>
                ) : null}
              </View>
            </ScrollView>

            {/* Log Entry Form Card - Fixed at the bottom (Compact Chat-style Layout) */}
            <View style={[styles.glassCard, styles.bottomFixedForm, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.inputRow}>
                <Pressable
                  style={[styles.compactSourceToggle, { backgroundColor: isDarkMode ? "#27272a" : "#e4e4e7" }]}
                  onPress={() => {
                    setSource(source === "text" ? "photo" : "text");
                    setPhotoDataUrl("");
                  }}
                >
                  <Ionicons name={source === "text" ? "camera-outline" : "text-outline"} size={20} color={colors.primary} />
                </Pressable>

                {source === "photo" && (
                  <Pressable
                    onPress={selectPhotoSource}
                    style={[
                      styles.compactIconButton,
                      { backgroundColor: photoDataUrl ? "#065f46" : (isDarkMode ? "#27272a" : "#e4e4e7") },
                    ]}
                  >
                    <Ionicons name="image" size={18} color={photoDataUrl ? "#10b981" : colors.textMuted} />
                  </Pressable>
                )}

                <TextInput
                  value={rawInput}
                  onChangeText={setRawInput}
                  placeholder={source === "text" ? "Eat or do? (eggs, ran 5k...)" : "Describe photo (optional)..."}
                  placeholderTextColor={colors.textMuted}
                  style={[
                    styles.compactInput,
                    {
                      color: colors.text,
                      borderColor: colors.border,
                      backgroundColor: colors.inputBg,
                    },
                  ]}
                  editable={!submittingMeal}
                />

                <Pressable
                  style={[
                    styles.compactSubmitButton,
                    { backgroundColor: colors.primary },
                    (submittingMeal || (!rawInput.trim() && !photoDataUrl)) && styles.disabledButton,
                  ]}
                  onPress={submitMeal}
                  disabled={submittingMeal || (!rawInput.trim() && !photoDataUrl)}
                >
                  {submittingMeal ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="send" size={14} color="#fff" />
                  )}
                </Pressable>
              </View>
              {source === "photo" && photoDataUrl ? (
                <Text style={[styles.helperText, { color: colors.success, paddingVertical: 0, marginTop: -4, fontSize: 11, textAlign: "left" }]}>
                  ✓ Photo attached and ready
                </Text>
              ) : null}
            </View>
          </View>
        )}

        {/* Tab 2: Weight Logs Screen */}
        {activeTab === "weight" && (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            {/* Input Weight Card */}
            <View style={[styles.glassCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Log weight</Text>
              <View style={styles.weightInputRow}>
                <TextInput
                  value={weightInput}
                  onChangeText={setWeightInput}
                  placeholder="e.g. 78.5"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numeric"
                  style={[styles.darkInput, styles.flexOne, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg }]}
                  editable={!submittingWeight}
                />
                <Text style={[styles.kgLabel, { color: colors.text }]}>kg</Text>
                <Pressable
                  style={[styles.weightSubmitButton, { backgroundColor: colors.primary }, submittingWeight && styles.disabledButton]}
                  onPress={submitWeight}
                  disabled={submittingWeight || !weightInput}
                >
                  <Text style={styles.buttonText}>{submittingWeight ? "Saving..." : "Log"}</Text>
                </Pressable>
              </View>
              {weightSuccess ? <Text style={[styles.successText, { color: colors.success }]}>{weightSuccess}</Text> : null}
            </View>

            {/* Weight Logs History List */}
            <View style={[styles.glassCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Weight logs history</Text>
              {weightLogs.map((log) => (
                <View key={log.id} style={[styles.weightHistoryRow, { borderBottomColor: colors.border }]}>
                  <Text style={[styles.weightValueText, { color: colors.text }]}>{log.weight_kg} kg</Text>
                  <Text style={[styles.weightDateText, { color: colors.textMuted }]}>
                    {new Date(log.logged_at).toLocaleDateString([], {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                </View>
              ))}
              {weightLogs.length === 0 ? (
                <Text style={[styles.helperText, { color: colors.textMuted }]}>No weight entries logged yet.</Text>
              ) : null}
            </View>
          </ScrollView>
        )}

        {/* Tab 3: Goals Calculator Screen */}
        {activeTab === "goals" && (
          <ScrollView contentContainerStyle={styles.scrollContent}>
            {/* Goals Calculator Form Card */}
            <View style={[styles.glassCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Daily targets calculator</Text>
              <Text style={[styles.calculatorSubtitle, { color: colors.textMuted }]}>
                Calculate your goals using the Mifflin-St Jeor formula.
              </Text>

              <View style={styles.calcFieldRow}>
                <View style={styles.calcFieldColumn}>
                  <Text style={[styles.calcFieldLabel, { color: colors.textMuted }]}>Age (years)</Text>
                  <TextInput
                    value={calcAge}
                    onChangeText={setCalcAge}
                    placeholder="25"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="numeric"
                    style={[styles.darkInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg }]}
                  />
                </View>
                <View style={styles.calcFieldColumn}>
                  <Text style={[styles.calcFieldLabel, { color: colors.textMuted }]}>Height (cm)</Text>
                  <TextInput
                    value={calcHeight}
                    onChangeText={setCalcHeight}
                    placeholder="175"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="numeric"
                    style={[styles.darkInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg }]}
                  />
                </View>
                <View style={styles.calcFieldColumn}>
                  <Text style={[styles.calcFieldLabel, { color: colors.textMuted }]}>Weight (kg)</Text>
                  <TextInput
                    value={calcWeight}
                    onChangeText={setCalcWeight}
                    placeholder="70"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="numeric"
                    style={[styles.darkInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.inputBg }]}
                  />
                </View>
              </View>

              <Text style={[styles.calcFieldLabel, { color: colors.textMuted }]}>Gender</Text>
              <View style={styles.selectorGroupRow}>
                <Pressable
                  style={[styles.selectorGroupButton, { backgroundColor: isDarkMode ? "#27272a" : "#e4e4e7" }, calcGender === "male" && { backgroundColor: colors.primary }]}
                  onPress={() => setCalcGender("male")}
                >
                  <Text style={[styles.buttonText, { color: calcGender === "male" ? "#ffffff" : colors.text }]}>Male</Text>
                </Pressable>
                <Pressable
                  style={[styles.selectorGroupButton, { backgroundColor: isDarkMode ? "#27272a" : "#e4e4e7" }, calcGender === "female" && { backgroundColor: colors.primary }]}
                  onPress={() => setCalcGender("female")}
                >
                  <Text style={[styles.buttonText, { color: calcGender === "female" ? "#ffffff" : colors.text }]}>Female</Text>
                </Pressable>
              </View>

              <Text style={[styles.calcFieldLabel, { color: colors.textMuted }]}>Activity Level</Text>
              <View style={styles.calcDropdownContainer}>
                {[
                  { value: "1.2", label: "Sedentary (desk job)" },
                  { value: "1.375", label: "Light (exercise 1-2 days/wk)" },
                  { value: "1.55", label: "Moderate (exercise 3-5 days/wk)" },
                  { value: "1.725", label: "Active (exercise 6-7 days/wk)" },
                ].map((item) => (
                  <Pressable
                    key={item.value}
                    style={[
                      styles.dropdownItem,
                      { backgroundColor: colors.card, borderColor: colors.border },
                      calcActivity === item.value && { borderColor: colors.primary, backgroundColor: isDarkMode ? "#27272a" : "#e4e4e7" },
                    ]}
                    onPress={() => setCalcActivity(item.value as any)}
                  >
                    <Text style={[styles.dropdownItemText, { color: colors.text }]}>{item.label}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={[styles.calcFieldLabel, { color: colors.textMuted }]}>Weight Goal</Text>
              <View style={styles.selectorGroupRow}>
                {[
                  { value: "lose", label: "Lose Weight" },
                  { value: "maintain", label: "Maintain" },
                  { value: "gain", label: "Gain Weight" },
                ].map((item) => (
                  <Pressable
                    key={item.value}
                    style={[
                      styles.selectorGroupButton,
                      { backgroundColor: isDarkMode ? "#27272a" : "#e4e4e7" },
                      calcGoal === item.value && { backgroundColor: colors.primary },
                    ]}
                    onPress={() => setCalcGoal(item.value as any)}
                  >
                    <Text style={[styles.buttonText, { color: calcGoal === item.value ? "#ffffff" : colors.text }]}>{item.label}</Text>
                  </Pressable>
                ))}
              </View>

              <Pressable
                style={[styles.submitButton, { backgroundColor: colors.primary }, savingGoals && styles.disabledButton]}
                onPress={calculateAndSaveGoals}
                disabled={savingGoals}
              >
                <Text style={styles.buttonText}>
                  {savingGoals ? "Calculating..." : "Calculate & Save Goals"}
                </Text>
              </Pressable>

              {goalsSuccessMessage ? (
                <Text style={[styles.successText, { color: colors.success }]}>{goalsSuccessMessage}</Text>
              ) : null}
            </View>

            {/* Current Targets Status Card */}
            <View style={[styles.glassCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Active targets</Text>
              {profile ? (
                <View style={[styles.activeGoalContainer, { backgroundColor: colors.bg, borderColor: colors.border }]}>
                  <Text style={[styles.activeGoalLabel, { color: colors.textMuted }]}>Daily Calorie Target</Text>
                  <Text style={[styles.activeGoalValue, { color: colors.primary }]}>{profile.daily_calorie_goal} kcal</Text>
                  <Text style={[styles.activeGoalLabel, { color: colors.textMuted }]}>Daily Protein Target</Text>
                  <Text style={[styles.activeGoalValue, { color: colors.primary }]}>{profile.daily_protein_goal_g}g</Text>
                </View>
              ) : (
                <ActivityIndicator color={colors.primary} />
              )}
            </View>
          </ScrollView>
        )}
      </View>

      {/* ── Animated Toast Notification ─────────────────────────────────── */}
      {toast && (
        <Animated.View
          style={[
            styles.toastContainer,
            {
              opacity: toastAnim,
              transform: [
                {
                  translateY: toastAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-20, 0],
                  }),
                },
              ],
              backgroundColor:
                toast.type === "error" ? "#ef4444" :
                toast.type === "warning" ? "#f97316" :
                "#10b981",
            },
          ]}
        >
          <Text style={styles.toastMessage} numberOfLines={3}>{toast.message}</Text>
          <Pressable onPress={dismissToast} hitSlop={10} style={styles.toastClose}>
            <Text style={styles.toastCloseText}>✕</Text>
          </Pressable>
        </Animated.View>
      )}

      {/* Premium Dark/Light Nav Tab bar */}
      <View style={[styles.navBar, { backgroundColor: colors.navBg, borderTopColor: colors.border }]}>
        <Pressable
          style={[styles.navTab, activeTab === "journal" && { backgroundColor: isDarkMode ? "#09090b" : "#f4f4f5" }]}
          onPress={() => setActiveTab("journal")}
        >
          <Ionicons name="book" size={20} color={activeTab === "journal" ? colors.primary : colors.textMuted} />
          <Text style={[styles.navTabText, { color: activeTab === "journal" ? colors.primary : colors.textMuted }]}>
            Journal
          </Text>
        </Pressable>
        <Pressable
          style={[styles.navTab, activeTab === "weight" && { backgroundColor: isDarkMode ? "#09090b" : "#f4f4f5" }]}
          onPress={() => setActiveTab("weight")}
        >
          <MaterialCommunityIcons name="scale-bathroom" size={20} color={activeTab === "weight" ? colors.primary : colors.textMuted} />
          <Text style={[styles.navTabText, { color: activeTab === "weight" ? colors.primary : colors.textMuted }]}>
            Weight
          </Text>
        </Pressable>
        <Pressable
          style={[styles.navTab, activeTab === "goals" && { backgroundColor: isDarkMode ? "#09090b" : "#f4f4f5" }]}
          onPress={() => setActiveTab("goals")}
        >
          <Ionicons name="calculator" size={20} color={activeTab === "goals" ? colors.primary : colors.textMuted} />
          <Text style={[styles.navTabText, { color: activeTab === "goals" ? colors.primary : colors.textMuted }]}>
            Goals
          </Text>
        </Pressable>
      </View>

      {/* Side Navigation Drawer Modal */}
      <Modal
        visible={isDrawerOpen}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsDrawerOpen(false)}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: "rgba(0, 0, 0, 0.6)",
          }}
          onPress={() => setIsDrawerOpen(false)}
        >
          <Pressable
            style={{
              width: "78%",
              height: "100%",
              backgroundColor: colors.card,
              borderRightWidth: 1,
              borderRightColor: colors.border,
              padding: 20,
              paddingTop: 50,
              gap: 20,
            }}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View>
                <Text style={{ fontSize: 22, fontWeight: "800", color: colors.text }}>CalTrack Menu</Text>
                <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>{session.user?.email}</Text>
              </View>
              <Pressable onPress={() => setIsDrawerOpen(false)} style={{ padding: 4 }}>
                <Ionicons name="close" size={24} color={colors.text} />
              </Pressable>
            </View>

            {/* Active Targets Stats Card */}
            <View style={{ backgroundColor: colors.bg, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.border, gap: 10 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.text }}>Active Targets</Text>
                <Pressable onPress={() => { setIsDrawerOpen(false); setActiveTab("goals"); }}>
                  <Ionicons name="create-outline" size={16} color={colors.primary} />
                </Pressable>
              </View>
              <View style={{ flexDirection: "row", gap: 16 }}>
                <View>
                  <Text style={{ fontSize: 10, color: colors.textMuted }}>Calories</Text>
                  <Text style={{ fontSize: 15, fontWeight: "700", color: colors.primary }}>{calorieGoal} kcal</Text>
                </View>
                <View>
                  <Text style={{ fontSize: 10, color: colors.textMuted }}>Protein</Text>
                  <Text style={{ fontSize: 15, fontWeight: "700", color: colors.primary }}>{proteinGoal}g</Text>
                </View>
              </View>
            </View>

            {/* Settings & Actions List */}
            <View style={{ gap: 8, flex: 1 }}>
              {/* Theme Toggle option */}
              <Pressable
                onPress={() => setIsDarkMode(!isDarkMode)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingVertical: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Ionicons name={isDarkMode ? "sunny-outline" : "moon-outline"} size={20} color={colors.text} />
                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.text }}>Theme Mode</Text>
                </View>
                <Text style={{ fontSize: 12, color: colors.textMuted }}>{isDarkMode ? "Dark" : "Light"}</Text>
              </Pressable>

              {/* Reset Day Logs Option */}
              <Pressable
                onPress={() => {
                  setIsDrawerOpen(false);
                  resetDayLogs();
                }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  paddingVertical: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                }}
              >
                <Ionicons name="trash-outline" size={20} color="#ef4444" />
                <Text style={{ fontSize: 14, fontWeight: "600", color: "#ef4444" }}>Reset Today's Logs</Text>
              </Pressable>
            </View>

            {/* Sign Out Option at bottom */}
            <Pressable
              onPress={() => {
                setIsDrawerOpen(false);
                signOut();
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                paddingVertical: 14,
                backgroundColor: isDarkMode ? "#27272a" : "#e4e4e7",
                borderRadius: 10,
                justifyContent: "center",
                marginBottom: 10,
              }}
            >
              <Ionicons name="log-out-outline" size={18} color={colors.text} />
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.text }}>Sign Out</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Calendar Date Picker Modal */}
      <Modal
        visible={isCalendarOpen}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsCalendarOpen(false)}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: "rgba(0, 0, 0, 0.6)",
            justifyContent: "center",
            alignItems: "center",
            padding: 20,
          }}
          onPress={() => setIsCalendarOpen(false)}
        >
          <Pressable
            style={{
              width: "100%",
              maxWidth: 340,
              backgroundColor: colors.card,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 16,
              gap: 12,
            }}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Calendar Month Header */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Pressable
                onPress={() =>
                  setCurrentCalDate(new Date(currentCalDate.getFullYear(), currentCalDate.getMonth() - 1, 1))
                }
                style={{ padding: 8, backgroundColor: isDarkMode ? "#27272a" : "#e4e4e7", borderRadius: 8 }}
              >
                <Ionicons name="chevron-back" size={16} color={colors.text} />
              </Pressable>
              
              <Text style={{ fontSize: 16, fontWeight: "700", color: colors.text }}>
                {
                  [
                    "January", "February", "March", "April", "May", "June",
                    "July", "August", "September", "October", "November", "December"
                  ][currentCalDate.getMonth()]
                }{" "}
                {currentCalDate.getFullYear()}
              </Text>

              <Pressable
                onPress={() =>
                  setCurrentCalDate(new Date(currentCalDate.getFullYear(), currentCalDate.getMonth() + 1, 1))
                }
                style={{ padding: 8, backgroundColor: isDarkMode ? "#27272a" : "#e4e4e7", borderRadius: 8 }}
              >
                <Ionicons name="chevron-forward" size={16} color={colors.text} />
              </Pressable>
            </View>

            {/* Calendar Grid */}
            <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 4 }}>
              {/* Day Name Columns */}
              {["S", "M", "T", "W", "T", "F", "S"].map((dayName, idx) => (
                <View key={idx} style={{ width: "14.28%", alignItems: "center", paddingVertical: 6 }}>
                  <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "700" }}>{dayName}</Text>
                </View>
              ))}

              {/* Day cells */}
              {(() => {
                const year = currentCalDate.getFullYear();
                const month = currentCalDate.getMonth();
                const firstDayIndex = new Date(year, month, 1).getDay();
                const totalDays = new Date(year, month + 1, 0).getDate();
                const cells = [];
                
                // Prepend empty cells for alignment
                for (let i = 0; i < firstDayIndex; i++) {
                  cells.push({ key: `empty-${i}`, label: "", value: null });
                }

                // Append days of the month
                for (let day = 1; day <= totalDays; day++) {
                  const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                  cells.push({
                    key: `day-${day}`,
                    label: String(day),
                    value: dateStr,
                    isSelected: selectedDate === dateStr,
                    isToday: todayIso === dateStr,
                  });
                }

                return cells.map((cell) => {
                  const active = cell.isSelected;
                  return (
                    <Pressable
                      key={cell.key}
                      disabled={!cell.value}
                      onPress={() => {
                        if (cell.value) {
                          setSelectedDate(cell.value);
                          setIsCalendarOpen(false);
                        }
                      }}
                      style={[
                        {
                          width: "14.28%",
                          aspectRatio: 1,
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: 8,
                          marginVertical: 2,
                        },
                        active ? { backgroundColor: colors.primary } : null,
                        cell.isToday && !active ? { borderWidth: 1, borderColor: colors.primary } : null,
                      ]}
                    >
                      <Text
                        style={[
                          { fontSize: 13, fontWeight: "600", color: colors.text },
                          active ? { color: "#ffffff", fontWeight: "700" } : null,
                          !cell.value ? { color: "transparent" } : null,
                        ]}
                      >
                        {cell.label}
                      </Text>
                    </Pressable>
                  );
                });
              })()}
            </View>

            {/* Footer controls (Quick jump to today / Cancel) */}
            <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
              <Pressable
                onPress={() => {
                  setSelectedDate(todayIso);
                  setIsCalendarOpen(false);
                }}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  backgroundColor: isDarkMode ? "#27272a" : "#e4e4e7",
                  borderRadius: 10,
                  alignItems: "center",
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.text }}>Today</Text>
              </Pressable>
              
              <Pressable
                onPress={() => setIsCalendarOpen(false)}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  backgroundColor: colors.primary,
                  borderRadius: 10,
                  alignItems: "center",
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: "700", color: "#ffffff" }}>Close</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Edit Entry Modal */}
      <Modal
        visible={editingEntry !== null}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setEditingEntry(null)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}
          onPress={() => setEditingEntry(null)}
        >
          <Pressable
            style={{
              backgroundColor: colors.card,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              padding: 24,
              gap: 16,
              borderTopWidth: 1,
              borderTopColor: colors.border,
            }}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Handle bar */}
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginBottom: 4 }} />

            <Text style={{ fontSize: 18, fontWeight: "800", color: colors.text }}>
              Edit {editingEntry?.type === "meal" ? "Meal" : "Exercise"}
            </Text>

            {editingEntry?.type === "meal" ? (
              <>
                <View style={{ gap: 10 }}>
                  {[
                    { label: "Calories (kcal)", key: "calories" as const },
                    { label: "Protein (g)", key: "protein_g" as const },
                    { label: "Carbs (g)", key: "carbs_g" as const },
                    { label: "Fat (g)", key: "fat_g" as const },
                  ].map(({ label, key }) => (
                    <View key={key} style={{ gap: 4 }}>
                      <Text style={{ fontSize: 12, fontWeight: "600", color: colors.textMuted }}>{label}</Text>
                      <TextInput
                        value={editingEntry?.[key] ?? ""}
                        onChangeText={(v) => setEditingEntry((prev) => prev ? { ...prev, [key]: v } : null)}
                        keyboardType="numeric"
                        style={{
                          borderWidth: 1,
                          borderColor: colors.border,
                          borderRadius: 10,
                          paddingHorizontal: 14,
                          paddingVertical: 10,
                          fontSize: 15,
                          color: colors.text,
                          backgroundColor: colors.inputBg,
                        }}
                      />
                    </View>
                  ))}
                </View>
              </>
            ) : (
              <>
                <View style={{ gap: 10 }}>
                  <View style={{ gap: 4 }}>
                    <Text style={{ fontSize: 12, fontWeight: "600", color: colors.textMuted }}>Exercise Name</Text>
                    <TextInput
                      value={editingEntry?.name ?? ""}
                      onChangeText={(v) => setEditingEntry((prev) => prev ? { ...prev, name: v } : null)}
                      style={{
                        borderWidth: 1,
                        borderColor: colors.border,
                        borderRadius: 10,
                        paddingHorizontal: 14,
                        paddingVertical: 10,
                        fontSize: 15,
                        color: colors.text,
                        backgroundColor: colors.inputBg,
                      }}
                    />
                  </View>
                  <View style={{ gap: 4 }}>
                    <Text style={{ fontSize: 12, fontWeight: "600", color: colors.textMuted }}>Calories Burned</Text>
                    <TextInput
                      value={editingEntry?.calories_burned ?? ""}
                      onChangeText={(v) => setEditingEntry((prev) => prev ? { ...prev, calories_burned: v } : null)}
                      keyboardType="numeric"
                      style={{
                        borderWidth: 1,
                        borderColor: colors.border,
                        borderRadius: 10,
                        paddingHorizontal: 14,
                        paddingVertical: 10,
                        fontSize: 15,
                        color: colors.text,
                        backgroundColor: colors.inputBg,
                      }}
                    />
                  </View>
                </View>
              </>
            )}

            <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
              <Pressable
                onPress={() => setEditingEntry(null)}
                style={{
                  flex: 1,
                  paddingVertical: 13,
                  borderRadius: 12,
                  alignItems: "center",
                  backgroundColor: isDarkMode ? "#27272a" : "#e4e4e7",
                }}
              >
                <Text style={{ fontSize: 15, fontWeight: "700", color: colors.text }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleSaveEdit}
                disabled={savingEdit}
                style={{
                  flex: 2,
                  paddingVertical: 13,
                  borderRadius: 12,
                  alignItems: "center",
                  backgroundColor: colors.primary,
                  opacity: savingEdit ? 0.6 : 1,
                }}
              >
                <Text style={{ fontSize: 15, fontWeight: "700", color: "#ffffff" }}>
                  {savingEdit ? "Saving…" : "Save Changes"}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>

  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#09090b", // Deep dark background
  },
  flexOne: {
    flex: 1,
  },
  centerLoading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#09090b",
  },
  scrollContent: {
    padding: 16,
    gap: 16,
    paddingBottom: 40,
  },

  // Auth Screen redone in Dark Mode
  authContainer: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    gap: 16,
    backgroundColor: "#09090b",
  },
  authTitle: {
    fontSize: 32,
    fontWeight: "800",
    color: "#fafafa",
    textAlign: "center",
  },
  authSubtitle: {
    fontSize: 16,
    color: "#71717a",
    textAlign: "center",
    marginBottom: 20,
  },
  authButtonGroup: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },

  // Header styles (Journable style)
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#18181b",
    backgroundColor: "#09090b",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  menuIcon: {
    fontSize: 22,
    color: "#fafafa",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#fafafa",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  streakIcon: {
    fontSize: 16,
    fontWeight: "700",
    color: "#f97316", // glowing orange streak
    backgroundColor: "#27272a",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  signOutButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "#27272a",
    borderRadius: 8,
  },
  signOutText: {
    color: "#fafafa",
    fontSize: 12,
    fontWeight: "600",
  },

  // Date strip selector
  dateStripContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#18181b",
    borderRadius: 14,
    padding: 8,
    borderWidth: 1,
    borderColor: "#27272a",
  },
  dateCard: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 10,
    gap: 4,
  },
  dateCardSelected: {
    backgroundColor: "#10b981", // active green highlight from mock
  },
  dateDayName: {
    fontSize: 11,
    color: "#71717a",
    fontWeight: "600",
  },
  dateDayNum: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fafafa",
  },
  dateTextSelected: {
    color: "#ffffff",
  },

  // Journable Double Summary Card Grid
  summaryRow: {
    flexDirection: "row",
    gap: 12,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: "#18181b",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#27272a",
    gap: 8,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  cardHeaderEmoji: {
    fontSize: 16,
  },
  cardHeaderTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#a1a1aa",
  },
  caloriesSplitRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  calorieColumn: {
    alignItems: "center",
  },
  calorieValueText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fafafa",
  },
  calorieLabelText: {
    fontSize: 10,
    color: "#71717a",
    marginTop: 2,
  },
  highlightText: {
    color: "#f97316", // bold calories highlight
  },

  // Macros card list
  macrosList: {
    gap: 4,
    marginTop: 2,
  },
  macroItemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  macroLabel: {
    fontSize: 11,
    color: "#71717a",
    fontWeight: "600",
  },
  macroValue: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fafafa",
  },

  // Premium Cards / Glass layout
  glassCard: {
    backgroundColor: "#18181b",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#27272a",
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fafafa",
    marginBottom: 4,
  },

  // Stepper-based Water Tracker
  waterCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  waterCardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#3b82f6", // Blue
  },
  waterStepperRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#27272a",
    borderRadius: 12,
    padding: 8,
  },
  stepperButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#3f3f46",
    alignItems: "center",
    justifyContent: "center",
  },
  stepperButtonText: {
    fontSize: 22,
    color: "#ffffff",
    fontWeight: "700",
  },
  waterDisplayColumn: {
    alignItems: "center",
    gap: 2,
  },
  waterCupsText: {
    fontSize: 18,
    fontWeight: "800",
    color: "#fafafa",
  },
  waterGoalLabel: {
    fontSize: 11,
    color: "#a1a1aa",
  },

  // Inputs
  darkInput: {
    borderWidth: 1,
    borderColor: "#27272a",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#09090b",
    color: "#fafafa",
    fontSize: 15,
  },
  darkTextArea: {
    borderWidth: 1,
    borderColor: "#27272a",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#09090b",
    color: "#fafafa",
    minHeight: 80,
    textAlignVertical: "top",
    fontSize: 15,
  },

  // Photo uploads
  photoUploadRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  // Buttons
  primaryButton: {
    flex: 1,
    backgroundColor: "#a855f7", // Premium Purple accent
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: "#27272a",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  submitButton: {
    backgroundColor: "#a855f7",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  disabledButton: {
    opacity: 0.5,
  },
  buttonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 14,
  },

  // Meal listing entries
  mealRowContainer: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#27272a",
    gap: 6,
  },
  mealRowHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  mealCaloriesText: {
    fontSize: 17,
    fontWeight: "800",
    color: "#f97316",
  },
  mealTimeText: {
    fontSize: 12,
    color: "#71717a",
  },
  mealDetailsRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  detailPill: {
    fontSize: 11,
    fontWeight: "700",
    color: "#fafafa",
    backgroundColor: "#27272a",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  microPill: {
    fontSize: 10,
    fontWeight: "600",
    color: "#a1a1aa",
    backgroundColor: "#18181b",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#27272a",
  },
  foodItemsContainer: {
    marginTop: 4,
    gap: 2,
  },
  foodItemText: {
    color: "#d4d4d8",
    fontSize: 13,
  },

  // Weight Tab layout
  weightInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  kgLabel: {
    color: "#fafafa",
    fontSize: 16,
    fontWeight: "700",
  },
  weightSubmitButton: {
    backgroundColor: "#a855f7",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  weightHistoryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#27272a",
  },
  weightValueText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#fafafa",
  },
  weightDateText: {
    fontSize: 12,
    color: "#71717a",
  },

  // Goals tab calculator layouts
  calculatorSubtitle: {
    color: "#a1a1aa",
    fontSize: 13,
    marginBottom: 8,
  },
  calcFieldRow: {
    flexDirection: "row",
    gap: 10,
  },
  calcFieldColumn: {
    flex: 1,
    gap: 4,
  },
  calcFieldLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#a1a1aa",
    marginTop: 6,
  },
  selectorGroupRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
  },
  selectorGroupButton: {
    flex: 1,
    backgroundColor: "#27272a",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  selectorGroupButtonActive: {
    backgroundColor: "#a855f7",
  },
  calcDropdownContainer: {
    gap: 6,
    marginTop: 4,
  },
  dropdownItem: {
    backgroundColor: "#18181b",
    borderWidth: 1,
    borderColor: "#27272a",
    padding: 12,
    borderRadius: 10,
  },
  dropdownItemActive: {
    borderColor: "#a855f7",
    backgroundColor: "#27272a",
  },
  dropdownItemText: {
    color: "#fafafa",
    fontSize: 13,
    fontWeight: "600",
  },
  activeGoalContainer: {
    backgroundColor: "#09090b",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#27272a",
    gap: 4,
  },
  activeGoalLabel: {
    fontSize: 12,
    color: "#71717a",
    fontWeight: "700",
  },
  activeGoalValue: {
    fontSize: 20,
    fontWeight: "800",
    color: "#a855f7",
    marginBottom: 8,
  },

  // Helper feedback and errors
  helperText: {
    color: "#71717a",
    textAlign: "center",
    fontSize: 13,
    paddingVertical: 10,
  },
  successText: {
    color: "#10b981",
    fontWeight: "600",
    fontSize: 14,
    textAlign: "center",
  },
  errorText: {
    color: "#ef4444",
    fontWeight: "600",
    fontSize: 14,
    textAlign: "center",
  },
  authAlertBox: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  // ── Toast notification ──────────────────────────────────────────────────────
  toastContainer: {
    position: "absolute",
    top: 16,
    left: 16,
    right: 16,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 9999,
  },
  toastMessage: {
    flex: 1,
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
  },
  toastClose: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  toastCloseText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
  },

  // Bottom Navigation tab bar (Journable style)
  navBar: {
    flexDirection: "row",
    height: 64,
    backgroundColor: "#18181b",
    borderTopWidth: 1,
    borderTopColor: "#27272a",
    alignItems: "center",
    justifyContent: "space-around",
  },
  navTab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    height: "100%",
  },
  navTabActive: {
    backgroundColor: "#09090b",
  },
  navTabEmoji: {
    fontSize: 18,
  },
  navTabText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#71717a",
  },
  navTabTextActive: {
    color: "#a855f7",
  },
  sourceSelectorRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  sourceButton: {
    flex: 1,
    backgroundColor: "#27272a",
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  sourceButtonActive: {
    backgroundColor: "#a855f7",
  },
  bottomFixedForm: {
    borderRadius: 0,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderLeftWidth: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopWidth: 1,
    borderTopColor: "#27272a",
    backgroundColor: "#18181b",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  streakContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  streakText: {
    fontSize: 13,
    fontWeight: "700",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  compactInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 14,
    height: 40,
  },
  compactIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  compactSourceToggle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  compactSubmitButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
});
