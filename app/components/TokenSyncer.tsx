'use client';

import { useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

interface Props {
  session: any;
}

export default function TokenSyncer({ session }: Props) {
  useEffect(() => {
    const syncToken = async () => {
      // Google連携のトークンがない場合は何もしない
      if (!session?.provider_token) return;

      console.log("🔄 トークンを同期中...");

      // ★修正点: テーブル名を user_tokens に変更し、expires_at も保存する
      const { error } = await supabase
        .from('user_tokens') 
        .upsert({
          user_id: session.user.id,
          access_token: session.provider_token,
          refresh_token: session.provider_refresh_token || null,
          expires_at: session.expires_at || null, // ★重要: これがないと更新できません
          updated_at: new Date().toISOString()
        });
      
      if (error) {
        console.error("❌ Token Sync Error:", error);
      } else {
        console.log("✅ トークン保存完了");
      }
    };

    syncToken();
  }, [session]);

  return null;
}