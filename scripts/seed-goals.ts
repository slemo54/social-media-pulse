// @ts-nocheck
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// Load environment variables from .env.local
config({ path: ".env.local" });

/**
 * Seed script: Popola goals table con obiettivi di esempio
 * - 4-5 goal con metriche diverse (monthly/quarterly)
 * - Target valori realistici per mostrare progresso
 */

type GoalsInsert = Database["public"]["Tables"]["goals"]["Insert"];

async function seedGoals() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("❌ Variabili di ambiente mancanti");
    process.exit(1);
  }

  const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  console.log("🌱 Inizio seed goals...");

  const goals: GoalsInsert[] = [
    {
      metric_name: "monthly_downloads",
      target_value: 50000,
      period: "monthly",
    },
    {
      metric_name: "monthly_listeners",
      target_value: 5000,
      period: "monthly",
    },
    {
      metric_name: "monthly_views",
      target_value: 20000,
      period: "monthly",
    },
    {
      metric_name: "quarterly_downloads",
      target_value: 150000,
      period: "quarterly",
    },
    {
      metric_name: "quarterly_listeners",
      target_value: 15000,
      period: "quarterly",
    },
  ];

  const { error } = await supabase
    .from("goals")
    .upsert(goals, { onConflict: "metric_name,period" });

  if (error) {
    console.error("❌ Errore inserimento goals:", error);
    return;
  }

  console.log(`✅ Seed goals completato: ${goals.length} goal inseriti`);
  console.log("\n📋 Goal creati:");
  goals.forEach((g) => {
    console.log(`  • ${g.metric_name} (${g.period}): ${g.target_value}`);
  });
}

seedGoals().catch(console.error);
