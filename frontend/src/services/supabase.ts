import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Supabase環境変数が設定されていません。.envファイルを確認してください。");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
