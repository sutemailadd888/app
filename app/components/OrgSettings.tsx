'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Save, Loader2, CheckCircle } from 'lucide-react';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Props {
  session: any;
  orgId: string;
}

export default function OrgSettings({ session, orgId }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // デフォルト設定
  const [config, setConfig] = useState<any>({
    monday: { active: true, start: '10:00', end: '18:00' },
    tuesday: { active: true, start: '10:00', end: '18:00' },
    wednesday: { active: true, start: '10:00', end: '18:00' },
    thursday: { active: true, start: '10:00', end: '18:00' },
    friday: { active: true, start: '10:00', end: '18:00' },
    saturday: { active: false, start: '10:00', end: '18:00' },
    sunday: { active: false, start: '10:00', end: '18:00' },
  });

  useEffect(() => {
    fetchSettings();
  }, [orgId]);

  const fetchSettings = async () => {
    setLoading(true);
    // organization_id で設定を取得するように修正
    const { data } = await supabase
      .from('schedule_settings')
      .select('weekly_config')
      .eq('organization_id', orgId)
      .single();

    if (data?.weekly_config) {
      setConfig(data.weekly_config);
    }
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    
    // 現在の設定があるか確認
    const { data: existing } = await supabase
        .from('schedule_settings')
        .select('id')
        .eq('organization_id', orgId)
        .single();

    let error;
    if (existing) {
        // 更新
        const res = await supabase
            .from('schedule_settings')
            .update({ weekly_config: config })
            .eq('organization_id', orgId);
        error = res.error;
    } else {
        // 新規作成
        const res = await supabase
            .from('schedule_settings')
            .insert([{ 
                user_id: session.user.id,
                organization_id: orgId,
                weekly_config: config 
            }]);
        error = res.error;
    }

    if (error) {
        alert('保存に失敗しました');
        console.error(error);
    } else {
        alert('設定を保存しました');
    }
    setSaving(false);
  };

  const days = [
    { key: 'monday', label: '月曜日' },
    { key: 'tuesday', label: '火曜日' },
    { key: 'wednesday', label: '水曜日' },
    { key: 'thursday', label: '木曜日' },
    { key: 'friday', label: '金曜日' },
    { key: 'saturday', label: '土曜日' },
    { key: 'sunday', label: '日曜日' },
  ];

  if (loading) return <div>Loading settings...</div>;

  return (
    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm animate-in fade-in">
      <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
        📅 予約受付設定
      </h3>
      
      <div className="space-y-4">
        {days.map((day) => (
          <div key={day.key} className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
            <div className="w-24 font-bold text-sm text-gray-700">
                <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                        type="checkbox" 
                        checked={config[day.key]?.active}
                        onChange={(e) => setConfig({
                            ...config,
                            [day.key]: { ...config[day.key], active: e.target.checked }
                        })}
                        className="rounded text-purple-600 focus:ring-purple-500"
                    />
                    {day.label}
                </label>
            </div>
            
            {config[day.key]?.active ? (
                <div className="flex items-center gap-2">
                    <input 
                        type="time" 
                        value={config[day.key].start}
                        onChange={(e) => setConfig({
                            ...config,
                            [day.key]: { ...config[day.key], start: e.target.value }
                        })}
                        className="border border-gray-300 rounded px-2 py-1 text-sm"
                    />
                    <span className="text-gray-400">〜</span>
                    <input 
                        type="time" 
                        value={config[day.key].end}
                        onChange={(e) => setConfig({
                            ...config,
                            [day.key]: { ...config[day.key], end: e.target.value }
                        })}
                        className="border border-gray-300 rounded px-2 py-1 text-sm"
                    />
                </div>
            ) : (
                <span className="text-sm text-gray-400">定休日</span>
            )}
          </div>
        ))}
      </div>

      <div className="mt-8 flex justify-end">
        <button 
            onClick={handleSave}
            disabled={saving}
            className="bg-gray-900 text-white px-6 py-2 rounded-lg font-bold hover:bg-gray-800 transition flex items-center gap-2"
        >
            {saving ? <Loader2 className="animate-spin" size={18}/> : <Save size={18}/>}
            設定を保存する
        </button>
      </div>
    </div>
  );
}