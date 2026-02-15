'use client';

import React, { useEffect, useState } from 'react';
import { CalendarClock, Plus, Loader2, Play, Check, Trash2, Pencil, Save, Briefcase } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Props {
  session: any;
  orgId: string;
}

export default function RuleList({ session, orgId }: Props) {
  const [rules, setRules] = useState<any[]>([]);
  const [meetingTypes, setMeetingTypes] = useState<any[]>([]); // 予約メニュー一覧
  const [loading, setLoading] = useState(false);
  
  // 新規作成・編集用
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // フォームデータ
  const [formData, setFormData] = useState({
    title: '',
    targetDay: '25',
    meetingTypeId: '' // 選択された予約メニューID
  });

  // 実行状態
  const [runningRuleId, setRunningRuleId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<any>({});

  const todayDate = new Date().getDate();

  // 1. 初期データ読み込み
  useEffect(() => {
    fetchData();
  }, [session, orgId]);

  const fetchData = async () => {
    if (!orgId) return;
    const token = session?.access_token || session?.provider_token;

    // A. ルール一覧を取得
    try {
      // meeting_typesの情報も一緒に取得して表示に使います
      const { data: rulesData, error } = await supabase
        .from('rules')
        .select(`*, meeting_types ( title, duration_minutes )`)
        .eq('workspace_id', orgId)
        .order('created_at');
      
      if (rulesData) setRules(rulesData);
    } catch (e) { console.error(e); }

    // B. 予約メニュー一覧を取得 (選択肢用)
    try {
      const { data: typesData } = await supabase
        .from('meeting_types')
        .select('id, title, duration_minutes')
        .eq('workspace_id', orgId)
        .eq('is_active', true);
        
      if (typesData) setMeetingTypes(typesData);
    } catch (e) { console.error(e); }
  };

  // 2. 保存処理 (新規・更新共通)
  const handleSave = async () => {
    if (!formData.title || !formData.meetingTypeId) {
        alert("会議名と予約メニューを選択してください");
        return;
    }

    setLoading(true);
    try {
      const payload = {
        workspace_id: orgId,
        title: formData.title,
        target_day: parseInt(formData.targetDay),
        meeting_type_id: formData.meetingTypeId, // ★これが重要
        // 旧カラムは空文字などを入れておく（互換性のため）
        prompt_custom: '', 
        attendees: ''
      };

      if (editingId) {
        // 更新
        const { error } = await supabase
            .from('rules')
            .update(payload)
            .eq('id', editingId);
        if (error) throw error;
      } else {
        // 新規作成
        const { error } = await supabase
            .from('rules')
            .insert(payload);
        if (error) throw error;
      }

      // リセット
      setIsAdding(false);
      setEditingId(null);
      setFormData({ title: '', targetDay: '25', meetingTypeId: '' });
      fetchData();

    } catch (e: any) {
      console.error(e);
      alert(`保存エラー: ${e.message}`);
    } finally {
        setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('このルールを削除しますか？')) return;
    await supabase.from('rules').delete().eq('id', id);
    fetchData();
  };

  const startEdit = (rule: any) => {
      setEditingId(rule.id);
      setFormData({
          title: rule.title,
          targetDay: rule.target_day.toString(),
          meetingTypeId: rule.meeting_type_id || ''
      });
      setIsAdding(false);
  };

  // 3. 自動調整を実行 (Run)
  const runRule = async (rule: any) => {
    if (!rule.meeting_type_id) {
        alert("このルールには予約メニューが紐付いていません。編集して設定してください。");
        return;
    }

    setRunningRuleId(rule.id);
    setSuggestions({ ...suggestions, [rule.id]: [] });
    
    try {
        // A. 紐付いているメニューのslugを取得
        const { data: typeData } = await supabase
            .from('meeting_types')
            .select('slug, duration_minutes')
            .eq('id', rule.meeting_type_id)
            .single();

        if (!typeData) throw new Error("予約メニューが見つかりません");

        // B. 「明日から1週間」の空き枠を検索
        // API/book/slots を再利用して、正確な「全員の空き時間」を取得
        const dates = [];
        const today = new Date();
        for (let i = 1; i <= 7; i++) {
            const d = new Date(today);
            d.setDate(today.getDate() + i);
            dates.push(d.toISOString().split('T')[0]); // YYYY-MM-DD
        }

        const promises = dates.map(async (date) => {
            const res = await fetch(`/api/book/slots?slug=${typeData.slug}&date=${date}`);
            const data = await res.json();
            return { date, slots: data.slots || [] };
        });

        const results = await Promise.all(promises);

        // C. 結果を整形して表示
        const candidates: any[] = [];
        results.forEach(({ date, slots }) => {
            // 各日、早い時間から最大2つピックアップ
            slots.slice(0, 2).forEach((time: string) => {
                // 終了時間を計算
                const [h, m] = time.split(':').map(Number);
                const endDate = new Date();
                endDate.setHours(h, m + typeData.duration_minutes);
                const endTimeStr = endDate.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

                candidates.push({
                    date: date, // 2026-02-01
                    time: `${time}〜${endTimeStr}`, // 10:00〜11:00
                    displayDate: new Date(date).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' })
                });
            });
        });

        if (candidates.length > 0) {
            // 最大5件に絞る
            setSuggestions({ ...suggestions, [rule.id]: candidates.slice(0, 5) });
        } else {
            alert("条件に合う空き時間が見つかりませんでした。\n（全員の予定が埋まっている可能性があります）");
        }

    } catch (error: any) {
        console.error(error);
        alert("実行エラー: " + error.message);
    } finally {
        setRunningRuleId(null);
    }
  };

  // 4. 予定を確定 (Googleカレンダーに登録)
  const confirmEvent = async (suggestion: any, rule: any) => {
      if(!confirm(`${suggestion.displayDate} ${suggestion.time} で確定しますか？\n(関係者全員に招待が飛びます)`)) return;
      
      try {
        // APIには start_time, end_time, slug を送る必要がある
        // calendar/create APIも修正が必要かもしれませんが、
        // いったん簡易的に「仮押さえ(booking_requests) API」を使って実装するか、
        // もしくは既存の calendar/create を使うか。
        // ここでは「既存の book/request」を再利用するのが一番安全です。

        // 時間文字列を分割
        const [startTimeStr] = suggestion.time.split('〜');
        
        // 予約リクエスト送信 (自分の名前で自分たちのアポを取る)
        const { data: typeData } = await supabase
            .from('meeting_types')
            .select('slug')
            .eq('id', rule.meeting_type_id)
            .single();

        const res = await fetch('/api/book/request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                slug: typeData?.slug,
                date: suggestion.date,
                time: startTimeStr,
                guest_name: '社内自動調整', // 内部用
                guest_email: session.user.email, // 自分のメアド
                note: `自動調整ルール: ${rule.title} による作成`
            })
        });

        if (res.ok) {
            alert("🎉 予定を確定し、カレンダーに登録しました！");
            setSuggestions({ ...suggestions, [rule.id]: [] }); // 候補を消す
        } else {
            const err = await res.json();
            alert("作成失敗: " + err.error);
        }
      } catch (e) {
          alert("通信エラー");
      }
  };

  // --- UIコンポーネント ---

  const RuleForm = () => (
      <div className="bg-white p-4 rounded-lg border border-purple-200 shadow-sm mb-4 animate-in fade-in slide-in-from-top-2">
          <div className="mb-3">
              <label className="text-xs font-bold text-gray-500 block mb-1">会議名</label>
              <input 
                type="text" 
                value={formData.title} 
                onChange={e => setFormData({...formData, title: e.target.value})} 
                className="w-full text-sm border border-gray-300 rounded p-2"
                placeholder="例: 週次定例MTG"
              />
          </div>
          
          <div className="grid grid-cols-2 gap-4 mb-3">
            <div>
                <label className="text-xs font-bold text-gray-500 block mb-1">使用する予約メニュー</label>
                <select 
                    value={formData.meetingTypeId} 
                    onChange={e => setFormData({...formData, meetingTypeId: e.target.value})}
                    className="w-full text-sm border border-gray-300 rounded p-2 bg-white"
                >
                    <option value="">-- 選択してください --</option>
                    {meetingTypes.map(m => (
                        <option key={m.id} value={m.id}>
                            {m.title} ({m.duration_minutes}分)
                        </option>
                    ))}
                </select>
                {meetingTypes.length === 0 && <p className="text-xs text-red-500 mt-1">※先に「予約メニュー」を作成してください</p>}
            </div>
            <div>
                <label className="text-xs font-bold text-purple-600 block mb-1">毎月のリマインド日</label>
                <input 
                    type="number" 
                    value={formData.targetDay} 
                    onChange={e => setFormData({...formData, targetDay: e.target.value})} 
                    className="w-full text-sm border border-purple-300 bg-purple-50 rounded p-2 font-bold"
                />
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-4">
              <button 
                onClick={() => { setIsAdding(false); setEditingId(null); }} 
                className="text-xs text-gray-500 px-3 py-2"
              >
                キャンセル
              </button>
              <button 
                onClick={handleSave} 
                disabled={loading} 
                className="text-xs bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 font-bold flex items-center gap-1"
              >
                {loading ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>}
                保存する
              </button>
          </div>
      </div>
  );

  return (
    <div className="max-w-2xl mt-4 mb-20">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-gray-600 flex items-center gap-2">
            登録済みルール一覧
        </h3>
        {!isAdding && !editingId && (
            <button 
                onClick={() => { 
                    setFormData({ title: '', targetDay: '25', meetingTypeId: '' }); 
                    setIsAdding(true); 
                }}
                className="text-xs bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 px-3 py-1.5 rounded-full flex items-center gap-1 transition font-bold"
            >
                <Plus size={14}/> 新規ルール作成
            </button>
        )}
      </div>

      {isAdding && !editingId && <RuleForm />}

      <div className="space-y-4">
          {rules.length === 0 && !isAdding && (
              <p className="text-sm text-gray-400 text-center py-8 border border-dashed rounded-lg bg-gray-50">
                  まだルールがありません。<br/>「新規ルール作成」から追加してください。
              </p>
          )}

          {rules.map((rule) => {
              const isDueToday = todayDate === rule.target_day;
              
              if (editingId === rule.id) return <RuleForm key={rule.id} />;

              return (
                <div key={rule.id} className={`rounded-lg border overflow-hidden shadow-sm transition ${isDueToday ? 'border-yellow-400 bg-yellow-50 ring-2 ring-yellow-200' : 'border-gray-200 bg-white'}`}>
                    <div className="p-4 flex items-center justify-between">
                        <div className="flex-1">
                            <div className="font-bold text-gray-800 flex items-center gap-2">
                                {rule.title}
                                {isDueToday && (
                                    <span className="text-[10px] bg-yellow-400 text-white px-2 py-0.5 rounded-full flex items-center gap-1 animate-pulse"><Briefcase size={10}/> 今日が実行日</span>
                                )}
                            </div>
                            <div className="text-xs text-gray-500 mt-1 flex flex-wrap gap-2 items-center">
                                {rule.meeting_types ? (
                                    <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-100">
                                        設定: {rule.meeting_types.title} ({rule.meeting_types.duration_minutes}分)
                                    </span>
                                ) : (
                                    <span className="text-red-400">※予約メニュー未設定</span>
                                )}
                                <span className="text-gray-400">|</span>
                                <span>毎月{rule.target_day}日リマインド</span>
                            </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                            <button onClick={() => startEdit(rule)} className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-gray-100 rounded transition"><Pencil size={16}/></button>
                            <button onClick={() => handleDelete(rule.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition"><Trash2 size={16}/></button>
                            
                            <button 
                                onClick={() => runRule(rule)}
                                disabled={runningRuleId === rule.id}
                                className={`ml-2 flex items-center gap-1 border px-3 py-1.5 rounded-full text-xs font-bold transition shadow-sm ${isDueToday ? 'bg-purple-600 text-white border-purple-600 hover:bg-purple-700' : 'bg-white text-purple-600 border-purple-200 hover:bg-purple-50'}`}
                            >
                                {runningRuleId === rule.id ? <Loader2 size={14} className="animate-spin"/> : <Play size={14} fill="currentColor" />}
                                <span className="hidden sm:inline">自動調整を実行</span>
                            </button>
                        </div>
                    </div>
                    
                    {/* 実行結果 (候補リスト) */}
                    {suggestions[rule.id] && suggestions[rule.id].length > 0 && (
                        <div className="p-4 bg-purple-50 border-t border-purple-100 animate-in fade-in">
                            <div className="text-xs font-bold text-purple-800 mb-2 flex items-center gap-1">
                                <CalendarClock size={14}/> 
                                全員が参加可能な候補日 (直近1週間):
                            </div>
                            <div className="space-y-2">
                                {suggestions[rule.id].map((s: any, i: number) => (
                                    <div key={i} className="flex items-center justify-between bg-white p-3 rounded border border-purple-100 hover:border-purple-300 transition shadow-sm">
                                        <div className="text-sm">
                                            <span className="font-bold text-gray-800 mr-2">{s.displayDate}</span>
                                            <span className="text-purple-700 font-medium">{s.time}</span>
                                        </div>
                                        <button 
                                            onClick={() => confirmEvent(s, rule)} 
                                            className="text-xs bg-purple-600 text-white px-3 py-1.5 rounded hover:bg-purple-700 font-bold flex items-center gap-1"
                                        >
                                            <Check size={14}/> 確定
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
              );
          })}
      </div>
    </div>
  );
}