// app/api/book/slots/route.ts
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const hostId = searchParams.get('hostId');
  const date = searchParams.get('date'); // YYYY-MM-DD

  console.log(`\n🔍 [DEBUG] 日程チェック開始: ${date}`);

  if (!hostId || !date) return NextResponse.json({ error: 'パラメータ不足' }, { status: 400 });

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return NextResponse.json({ error: 'Server Config Error' }, { status: 500 });

  const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey);

  try {
    // 1. 金庫(Token) と 設定(Settings) を両方取得する
    const [secretsResult, settingsResult] = await Promise.all([
      supabaseAdmin.from('user_secrets').select('access_token').eq('user_id', hostId).single(),
      supabaseAdmin.from('schedule_settings').select('weekly_config').eq('user_id', hostId).single()
    ]);

    const secrets = secretsResult.data;
    const settings = settingsResult.data?.weekly_config;

    if (!secrets?.access_token) return NextResponse.json({ error: 'Token not found' }, { status: 404 });

    // 2. 「今日は何曜日？」を判定して、営業時間を決定する
    // date (YYYY-MM-DD) を日付オブジェクトにして曜日を取得 (0=Sun, 1=Mon...)
    const dayIndex = new Date(date).getDay(); 
    const dayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const todayKey = dayKeys[dayIndex];
    
    // 設定がない場合はデフォルト(全日10-18)とみなす、ある場合は設定に従う
    const dayConfig = settings ? settings[todayKey] : { active: true, start: '10:00', end: '18:00' };

    console.log(`📅 判定: ${date} は ${todayKey}。 営業設定: ${dayConfig.active ? 'OPEN' : 'CLOSED'}`);

    // もしその曜日が「休み(active: false)」なら、Googleを見るまでもなく空きなし
    if (!dayConfig.active) {
        console.log("   ⛔ 定休日のためスキップ");
        return NextResponse.json({ slots: [] });
    }

    // 3. Googleカレンダーに問い合わせ
    const timeMin = `${date}T00:00:00+09:00`;
    const timeMax = `${date}T23:59:59+09:00`;

    const googleRes = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${secrets.access_token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            timeMin, timeMax, timeZone: 'Asia/Tokyo', items: [{ id: 'primary' }]
        })
    });

    if (!googleRes.ok) throw new Error(await googleRes.text());
    
    const googleData = await googleRes.json();
    const busyRanges = googleData.calendars.primary.busy;

    // 4. 空き枠計算 (設定された start 〜 end の間で枠を作る)
    const startHour = parseInt(dayConfig.start.split(':')[0]); // "10:00" -> 10
    const endHour = parseInt(dayConfig.end.split(':')[0]);     // "18:00" -> 18
    
    const availableSlots = [];

    // ループ範囲: 開始時間 〜 終了時間の1時間前まで (18:00終了なら最終枠は17:00-18:00)
    for (let h = startHour; h < endHour; h++) {
        const hourStr = h.toString().padStart(2, '0');
        
        // ★重要: お昼休み(12:00-13:00)を固定で除外したい場合はここをコメントアウト解除
        // if (h === 12) continue; 

        const slotStart = new Date(`${date}T${hourStr}:00:00+09:00`);
        const slotEnd = new Date(`${date}T${h + 1}:00:00+09:00`);

        // Googleの予定と被ってるかチェック
        const conflict = busyRanges.find((range: any) => {
            const rangeStart = new Date(range.start);
            const rangeEnd = new Date(range.end);
            return slotStart < rangeEnd && slotEnd > rangeStart;
        });

        if (!conflict) {
            availableSlots.push(`${hourStr}:00`);
        }
    }

    console.log(`✅ 計算完了。空き枠: ${availableSlots.length}件`);
    return NextResponse.json({ slots: availableSlots });

  } catch (error: any) {
    console.error("🚨 Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}