// @ts-nocheck
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import * as fs from "fs";

config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  console.log("Available vars:", Object.keys(process.env).filter(k => k.includes('SUPABASE')));
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function runMigration() {
  try {
    const sql = fs.readFileSync("./supabase/migrations/003_analytics_features.sql", "utf8");
    
    console.log(`📝 SQL file loaded (${sql.length} chars)`);
    
    // Try to create tables directly using Supabase client
    const createGoalsTable = `
      CREATE TABLE IF NOT EXISTS public.goals (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        metric_name text NOT NULL,
        target_value numeric NOT NULL,
        period text NOT NULL CHECK (period IN ('monthly', 'quarterly')),
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `;
    
    console.log("⏳ Creating goals table...");
    try {
      // Test if table exists by trying a select
      const { error: selectError } = await supabase.from("goals").select("*").limit(1);
      
      if (selectError && selectError.code === 'PGRST116') {
        console.log("❌ Goals table doesn't exist. You need to create it manually in Supabase SQL editor.");
        console.log("\n📋 SQL to execute in Supabase dashboard:");
        console.log(sql);
        process.exit(0);
      } else if (selectError) {
        console.log("⚠️  Error checking table:", selectError.message);
      } else {
        console.log("✅ Goals table already exists!");
      }
    } catch (err) {
      console.log("❌ Could not verify table:", err.message);
    }

  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

runMigration();
