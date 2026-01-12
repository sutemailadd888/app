// app/api/calendar/create/route.ts
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { session, eventDetails, attendees } = await request.json();
    const token = session?.provider_token;

    if (!token) return NextResponse.json({ error: "No token found" }, { status: 401 });

    const cleanDate = eventDetails.date.replace(/\(.\)/, '').trim().replace(/\//g, '-');
    const [startTimeStr, endTimeStr] = eventDetails.time.split(' - ');
    const startDateTime = `${cleanDate}T${startTimeStr.trim()}:00`;
    const endDateTime = `${cleanDate}T${endTimeStr.trim()}:00`;

    // 参加者リストの整形
    let attendeeList: any[] = [];
    if (attendees && attendees.length > 0) {
        attendeeList = attendees.split(',').map((email: string) => ({ email: email.trim() }));
    }

    // ★追加: 会議室作成のためのユニークな注文番号を作る
    const requestId = Math.random().toString(36).substring(7);

    const politeDescription = `
【AI自動調整 (仮押さえ)】
この日程は、Smart Schedulerが候補日として自動的に仮押さえしました。
Google Meetのリンクが自動発行されていますので、当日はそちらからご参加ください。

もしご都合が悪い場合（移動中、作業集中など）は、遠慮なく「辞退 (No)」を押してください。
辞退があった場合、主催者が再度別の日程で調整します。

---
Created by Smart Scheduler
    `;

    const eventBody = {
      summary: `定例MTG (${eventDetails.reason})`,
      description: politeDescription,
      start: { 
        dateTime: startDateTime, 
        timeZone: 'Asia/Tokyo' 
      },
      end: { 
        dateTime: endDateTime, 
        timeZone: 'Asia/Tokyo' 
      },
      attendees: attendeeList,
      // ★追加: Google Meetを自動生成する設定
      conferenceData: {
        createRequest: {
          requestId: requestId,
          conferenceSolutionKey: {
            type: "hangoutsMeet" // ここでMeetを指定
          }
        }
      }
    };

    // ★重要: URLの末尾に conferenceDataVersion=1 を付ける必要がある
    const response = await fetch(
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

    const data = await response.json();

    if (data.error) {
        console.error('Calendar API Error:', data.error);
        throw new Error(data.error.message);
    }

    return NextResponse.json({ success: true, link: data.htmlLink });

  } catch (error: any) {
    console.error("Calendar Create Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}