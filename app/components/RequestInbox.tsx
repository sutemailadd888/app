// app/components/RequestInbox.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Inbox, Check, X, Loader2, Calendar, User, MessageSquare } from 'lucide-react';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Props {
  session: any;
}

export default function RequestInbox({ session }: Props) {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    fetchRequests();
  }, [session]);

  const fetchRequests = async () => {
    if (!session?.user?.id) return;
    setLoading(true);
    // 自分の宛の、かつ 'pending' (未承認) のものを取得
    const { data, error } = await supabase
        .from('booking_requests')
        .select('*')
        .eq('host_user_id', session.user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
    
    if (data) setRequests(data);
    setLoading(false);
  };

  // 承認処理
  const handleApprove = async (req: any) => {
    if (!confirm(`${req.guest_name}様からの予約を承認し、カレンダーに登録しますか？`)) return;
    setProcessingId(req.id);

    try {
        const res = await fetch('/api/book/approve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ requestId: req.id, session: session })
        });
        const data = await res.json();
        
        if (data.success) {
            alert("✅ 承認しました！招待メールが送信されました。");
            fetchRequests(); // リスト更新
        } else {
            alert("エラー: " + data.error);
        }
    } catch (e) {
        console.error(e);
        alert("通信エラーが発生しました");
    } finally {
        setProcessingId(null);
    }
  };

  // 辞退(却下)処理
  const handleReject = async (id: string) => {
    if (!confirm('本当にこのリクエストを辞退しますか？(相手には通知されません/手動連絡が必要です)')) return;
    // 今回は簡易的にDBのステータスだけ変える（メール送信機能がないため）
    // 本格運用ではSendGridなどで「今回はごめんなさいメール」を送ると親切です
    const { error } = await supabase
        .from('booking_requests')
        .update({ status: 'rejected' })
        .eq('id', id);
    
    if (!error) {
        fetchRequests();
    }
  };

  if (requests.length === 0) return null; // リクエストがなければ何も表示しない

  return (
    <div className="bg-white border-2 border-purple-500 rounded-xl shadow-lg overflow-hidden mb-8 animate-in slide-in-from-top-4">
        <div className="bg-purple-600 px-4 py-3 flex items-center justify-between text-white">
            <h3 className="font-bold flex items-center gap-2">
                <Inbox size={20}/> 未承認の予約リクエスト ({requests.length}件)
            </h3>
            <span className="text-xs bg-purple-500 px-2 py-1 rounded">要対応</span>
        </div>
        <div className="divide-y divide-gray-100">
            {requests.map((req) => {
                const start = new Date(req.start_time);
                const dateStr = start.toLocaleDateString();
                const timeStr = `${start.getHours()}:${start.getMinutes().toString().padStart(2, '0')}`;

                return (
                    <div key={req.id} className="p-4 hover:bg-purple-50 transition">
                        <div className="flex flex-col md:flex-row justify-between gap-4">
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="font-bold text-lg text-gray-800">{req.guest_name} 様</span>
                                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded flex items-center gap-1">
                                        <Calendar size={10}/> {dateStr} {timeStr}〜
                                    </span>
                                </div>
                                <div className="text-sm text-gray-600 mb-2">{req.guest_email}</div>
                                {req.note && (
                                    <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded border border-gray-100 flex gap-2">
                                        <MessageSquare size={14} className="shrink-0 mt-0.5"/>
                                        <span>{req.note}</span>
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                                <button 
                                    onClick={() => handleReject(req.id)}
                                    disabled={!!processingId}
                                    className="px-3 py-2 rounded-lg text-xs font-bold text-red-500 hover:bg-red-50 border border-transparent hover:border-red-100 transition"
                                >
                                    辞退
                                </button>
                                <button 
                                    onClick={() => handleApprove(req)}
                                    disabled={!!processingId}
                                    className="px-4 py-2 rounded-lg text-sm font-bold bg-purple-600 text-white hover:bg-purple-700 shadow-md flex items-center gap-2 transition"
                                >
                                    {processingId === req.id ? <Loader2 className="animate-spin" size={16}/> : <Check size={16}/>}
                                    承認して確定
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    </div>
  );
}