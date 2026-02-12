'use client';

import React, { useState, useEffect } from 'react';
import { Copy, RefreshCw, Check, Loader2, Calendar } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Props {
  session: any;
  orgId?: string;
}

export default function MeetingCard({ session, orgId }: Props) {
  const [menuList, setMenuList] = useState<any[]>([]);
  const [selectedMenuSlug, setSelectedMenuSlug] = useState<string>('');
  
  const [loading, setLoading] = useState(false);
  const [slots, setSlots] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  // 1. 予約メニュー一覧を取得
  useEffect(() => {
    if (!orgId) return;
    const fetchMenus = async () => {
      const { data } = await supabase
        .from('meeting_types')
        .select('id, title, slug, duration_minutes')
        .eq('workspace_id', orgId)
        .eq('is_active', true);
      
      if (data && data.length > 0) {
        setMenuList(data);
        setSelectedMenuSlug(data[0].slug); // 初期値
      }
    };
    fetchMenus();
  }, [orgId]);

  // 2. 空き時間を検索 (直近1週間分くらい)
  const generateSlots = async () => {
    if (!selectedMenuSlug) return;
    setLoading(true);
    setSlots([]);
    setCopied(false);

    try {
      // 今日から1週間分の日付リストを作る
      const dates = [];
      const today = new Date();
      for (let i = 1; i <= 7; i++) { // 明日から7日間
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        dates.push(d.toISOString().split('T')[0]);
      }

      // 各日付についてAPIを叩く (並列処理)
      const promises = dates.map(async (date) => {
        const res = await fetch(`/api/book/slots?slug=${selectedMenuSlug}&date=${date}`);
        const data = await res.json();
        return { date, slots: data.slots || [] };
      });

      const results = await Promise.all(promises);

      // 結果を整形 (各日最大3枠くらいまでピックアップ)
      const formattedSlots: string[] = [];
      
      results.forEach(({ date, slots }) => {
        if (slots.length > 0) {
            // 日付フォーマット (例: 1/30(火))
            const dObj = new Date(date);
            const dateStr = dObj.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' });
            
            // 最初の3つだけ採用
            slots.slice(0, 3).forEach((time: string) => {
                // 終了時間を計算
                const menu = menuList.find(m => m.slug === selectedMenuSlug);
                const duration = menu?.duration_minutes || 60;
                
                const [h, m] = time.split(':').map(Number);
                const endDate = new Date();
                endDate.setHours(h, m + duration);
                const endTime = endDate.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

                formattedSlots.push(`・${dateStr} ${time}〜${endTime}`);
            });
        }
      });

      setSlots(formattedSlots.slice(0, 5)); // 全体で5つくらいに絞る

    } catch (error) {
      console.error(error);
      alert('空き時間の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    const text = [
        "以下の日程はいかがでしょうか？",
        "",
        ...slots,
        "",
        "ご都合の悪い場合はお知らせください。"
    ].join('\n');
    
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (menuList.length === 0) {
    return (
        <div className="bg-gray-50 p-4 rounded-lg border border-dashed border-gray-300 text-center text-gray-500 text-sm">
            まずは「予約ページの作成」からメニューを作ってください
        </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="p-4 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
        <h3 className="font-bold text-gray-700 flex items-center gap-2 text-sm">
            <Calendar size={16} className="text-purple-600"/>
            条件を選択して候補を出す
        </h3>
      </div>
      
      <div className="p-4 space-y-4">
        {/* メニュー選択 */}
        <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">使用する予約メニュー</label>
            <select 
                className="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white"
                value={selectedMenuSlug}
                onChange={(e) => setSelectedMenuSlug(e.target.value)}
            >
                {menuList.map(menu => (
                    <option key={menu.id} value={menu.slug}>
                        {menu.title} ({menu.duration_minutes}分)
                    </option>
                ))}
            </select>
        </div>

        {/* 生成ボタン */}
        <button 
            onClick={generateSlots}
            disabled={loading}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 rounded-lg text-sm flex items-center justify-center gap-2 transition"
        >
            {loading ? <Loader2 size={16} className="animate-spin"/> : <RefreshCw size={16}/>}
            <span>空き時間を検索・抽出</span>
        </button>

        {/* 結果表示エリア */}
        {slots.length > 0 && (
            <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 mt-2 animate-in fade-in slide-in-from-top-2">
                <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-bold text-gray-500">生成されたテキスト</span>
                    <button 
                        onClick={copyToClipboard}
                        className={`text-xs px-2 py-1 rounded flex items-center gap-1 transition ${copied ? 'bg-green-100 text-green-700' : 'bg-white border hover:bg-gray-100 text-gray-700'}`}
                    >
                        {copied ? <Check size={12}/> : <Copy size={12}/>}
                        {copied ? 'コピーしました' : 'コピー'}
                    </button>
                </div>
                <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans bg-white p-2 rounded border border-gray-100">
                    以下の日程はいかがでしょうか？<br/><br/>
                    {slots.join('\n')}<br/><br/>
                    ご都合の悪い場合はお知らせください。
                </pre>
            </div>
        )}
        
        {!loading && slots.length === 0 && selectedMenuSlug && (
             <p className="text-center text-xs text-gray-400 py-2">
                 ボタンを押すと、直近1週間の空き枠から<br/>最大5件の候補を自動抽出します。
             </p>
        )}
      </div>
    </div>
  );
}