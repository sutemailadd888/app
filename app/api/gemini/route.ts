// app/api/gemini/route.ts
import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    // フロントエンドから「カレンダーの予定」と「ユーザーの要望」を受け取る
    const { events, userPrompt } = await request.json();

    const apiKey = process.env.GOOGLE_GEMINI_API_KEY!;
    const genAI = new GoogleGenerativeAI(apiKey);
    
    // ★ここを修正しました！リストにあった確実なモデルを指定★
    const model = genAI.getGenerativeModel({ model: 'gemini-flash-latest' });

    // AIへの命令書（プロンプト）を作成
    const systemPrompt = `
      あなたは優秀な日程調整アシスタントです。
      以下の「現在の予定リスト」を確認し、ユーザーの「要望」に基づいて、
      会議に最適な「候補日時」を3つ提案してください。

      【現在の予定リスト】
      ${JSON.stringify(events)}

      【ユーザーの要望】
      ${userPrompt}

      【ルール】
      - 予定が重ならないようにしてください。
      - 回答は必ず以下のJSON形式のみで返してください（余計な会話は不要）。
      - 日付フォーマットは "YYYY/MM/DD(曜)" としてください。
      
      Example output format:
      [
        { "date": "2023/10/25(水)", "time": "14:00 - 15:00", "reason": "午後の空き時間" },
        { "date": "2023/10/26(木)", "time": "10:00 - 11:00", "reason": "朝イチの枠" }
      ]
    `;

    // Geminiに考えてもらう
    const result = await model.generateContent(systemPrompt);
    const response = await result.response;
    const text = response.text();

    // JSON部分だけを取り出す（AIが余計なマークダウンをつけることがあるため除去）
    const jsonString = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const suggestions = JSON.parse(jsonString);

    return NextResponse.json({ suggestions });

  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'AIの思考中にエラーが発生しました' }, { status: 500 });
  }
}