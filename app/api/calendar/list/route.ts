// app/api/calendar/list/route.ts
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const timeMin = searchParams.get('timeMin');
  const timeMax = searchParams.get('timeMax');
  const token = request.headers.get('Authorization')?.replace('Bearer ', '');

  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!timeMin || !timeMax) return NextResponse.json({ error: 'Missing params' }, { status: 400 });

  try {
    // Google Calendar APIを叩く
    const params = new URLSearchParams({
      timeMin: timeMin,
      timeMax: timeMax,
      singleEvents: 'true',
      orderBy: 'startTime',
      timeZone: 'Asia/Tokyo' // 日本時間を基準にする
    });

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const data = await response.json();
    
    if (data.error) throw new Error(data.error.message);

    return NextResponse.json({ events: data.items || [] });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}