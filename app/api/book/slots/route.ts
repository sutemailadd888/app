import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { google } from 'googleapis';

export const dynamic = 'force-dynamic';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const getDayKey = (date: Date) => {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return days[date.getDay()];
};

export async function GET(req: Request) {
  console.log("🔍 --- Debug: Slot Search Start ---");
  const { searchParams } = new URL(req.url);
  const dateStr = searchParams.get('date');
  const orgId = searchParams.get('orgId');

  if (!dateStr || !orgId) {
    return NextResponse.json({ error: 'Missing params' }, { status: 400 });
  }

  try {
    // 1. 設定確認
    const { data: settings } = await supabaseAdmin
      .from('schedule_settings')
      .select('weekly_config')
      .eq('workspace_id', orgId)
      .single();

    if (!settings?.weekly_config) {
      console.log("❌ 設定が見つかりません");
      return NextResponse.json({ slots: [] });
    }
    
    // 2. メンバー取得
    const { data: members } = await supabaseAdmin
        .from('workspace_members')
        .select('user_id')
        .eq('workspace_id', orgId);

    console.log(`👥 メンバー数: ${members?.length}名`, members);

    let allBusySlots: { start: string; end: string }[] = [];

    if (members && members.length > 0) {
        await Promise.all(members.map(async (member) => {
            console.log(`👤 ユーザー(${member.user_id})のチェック開始...`);

            // トークン取得
            const { data: userToken, error: tokenError } = await supabaseAdmin
                .from('user_tokens')
                .select('*') // 全カラム確認
                .eq('user_id', member.user_id)
                .single();

            if (tokenError || !userToken) {
                console.log(`⚠️ トークン取得失敗: ${tokenError?.message || 'データなし'}`);
                return;
            }

            console.log(`🔑 トークンあり。Google APIへ問い合わせ...`);

            const oauth2Client = new google.auth.OAuth2(
                process.env.GOOGLE_CLIENT_ID,
                process.env.GOOGLE_CLIENT_SECRET
            );
            oauth2Client.setCredentials({
                access_token: userToken.access_token,
                refresh_token: userToken.refresh_token, // これがあれば自動更新される
                expiry_date: userToken.expires_at ? Number(userToken.expires_at) : undefined,
            });

            const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
            const timeMin = `${dateStr}T00:00:00+09:00`;
            const timeMax = `${dateStr}T23:59:59+09:00`;

            try {
                const res = await calendar.freebusy.query({
                    requestBody: {
                        timeMin,
                        timeMax,
                        timeZone: 'Asia/Tokyo',
                        items: [{ id: 'primary' }],
                    },
                });
                
                const busy = res.data.calendars?.primary?.busy || [];
                console.log(`📅 Google予定取得成功: ${busy.length}件の予定あり`);
                
                const cleanBusy = busy
                    .filter(b => b.start && b.end)
                    .map(b => ({ start: b.start as string, end: b.end as string }));
                
                allBusySlots.push(...cleanBusy);

            } catch (e: any) {
                console.error(`❌ Google API Error:`, e.response?.data || e.message);
            }
        }));
    }

    // 3. スロット生成
    const slots = [];
    const targetDate = new Date(dateStr);
    const dayConfig = settings.weekly_config[getDayKey(targetDate)];

    if (!dayConfig || !dayConfig.active) {
        console.log("🛌 今日は休業日設定です");
        return NextResponse.json({ slots: [] });
    }

    const [startH, startM] = dayConfig.start.split(':').map(Number);
    const [endH, endM] = dayConfig.end.split(':').map(Number);
    
    let currentSlot = new Date(`${dateStr}T${String(startH).padStart(2,'0')}:${String(startM).padStart(2,'0')}:00+09:00`);
    const dayEndTime = new Date(`${dateStr}T${String(endH).padStart(2,'0')}:${String(endM).padStart(2,'0')}:00+09:00`);

    console.log(`⏱ スロット計算開始: 予定総数 ${allBusySlots.length}件`);

    while (currentSlot < dayEndTime) {
        const slotEnd = new Date(currentSlot.getTime() + 60 * 60000);
        if (slotEnd > dayEndTime) break;

        const isConflict = allBusySlots.some(busy => {
            const busyStart = new Date(busy.start);
            const busyEnd = new Date(busy.end);
            return currentSlot < busyEnd && slotEnd > busyStart;
        });

        if (!isConflict) {
            const timeStr = currentSlot.toLocaleTimeString('ja-JP', {
                hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo'
            });
            slots.push(timeStr);
        }
        currentSlot = new Date(currentSlot.getTime() + 60 * 60000);
    }

    console.log(`✅ 計算完了: ${slots.length}枠を提案`);
    return NextResponse.json({ slots });

  } catch (error: any) {
    console.error('API Critical Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}