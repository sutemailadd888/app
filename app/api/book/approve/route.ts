// app/api/book/approve/route.ts
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { requestId, session } = await request.json();
    const token = session?.provider_token;

    if (!token || !requestId) return NextResponse.json({ error: "Unauthorized or missing ID" }, { status: 400 });

    // Supabaseクライアント (自身の権限で更新するため、userのtokenを使う)
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { global: { headers: { Authorization: `Bearer ${session.access_token}` } } }
    );

    // 1. リクエスト情報を取得
    const { data: booking, error: fetchError } = await supabase
        .from('booking_requests')
        .select('*')
        .eq('id', requestId)
        .single();

    if (fetchError || !booking) throw new Error("Request not found");

    // 2. Googleカレンダーに登録 (Meetリンク付き)
    const conferenceId = Math.random().toString(36).substring(7);
    const eventBody = {
      summary: `面談: ${booking.guest_name}様`,
      description: `
【面談予約 (確定)】
お名前: ${booking.guest_name} 様
Email: ${booking.guest_email}
メモ: ${booking.note || 'なし'}

Google Meetのリンクからご参加ください。
      `,
      start: { dateTime: booking.start_time, timeZone: 'Asia/Tokyo' },
      end: { dateTime: booking.end_time, timeZone: 'Asia/Tokyo' },
      attendees: [{ email: booking.guest_email }],
      conferenceData: {
        createRequest: {
          requestId: conferenceId,
          conferenceSolutionKey: { type: "hangoutsMeet" }
        }
      }
    };

    const calendarRes = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all&conferenceDataVersion=1', 
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(eventBody),
      }
    );

    const calendarData = await calendarRes.json();
    if (calendarData.error) throw new Error(calendarData.error.message);

    // 3. DBのステータスを 'confirmed' に更新
    const { error: updateError } = await supabase
        .from('booking_requests')
        .update({ status: 'confirmed' })
        .eq('id', requestId);

    if (updateError) throw updateError;

    return NextResponse.json({ success: true, link: calendarData.htmlLink });

  } catch (error: any) {
    console.error("Approve Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}