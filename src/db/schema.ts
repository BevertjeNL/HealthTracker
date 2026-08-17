import {
  pgTable,
  serial,
  integer,
  real,
  text,
  timestamp,
  date,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const stravaTokens = pgTable("strava_tokens", {
  id: serial("id").primaryKey(),
  athleteId: text("athlete_id").notNull(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const activities = pgTable(
  "activities",
  {
    id: serial("id").primaryKey(),
    stravaId: text("strava_id").notNull(),
    name: text("name"),
    type: text("type"),
    startDate: timestamp("start_date", { withTimezone: true }).notNull(),
    distanceM: real("distance_m"),
    movingTimeS: integer("moving_time_s"),
    elapsedTimeS: integer("elapsed_time_s"),
    elevationGainM: real("elevation_gain_m"),
    avgHeartRate: real("avg_heart_rate"),
    maxHeartRate: real("max_heart_rate"),
    avgPaceMinPerKm: real("avg_pace_min_per_km"),
    avgCadence: real("avg_cadence"),
    sufferScore: real("suffer_score"),
    raw: jsonb("raw"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("activities_strava_id_idx").on(table.stravaId)],
);

export const healthMetrics = pgTable(
  "health_metrics",
  {
    id: serial("id").primaryKey(),
    date: date("date").notNull(),
    restingHeartRate: real("resting_heart_rate"),
    hrvMs: real("hrv_ms"),
    vo2Max: real("vo2_max"),
    sleepHours: real("sleep_hours"),
    sleepScore: real("sleep_score"),
    steps: integer("steps"),
    activeEnergyKcal: real("active_energy_kcal"),
    weightKg: real("weight_kg"),
    raw: jsonb("raw"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("health_metrics_date_idx").on(table.date)],
);
