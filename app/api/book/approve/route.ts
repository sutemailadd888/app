import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { google } from 'googleapis'; // ★追加: トークン自動更新のため
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY!);

// ★重要: 他人のトークンを取得するため、管理者権限(SERVICE_ROLE_KEY)を使う
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { request: bookingReq } = body; 

    if (!bookingReq) return NextResponse.json({ error: 'Missing request data' }, { status: 400 });

    // 1. 新しいテーブル (user_tokens) からホストのトークンを取得
    const { data: tokenData, error: tokenError } = await supabaseAdmin
      .from('user_tokens')
      .select('access_token, refresh_token, expires_at')
      .eq('user_id', bookingReq.host_user_id)
      .single();

    if (tokenError || !tokenData) {
        console.error("Token Error:", tokenError);
        return NextResponse.json({ error: 'Host token not found in DB' }, { status: 401 });
    }

    // 2. Google Clientをセットアップ (これで期限切れでも自動更新されます)
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
    );

    oauth2Client.setCredentials({
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expiry_date: tokenData.expires_at ? Number(tokenData.expires_at) : undefined
    });

    // 3. Googleカレンダーに予定を作成
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const calendarEvent = {
        summary: `面談: ${bookingReq.guest_name} 様`,
        description: `GAKU-HUB予約\nEmail: ${bookingReq.guest_email}\nNote: ${bookingReq.note || 'なし'}`,
        start: { dateTime: bookingReq.start_time },
        end: { dateTime: bookingReq.end_time },
        attendees: [{ email: bookingReq.guest_email }],
        conferenceData: {
            createRequest: { 
                requestId: Math.random().toString(36).substring(7), 
                conferenceSolutionKey: { type: 'hangoutsMeet' } 
            }
        },
    };

    try {
        await calendar.events.insert({
            calendarId: 'primary',
            requestBody: calendarEvent,
            conferenceDataVersion: 1 // Meetリンク生成に必須
        });
    } catch (gError: any) {
        console.error("Google Calendar API Error:", gError.response?.data || gError);
        throw new Error('Googleカレンダーへの登録に失敗しました');
    }

    // 4. DBのステータスを「承認済み」に更新
    await supabaseAdmin
        .from('booking_requests')
        .update({ status: 'confirmed' })
        .eq('id', bookingReq.id);

    // 5. 確定メール送信
    try {
        // ※テスト送信のため、Toは安全策としてホスト本人や管理者宛にしておくのが無難ですが、
        // ここではそのままゲスト宛にします。Resendの制限に注意してください。
        await resend.emails.send({
            from: 'GAKU-HUB OS <noreply@gaku-hub.com>',
            to: bookingReq.guest_email, 
            subject: '【予約確定】面談の日程が決まりました',
            html: `
                <p>${bookingReq.guest_name} 様</p>
                <p>ご予約ありがとうございます。以下の日程で確定いたしました。</p>
                <div style="padding: 12px; border: 1px solid #ddd; border-radius: 8px; background-color: #f9f9f9;">
                    <p><strong>📅 日時:</strong> ${new Date(bookingReq.start_time).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</p>
                    <p><strong>💻 場所:</strong> Google Meet (カレンダーをご確認ください)</p>
                </div>
                <p>当日はよろしくお願いいたします。</p>
            `
        });
    } catch (emailError) {
        console.error("Mail Error (Non-fatal):", emailError);
    }

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error("Server Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}