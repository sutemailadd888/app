import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const hostId = searchParams.get('hostId');
  const date = searchParams.get('date');
  const orgId = searchParams.get('orgId');

  if (!hostId || !date) return NextResponse.json({ error: 'パラメータ不足' }, { status: 400 });

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey!);

  try {
    // 1. トークン取得
    const { data: secrets } = await supabaseAdmin
      .from('user_secrets')
      .select('access_token')
      .eq('user_id', hostId)
      .single();

    if (!secrets?.access_token) return NextResponse.json({ error: 'Token not found' }, { status: 404 });

    // 2. ワークスペース設定取得
    let settingsQuery = supabaseAdmin.from('schedule_settings').select('weekly_config').eq('user_id', hostId);
    if (orgId) settingsQuery = settingsQuery.eq('organization_id', orgId);
    
    const { data: settingsData } = await settingsQuery.maybeSingle();
    const settings = settingsData?.weekly_config;

    // 3. 営業時間の判定
    const dayIndex = new Date(date).getDay(); 
    const dayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const todayKey = dayKeys[dayIndex];
    const dayConfig = settings ? settings[todayKey] : { active: true, start: '10:00', end: '18:00' };

    if (!dayConfig || !dayConfig.active) {
        return NextResponse.json({ slots: [] });
    }

    // 4. 【変更点】チェックすべきカレンダーIDを全取得
    // まず、このアカウントが見れるカレンダーリストを取得する
    const calendarListRes = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
        headers: { 'Authorization': `Bearer ${secrets.access_token}` }
    });
    
    let calendarIds = [{ id: 'primary' }]; // 最低でもメインは見る
    
    if (calendarListRes.ok) {
        const listData = await calendarListRes.json();
        // 「選択されている(selected)」かつ「書き込み権限がない(shared)」カレンダーなども含める
        // ※ここではシンプルに「一覧にあるカレンダーすべて」をチェック対象にします
        if (listData.items) {
            calendarIds = listData.items.map((cal: any) => ({ id: cal.id }));
        }
    }

    // 5. Googleカレンダーに問い合わせ (複数のカレンダーIDを投げる)
    const timeMin = `${date}T00:00:00+09:00`;
    const timeMax = `${date}T23:59:59+09:00`;

    const googleRes = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${secrets.access_token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            timeMin, 
            timeMax, 
            timeZone: 'Asia/Tokyo', 
            items: calendarIds // ★ここで全カレンダーを渡す
        })
    });

    if (!googleRes.ok) {
        console.error("Google API Error:", await googleRes.text());
        return NextResponse.json({ error: 'Google Calendar Error' }, { status: 500 });
    }
    
    const googleData = await googleRes.json();
    
    // 6. 全カレンダーの「予定あり(busy)」を合体させる
    // googleData.calendars は { "primary": { busy: [...] }, "private@gmail...": { busy: [...] } } のようになっている
    let allBusyRanges: any[] = [];
    Object.values(googleData.calendars).forEach((cal: any) => {
        if (cal.busy && cal.busy.length > 0) {
            allBusyRanges = [...allBusyRanges, ...cal.busy];
        }
    });

    // 7. 空き枠計算
    const startHour = parseInt(dayConfig.start.split(':')[0]);
    const endHour = parseInt(dayConfig.end.split(':')[0]);
    const availableSlots = [];

    for (let h = startHour; h < endHour; h++) {
        const hourStr = h.toString().padStart(2, '0');
        const slotStart = new Date(`${date}T${hourStr}:00:00+09:00`);
        const slotEnd = new Date(`${date}T${h + 1}:00:00+09:00`);

        // いずれかのカレンダーの予定と被っていたらNG
        const conflict = allBusyRanges.find((range: any) => {
            const rangeStart = new Date(range.start);
            const rangeEnd = new Date(range.end);
            return slotStart < rangeEnd && slotEnd > rangeStart;
        });

        if (!conflict) {
            availableSlots.push(`${hourStr}:00`);
        }
    }

    return NextResponse.json({ slots: availableSlots });

  } catch (error: any) {
    console.error("🚨 Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}