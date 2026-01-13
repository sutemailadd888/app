// app/api/book/slots/route.ts
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const hostId = searchParams.get('hostId');
  const date = searchParams.get('date');

  console.log(`\n🔍 [DEBUG] 日程チェック開始: ${date}`);

  if (!hostId || !date) return NextResponse.json({ error: 'パラメータ不足' }, { status: 400 });

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return NextResponse.json({ error: 'Server Config Error' }, { status: 500 });

  const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey);

  try {
    // 1. 金庫からトークン取得
    const { data: secrets } = await supabaseAdmin
      .from('user_secrets')
      .select('access_token')
      .eq('user_id', hostId)
      .single();

    if (!secrets?.access_token) return NextResponse.json({ error: 'Token not found' }, { status: 404 });

    // 2. Googleに問い合わせ
    // JSTで検索範囲を指定 (例: 2026-01-20T00:00:00+09:00)
    const timeMin = `${date}T00:00:00+09:00`;
    const timeMax = `${date}T23:59:59+09:00`;

    console.log(`📡 Google問い合わせ範囲: ${timeMin} 〜 ${timeMax}`);

    const googleRes = await fetch('https://www.googleapis.com/calendar/v3/freebusy', {
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

    // ★ここでGoogleが返してきた「忙しい時間」を全てログに出す
    console.log("⚠️ Googleが認識している『忙しい時間』一覧:");
    busyRanges.forEach((range: any, i: number) => {
        // 日本時間に変換して表示しやすくする
        const start = new Date(range.start).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
        const end = new Date(range.end).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
        console.log(`   [${i}] ${start} 〜 ${end}`);
    });

    // 3. 空き枠計算
    const candidates = [10, 11, 13, 14, 15, 16, 17];
    const availableSlots = [];

    console.log("🕒 各スロットの判定:");
    for (const hour of candidates) {
        // 時間を2桁にする (例: 9 -> '09')
        const hourStr = hour.toString().padStart(2, '0');
        
        // スロットの開始・終了時刻 (Dateオブジェクト)
        const slotStart = new Date(`${date}T${hourStr}:00:00+09:00`);
        const slotEnd = new Date(`${date}T${hour + 1}:00:00+09:00`);

        // 重なりチェック
        const conflict = busyRanges.find((range: any) => {
            const rangeStart = new Date(range.start);
            const rangeEnd = new Date(range.end);
            // 重なっているか判定 (Slot開始 < 予定終了 かつ Slot終了 > 予定開始)
            return slotStart < rangeEnd && slotEnd > rangeStart;
        });

        if (conflict) {
            console.log(`   ❌ ${hourStr}:00 はNG (理由: ${new Date(conflict.start).toLocaleTimeString('ja-JP', {timeZone:'Asia/Tokyo'})}〜 の予定と重複)`);
        } else {
            console.log(`   ✅ ${hourStr}:00 はOK`);
            availableSlots.push(`${hourStr}:00`);
        }
    }

    return NextResponse.json({ slots: availableSlots });

  } catch (error: any) {
    console.error("🚨 Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}