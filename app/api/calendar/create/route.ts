// app/api/calendar/create/route.ts
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { session, eventDetails } = await request.json();
    const token = session?.provider_token;

    if (!token) {
      return NextResponse.json({ error: "No token found" }, { status: 401 });
    }

    // 1. AIの提案データ（文字列）を、Googleカレンダー用の日付形式に変換する
    // 例: date="2023/10/25(水)", time="14:00 - 15:00"
    
    // (水)などの曜日を消す
    const cleanDate = eventDetails.date.replace(/\(.\)/, ''); 
    // 時間を分割する
    const [startTime, endTime] = eventDetails.time.split(' - ');

    // Googleが読める形 (ISO string) に組み立てる
    // 注意: 本来はタイムゾーン考慮が必要ですが、今回は簡易的に日本時間(JST)として処理します
    const startDateTime = new Date(`${cleanDate} ${startTime}`).toISOString();
    const endDateTime = new Date(`${cleanDate} ${endTime}`).toISOString();

    // 2. Google Calendar API に書き込む
    const eventBody = {
      summary: `MTG (${eventDetails.reason})`, // タイトル
      description: "Smart Scheduler (Gemini) によって自動作成されました。",
      start: { dateTime: startDateTime },
      end: { dateTime: endDateTime },
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
        throw new Error(data.error.message);
    }

    // 成功したら、作られた予定のURLを返す
    return NextResponse.json({ success: true, link: data.htmlLink });

  } catch (error: any) {
    console.error("Calendar Create Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}