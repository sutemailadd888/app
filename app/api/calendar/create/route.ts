// app/api/calendar/create/route.ts
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { session, eventDetails } = await request.json();
    const token = session?.provider_token;

    if (!token) {
      return NextResponse.json({ error: "No token found" }, { status: 401 });
    }

    // 1. 日付文字列のクリーニング
    // 例: "2026/01/08(木)" -> "2026-01-08"
    // (スラッシュをハイフンに変え、曜日などの余計な文字を消す)
    const cleanDate = eventDetails.date
      .replace(/\(.\)/, '') // (木)などを消す
      .trim()
      .replace(/\//g, '-'); // / を - に変える

    // 2. 時間を分割
    // 例: "14:00 - 15:00" -> ["14:00", "15:00"]
    const [startTimeStr, endTimeStr] = eventDetails.time.split(' - ');

    // 3. Googleカレンダーが理解できる形式 (YYYY-MM-DDTHH:mm:ss) に組み立てる
    // 注意: ここで new Date() を使うとサーバーの時差に巻き込まれるため、
    // あえて文字列操作だけで組み立てます。
    const startDateTime = `${cleanDate}T${startTimeStr.trim()}:00`;
    const endDateTime = `${cleanDate}T${endTimeStr.trim()}:00`;

    // 4. Google Calendar API に書き込む
    // timeZone: 'Asia/Tokyo' を明示するのが最大のポイントです
    const eventBody = {
      summary: `MTG (${eventDetails.reason})`,
      description: "Smart Scheduler (Gemini) によって自動作成されました。",
      start: { 
        dateTime: startDateTime, 
        timeZone: 'Asia/Tokyo' // ★日本時間であることを明示
      },
      end: { 
        dateTime: endDateTime, 
        timeZone: 'Asia/Tokyo' // ★日本時間であることを明示
      },
    };

    const response = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(eventBody),
      }
    );

    const data = await response.json();

    if (data.error) {
        console.error('Google Calendar Error:', data.error);
        throw new Error(data.error.message);
    }

    return NextResponse.json({ success: true, link: data.htmlLink });

  } catch (error: any) {
    console.error("Calendar Create Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}