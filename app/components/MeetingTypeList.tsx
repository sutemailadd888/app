'use client';

import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Link as LinkIcon, Users, Clock, Copy, Check, Lock, Building2 } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Props {
  workspaceId: string;
  userId: string;
  isInternal?: boolean; // ★追加: これが true なら社内用モード
}

export default function MeetingTypeList({ workspaceId, userId, isInternal = false }: Props) {
  const [types, setTypes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // 新規作成フォーム
  const [isCreating, setIsCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDuration, setNewDuration] = useState('60');
  const [newSlug, setNewSlug] = useState(''); // 社内用なら自動生成でもOK
  const [newMethod, setNewMethod] = useState('and'); 

  // メンバー選択用
  const [members, setMembers] = useState<any[]>([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([userId]); // 自分はデフォルト選択

  useEffect(() => {
    fetchTypes();
    fetchMembers();
  }, [workspaceId, isInternal]);

  const fetchTypes = async () => {
    const { data } = await supabase
      .from('meeting_types')
      .select('*, meeting_hosts(user_id)')
      .eq('workspace_id', workspaceId)
      .eq('is_internal', isInternal) // ★重要: フラグでフィルタリング
      .eq('is_active', true)
      .order('created_at');
    if (data) setTypes(data);
  };

  const fetchMembers = async () => {
    // ワークスペースのメンバー一覧を取得
    const { data } = await supabase
        .from('workspace_members')
        .select(`
            user_id,
            role,
            user: user_id ( email ) 
        `) // user_metadataは取れないことがあるのでemailで代用
        .eq('workspace_id', workspaceId);
    
    if (data) setMembers(data);
  };

  const handleCreate = async () => {
    if (!newTitle) return alert('タイトルを入力してください');
    
    // 社内用の場合はSlugを適当に自動生成する（URLとして使わないため）
    const finalSlug = isInternal 
        ? `internal-${Date.now()}` 
        : (newSlug || `meet-${Date.now()}`);

    setLoading(true);
    try {
      // 1. meeting_types作成
      const { data: typeData, error } = await supabase
        .from('meeting_types')
        .insert([{
          workspace_id: workspaceId,
          title: newTitle,
          slug: finalSlug,
          duration_minutes: parseInt(newDuration),
          booking_method: newMethod,
          is_internal: isInternal, // ★フラグ保存
          is_active: true
        }])
        .select()
        .single();

      if (error) throw error;

      // 2. meeting_hosts作成 (誰が参加するか)
      const hostsData = selectedMemberIds.map(uid => ({
          meeting_type_id: typeData.id,
          user_id: uid
      }));

      const { error: hostError } = await supabase
          .from('meeting_hosts')
          .insert(hostsData);
      
      if (hostError) throw hostError;

      setIsCreating(false);
      setNewTitle('');
      setNewSlug('');
      setSelectedMemberIds([userId]);
      fetchTypes();

    } catch (e: any) {
      console.error(e);
      alert('作成失敗: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if(!confirm('削除しますか？')) return;
    await supabase.from('meeting_types').delete().eq('id', id);
    fetchTypes();
  };

  const copyLink = (slug: string, id: string) => {
    const url = `${window.location.origin}/book/${slug}`;
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleMember = (uid: string) => {
      if (selectedMemberIds.includes(uid)) {
          setSelectedMemberIds(selectedMemberIds.filter(id => id !== uid));
      } else {
          setSelectedMemberIds([...selectedMemberIds, uid]);
      }
  };

  return (
    <div className="mt-4">
      {/* リスト表示 */}
      <div className="space-y-3">
        {types.length === 0 && !isCreating && (
            <div className="text-center py-6 border border-dashed rounded-lg bg-white">
                <p className="text-sm text-gray-400 mb-2">
                    {isInternal ? '社内会議のテンプレートがありません' : '予約メニューがありません'}
                </p>
                <button onClick={() => setIsCreating(true)} className="text-sm text-purple-600 font-bold hover:underline">
                    + 新規作成
                </button>
            </div>
        )}

        {types.map(t => (
            <div key={t.id} className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-xl shadow-sm hover:border-purple-300 transition group">
                <div>
                    <div className="font-bold text-gray-800 flex items-center gap-2">
                        {t.title}
                        {isInternal && <Lock size={12} className="text-gray-400"/>}
                    </div>
                    <div className="text-xs text-gray-500 flex items-center gap-3 mt-1">
                        <span className="flex items-center gap-1"><Clock size={12}/> {t.duration_minutes}分</span>
                        <span className="flex items-center gap-1">
                            <Users size={12}/> 
                            {t.meeting_hosts?.length || 0}名参加 
                            ({t.booking_method === 'and' ? '全員' : '誰か1人'})
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {/* 外部用のみコピーボタンを表示 */}
                    {!isInternal && (
                        <button 
                            onClick={() => copyLink(t.slug, t.id)}
                            className={`p-2 rounded-lg transition text-xs font-bold flex items-center gap-1 ${copiedId === t.id ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                        >
                            {copiedId === t.id ? <Check size={14}/> : <LinkIcon size={14}/>}
                            {copiedId === t.id ? 'Copied' : 'Copy URL'}
                        </button>
                    )}
                    <button onClick={() => handleDelete(t.id)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition">
                        <Trash2 size={16}/>
                    </button>
                </div>
            </div>
        ))}
      </div>

      {/* 新規作成ボタン & フォーム */}
      {!isCreating ? (
        types.length > 0 && (
            <button 
                onClick={() => setIsCreating(true)}
                className="w-full mt-3 py-2 border border-dashed border-gray-300 text-gray-500 rounded-lg hover:bg-gray-50 hover:text-purple-600 hover:border-purple-300 transition text-sm flex items-center justify-center gap-2"
            >
                <Plus size={16}/> {isInternal ? 'テンプレートを追加' : 'メニューを追加'}
            </button>
        )
      ) : (
        <div className="mt-4 p-4 bg-purple-50 rounded-xl border border-purple-100 animate-in fade-in slide-in-from-top-2">
            <h4 className="text-sm font-bold text-purple-800 mb-3">
                {isInternal ? '新規テンプレート作成 (社内用)' : '新規メニュー作成 (公開用)'}
            </h4>
            
            <div className="space-y-3">
                <div>
                    <label className="text-xs font-bold text-gray-500 block mb-1">タイトル</label>
                    <input 
                        type="text" 
                        value={newTitle} 
                        onChange={e => setNewTitle(e.target.value)} 
                        className="w-full text-sm p-2 rounded border border-gray-300 focus:ring-2 focus:ring-purple-200 outline-none"
                        placeholder={isInternal ? "例: 開発定例MTG" : "例: 60分オンライン面談"}
                    />
                </div>

                {/* 外部用の場合のみURL設定を表示 */}
                {!isInternal && (
                    <div>
                        <label className="text-xs font-bold text-gray-500 block mb-1">URL (Slug)</label>
                        <div className="flex items-center">
                            <span className="text-xs text-gray-400 bg-gray-100 p-2 border border-r-0 border-gray-300 rounded-l">/book/</span>
                            <input 
                                type="text" 
                                value={newSlug} 
                                onChange={e => setNewSlug(e.target.value)} 
                                className="w-full text-sm p-2 rounded-r border border-gray-300 focus:ring-2 focus:ring-purple-200 outline-none"
                                placeholder="interview-60"
                            />
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="text-xs font-bold text-gray-500 block mb-1">所要時間 (分)</label>
                        <input type="number" value={newDuration} onChange={e => setNewDuration(e.target.value)} className="w-full text-sm p-2 rounded border border-gray-300"/>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 block mb-1">担当者ルール</label>
                        <select value={newMethod} onChange={e => setNewMethod(e.target.value)} className="w-full text-sm p-2 rounded border border-gray-300 bg-white">
                            <option value="and">全員参加 (AND)</option>
                            <option value="or">誰か1人 (OR)</option>
                        </select>
                    </div>
                </div>

                <div>
                    <label className="text-xs font-bold text-gray-500 block mb-1">参加メンバーを選択</label>
                    <div className="flex flex-wrap gap-2">
                        {members.map(m => {
                            const isSelected = selectedMemberIds.includes(m.user_id);
                            // 自分の名前は "自分" と表示したいが、簡易的にメアドの一部などを表示
                            const name = m.user_id === userId ? '自分' : (m.user?.email?.split('@')[0] || 'Member');
                            
                            return (
                                <button
                                    key={m.user_id}
                                    onClick={() => toggleMember(m.user_id)}
                                    className={`text-xs px-2 py-1 rounded border transition ${isSelected ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                                >
                                    {name}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => setIsCreating(false)} className="text-xs text-gray-500 px-3 py-2 hover:bg-gray-100 rounded">キャンセル</button>
                <button onClick={handleCreate} disabled={loading} className="text-xs bg-purple-600 text-white px-4 py-2 rounded font-bold hover:bg-purple-700 flex items-center gap-1">
                    {loading ? '作成中...' : <Check size={14}/>}
                    <span>保存</span>
                </button>
            </div>
        </div>
      )}
    </div>
  );
}