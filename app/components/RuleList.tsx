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
  const [meetingTypes, setMeetingTypes] = useState<any[]>([]); 
  const [loading, setLoading] = useState(false);
  
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    title: '',
    targetDay: '25',
    meetingTypeId: ''
  });

  const [runningRuleId, setRunningRuleId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<any>({});
  const todayDate = new Date().getDate();

  useEffect(() => {
    fetchData();
  }, [session, orgId]);

  const fetchData = async () => {
    if (!orgId) return;

    try {
      const { data: rulesData } = await supabase
        .from('rules')
        .select(`*, meeting_types ( title, duration_minutes )`)
        .eq('workspace_id', orgId)
        .order('created_at');
      if (rulesData) setRules(rulesData);
    } catch (e) { console.error(e); }

    try {
      // ★社内用テンプレートのみ取得
      const { data: typesData } = await supabase
        .from('meeting_types')
        .select('id, title, duration_minutes')
        .eq('workspace_id', orgId)
        .eq('is_internal', true) 
        .eq('is_active', true);
      if (typesData) setMeetingTypes(typesData);
    } catch (e) { console.error(e); }
  };

  const handleSave = async () => {
    if (!formData.title || !formData.meetingTypeId) {
        alert("会議名とテンプレートを選択してください");
        return;
    }
    setLoading(true);
    try {
      const payload = {
        workspace_id: orgId,
        title: formData.title,
        target_day: parseInt(formData.targetDay),
        meeting_type_id: formData.meetingTypeId,
        prompt_custom: '', 
        attendees: ''
      };

      if (editingId) {
        const { error } = await supabase.from('rules').update(payload).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('rules').insert(payload);
        if (error) throw error;
      }
      setIsAdding(false);
      setEditingId(null);
      setFormData({ title: '', targetDay: '25', meetingTypeId: '' });
      fetchData();
    } catch (e: any) {
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

  const runRule = async (rule: any) => {
    if (!rule.meeting_type_id) {
        alert("テンプレートが紐付いていません。");
        return;
    }
    setRunningRuleId(rule.id);
    setSuggestions({ ...suggestions, [rule.id]: [] });
    
    try {
        const { data: typeData } = await supabase
            .from('meeting_types')
            .select('slug, duration_minutes')
            .eq('id', rule.meeting_type_id)
            .single();

        if (!typeData) throw new Error("テンプレートが見つかりません");

        const dates = [];
        const today = new Date();
        for (let i = 1; i <= 7; i++) {
            const d = new Date(today);
            d.setDate(today.getDate() + i);
            dates.push(d.toISOString().split('T')[0]);
        }

        const promises = dates.map(async (date) => {
            const res = await fetch(`/api/book/slots?slug=${typeData.slug}&date=${date}`);
            const data = await res.json();
            return { date, slots: data.slots || [] };
        });
        const results = await Promise.all(promises);

        const candidates: any[] = [];
        results.forEach(({ date, slots }) => {
            slots.slice(0, 2).forEach((time: string) => {
                const [h, m] = time.split(':').map(Number);
                const endDate = new Date();
                endDate.setHours(h, m + typeData.duration_minutes);
                const endTimeStr = endDate.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

                candidates.push({
                    date: date, 
                    time: `${time}〜${endTimeStr}`, 
                    displayDate: new Date(date).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' })
                });
            });
        });

        if (candidates.length > 0) {
            setSuggestions({ ...suggestions, [rule.id]: candidates.slice(0, 5) });
        } else {
            alert("条件に合う空き時間が見つかりませんでした。");
        }
    } catch (error: any) {
        alert("実行エラー: " + error.message);
    } finally {
        setRunningRuleId(null);
    }
  };

  const confirmEvent = async (suggestion: any, rule: any) => {
      if(!confirm(`${suggestion.displayDate} ${suggestion.time} で確定しますか？`)) return;
      try {
        const [startTimeStr] = suggestion.time.split('〜');
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
                guest_name: '社内自動調整', 
                guest_email: session.user.email,
                note: `自動調整ルール: ${rule.title}`
            })
        });

        if (res.ok) {
            alert("🎉 予定を確定しました！");
            setSuggestions({ ...suggestions, [rule.id]: [] });
        } else {
            const err = await res.json();
            alert("作成失敗: " + err.error);
        }
      } catch (e) {
          alert("通信エラー");
      }
  };

  const RuleForm = () => (
      <div className="bg-white p-4 rounded-lg border border-purple-200 shadow-sm mb-4 animate-in fade-in slide-in-from-top-2">
          <div className="mb-3">
              <label className="text-xs font-bold text-gray-500 block mb-1">会議名</label>
              <input type="text" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full text-sm border border-gray-300 rounded p-2"/>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-3">
            <div>
                <label className="text-xs font-bold text-gray-500 block mb-1">使用するテンプレート</label>
                <select value={formData.meetingTypeId} onChange={e => setFormData({...formData, meetingTypeId: e.target.value})} className="w-full text-sm border border-gray-300 rounded p-2 bg-white">
                    <option value="">-- 選択 --</option>
                    {meetingTypes.map(m => (
                        <option key={m.id} value={m.id}>{m.title} ({m.duration_minutes}分)</option>
                    ))}
                </select>
                {meetingTypes.length === 0 && <p className="text-xs text-red-500 mt-1">※先にテンプレートを作成してください</p>}
            </div>
            <div>
                <label className="text-xs font-bold text-purple-600 block mb-1">リマインド日</label>
                <input type="number" value={formData.targetDay} onChange={e => setFormData({...formData, targetDay: e.target.value})} className="w-full text-sm border border-purple-300 bg-purple-50 rounded p-2 font-bold"/>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => { setIsAdding(false); setEditingId(null); }} className="text-xs text-gray-500 px-3 py-2">キャンセル</button>
              <button onClick={handleSave} disabled={loading} className="text-xs bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700 font-bold flex items-center gap-1">
                {loading ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>} 保存
              </button>
          </div>
      </div>
  );

  return (
    <div className="max-w-2xl mt-4 mb-20">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-gray-600">登録済みルール一覧</h3>
        {!isAdding && !editingId && (
            <button onClick={() => { setFormData({ title: '', targetDay: '25', meetingTypeId: '' }); setIsAdding(true); }} className="text-xs bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 px-3 py-1.5 rounded-full flex items-center gap-1 transition font-bold">
                <Plus size={14}/> 新規ルール作成
            </button>
        )}
      </div>
      {isAdding && !editingId && <RuleForm />}
      <div className="space-y-4">
          {rules.length === 0 && !isAdding && <p className="text-sm text-gray-400 text-center py-8 border border-dashed rounded-lg bg-gray-50">ルールがありません</p>}
          {rules.map((rule) => {
              const isDueToday = todayDate === rule.target_day;
              if (editingId === rule.id) return <RuleForm key={rule.id} />;
              return (
                <div key={rule.id} className={`rounded-lg border overflow-hidden shadow-sm transition ${isDueToday ? 'border-yellow-400 bg-yellow-50 ring-2 ring-yellow-200' : 'border-gray-200 bg-white'}`}>
                    <div className="p-4 flex items-center justify-between">
                        <div className="flex-1">
                            <div className="font-bold text-gray-800 flex items-center gap-2">
                                {rule.title}
                                {isDueToday && <span className="text-[10px] bg-yellow-400 text-white px-2 py-0.5 rounded-full flex items-center gap-1 animate-pulse"><Briefcase size={10}/> 今日が実行日</span>}
                            </div>
                            <div className="text-xs text-gray-500 mt-1 flex flex-wrap gap-2 items-center">
                                {rule.meeting_types ? <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-100">設定: {rule.meeting_types.title}</span> : <span className="text-red-400">※テンプレート未設定</span>}
                                <span className="text-gray-400">|</span><span>毎月{rule.target_day}日</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={() => startEdit(rule)} className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-gray-100 rounded transition"><Pencil size={16}/></button>
                            <button onClick={() => handleDelete(rule.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition"><Trash2 size={16}/></button>
                            <button onClick={() => runRule(rule)} disabled={runningRuleId === rule.id} className={`ml-2 flex items-center gap-1 border px-3 py-1.5 rounded-full text-xs font-bold transition shadow-sm ${isDueToday ? 'bg-purple-600 text-white border-purple-600 hover:bg-purple-700' : 'bg-white text-purple-600 border-purple-200 hover:bg-purple-50'}`}>
                                {runningRuleId === rule.id ? <Loader2 size={14} className="animate-spin"/> : <Play size={14} fill="currentColor" />}
                                <span className="hidden sm:inline">実行</span>
                            </button>
                        </div>
                    </div>
                    {suggestions[rule.id] && suggestions[rule.id].length > 0 && (
                        <div className="p-4 bg-purple-50 border-t border-purple-100 animate-in fade-in">
                            <div className="text-xs font-bold text-purple-800 mb-2 flex items-center gap-1"><CalendarClock size={14}/> 候補日 (直近1週間):</div>
                            <div className="space-y-2">
                                {suggestions[rule.id].map((s: any, i: number) => (
                                    <div key={i} className="flex items-center justify-between bg-white p-3 rounded border border-purple-100 hover:border-purple-300 transition shadow-sm">
                                        <div className="text-sm"><span className="font-bold text-gray-800 mr-2">{s.displayDate}</span><span className="text-purple-700 font-medium">{s.time}</span></div>
                                        <button onClick={() => confirmEvent(s, rule)} className="text-xs bg-purple-600 text-white px-3 py-1.5 rounded hover:bg-purple-700 font-bold flex items-center gap-1"><Check size={14}/> 確定</button>
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