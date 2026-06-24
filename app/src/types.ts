export type FoodItem = {
  name: string;
  qty?: string | number | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  sugar_g: number;
  fiber_g: number;
  sodium_mg: number;
};

export type Meal = {
  id: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  sugar_g: number;
  fiber_g: number;
  sodium_mg: number;
  food_items: FoodItem[];
  logged_at: string;
};

export type SummaryByDay = {
  day: string;
  calories: number;
};

export type Summary = {
  total_calories: number;
  avg_calories: number;
  by_day: SummaryByDay[];
};

export type Profile = {
  id: string;
  display_name: string;
  daily_calorie_goal: number;
  daily_protein_goal_g: number;
};

export type WeightLog = {
  id: string;
  weight_kg: number;
  logged_at: string;
};

export type WaterLog = {
  id: string;
  amount_ml: number;
  logged_at: string;
};

export type WaterDailySummary = {
  total_ml: number;
  logs: WaterLog[];
};

export type Exercise = {
  id: string;
  user_id: string;
  name: string;
  calories_burned: number;
  logged_at: string;
};

export type EntryResponse = {
  type: "meal" | "exercise";
  meal?: Meal;
  exercise?: Exercise;
};

