// app/components/WorkspaceSwitcher.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Plus, Building2, User } from 'lucide-react';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Props {
  session: any;
  currentOrgId: string | null;
  onSwitch: (org: any) => void;
}

export default function WorkspaceSwitcher({ session, currentOrgId, onSwitch }: Props) {
  const [orgs, setOrgs] = useState<any[]>([]);

  useEffect(() => {
    fetchOrgs();
  }, [session]);

  const fetchOrgs = async () => {
    if (!session?.user?.id) return;
    
    // 中間テーブルを経由して、自分が所属する組織を取得
    const { data: members, error } = await supabase
        .from('organization_members')
        .select(`
            organization_id,
            organizations ( id, name )
        `)
        .eq('user_id', session.user.id);

    if (error) console.error(error);
    
    // データ整形
    if (members) {
        const loadedOrgs = members.map((m: any) => m.organizations);
        setOrgs(loadedOrgs);
        
        // もし「現在選択中」がなくて、組織が1つでもあれば、最初のを自動選択
        if (!currentOrgId && loadedOrgs.length > 0) {
            onSwitch(loadedOrgs[0]);
        }
    }
  };

  const handleCreate = async () => {
    const name = prompt("新しいワークスペースの名前を入力してください");
    if (!name) return;

    // 1. 組織作成
    const { data: newOrg, error: orgError } = await supabase
        .from('organizations')
        .insert([{ name: name, created_by: session.user.id }])
        .select()
        .single();

    if (orgError) return alert(orgError.message);

    // 2. メンバー追加 (自分)
    const { error: memberError } = await supabase
        .from('organization_members')
        .insert([{ organization_id: newOrg.id, user_id: session.user.id, role: 'admin' }]);

    if (memberError) return alert(memberError.message);

    // リスト更新
    fetchOrgs();
  };

  return (
    <div className="w-[70px] bg-gray-900 flex flex-col items-center py-6 gap-4 text-white shrink-0">
        {/* ロゴ的なもの */}
        <div className="mb-4 font-black text-xl tracking-tighter bg-gradient-to-br from-purple-400 to-blue-400 bg-clip-text text-transparent">
            GH
        </div>

        {/* ワークスペース一覧 */}
        {orgs.map((org) => {
            const isActive = currentOrgId === org.id;
            // 頭文字を取得 (例: "My Space" -> "M")
            const initial = org.name.charAt(0).toUpperCase();

            return (
                <div key={org.id} className="relative group">
                    {/* 選択中の白いバー */}
                    {isActive && (
                        <div className="absolute -left-4 top-1/2 -translate-y-1/2 w-2 h-10 bg-white rounded-r-lg" />
                    )}
                    
                    <button
                        onClick={() => onSwitch(org)}
                        className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold transition-all duration-200 overflow-hidden
                            ${isActive 
                                ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/50' 
                                : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white hover:rounded-lg'
                            }`}
                        title={org.name}
                    >
                        {initial}
                    </button>
                    
                    {/* ホバー時のツールチップ */}
                    <div className="absolute left-14 top-1/2 -translate-y-1/2 bg-black text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity ml-2">
                        {org.name}
                    </div>
                </div>
            );
        })}

        {/* 新規作成ボタン */}
        <button 
            onClick={handleCreate}
            className="w-12 h-12 rounded-full border-2 border-dashed border-gray-700 text-gray-500 hover:text-white hover:border-white hover:bg-gray-800 flex items-center justify-center transition mt-2"
            title="新しいワークスペースを作成"
        >
            <Plus size={24} />
        </button>
    </div>
  );
}