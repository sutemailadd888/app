'use client';

import React, { useEffect, useState } from 'react';
import { Users, UserPlus, Mail, Shield, Trash2, Loader2 } from 'lucide-react';

interface Props {
  orgId: string; // ワークスペースID
}

export default function MemberSettings({ orgId }: Props) {
  const [members, setMembers] = useState<any[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
    fetchMembers();
  }, [orgId]);

  const fetchMembers = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/members?workspace_id=${orgId}`);
      const data = await res.json();
      if (data.members) setMembers(data.members);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) return;
    
    setInviting(true);
    try {
      const res = await fetch('/api/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: orgId,
          email: inviteEmail
        })
      });

      const data = await res.json();

      if (res.ok) {
        alert(`✅ ${inviteEmail} を招待しました！`);
        setInviteEmail('');
        fetchMembers(); // リスト更新
      } else {
        alert(`❌ エラー: ${data.error}`);
      }
    } catch (e) {
      alert("通信エラーが発生しました");
    } finally {
      setInviting(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-8">
      <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
        <Users className="text-blue-600" />
        チームメンバー管理
      </h3>

      {/* 招待フォーム */}
      <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 mb-6">
        <form onSubmit={handleInvite} className="flex gap-2">
          <div className="relative flex-1">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-400" size={18} />
            <input 
              type="email" 
              placeholder="招待したい人のメールアドレス (例: member@example.com)" 
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
              required
            />
          </div>
          <button 
            type="submit" 
            disabled={inviting}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 whitespace-nowrap"
          >
            {inviting ? <Loader2 className="animate-spin" size={16}/> : <UserPlus size={16}/>}
            招待する
          </button>
        </form>
        <p className="text-xs text-blue-600 mt-2 ml-1">
          ※ 相手がすでにこのアプリにアカウント登録している必要があります。
        </p>
      </div>

      {/* メンバーリスト */}
      <div className="space-y-3">
        {loading ? (
           <p className="text-center text-gray-400 text-sm py-4">読み込み中...</p>
        ) : (
          members.map((member) => (
            <div key={member.user_id} className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg border border-transparent hover:border-gray-100 transition">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center text-gray-600 font-bold text-xs">
                  {member.email.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="text-sm font-bold text-gray-800">{member.email}</div>
                  <div className="text-xs text-gray-500 flex items-center gap-1">
                    {member.role === 'owner' ? (
                      <span className="flex items-center gap-1 text-orange-500 font-bold bg-orange-50 px-1.5 rounded"><Shield size={10}/> オーナー</span>
                    ) : (
                      <span className="bg-gray-100 px-1.5 rounded">メンバー</span>
                    )}
                  </div>
                </div>
              </div>
              
              {/* 自分以外なら削除ボタンを表示（将来的な実装用） */}
              {member.role !== 'owner' && (
                <button className="text-gray-300 hover:text-red-500 p-2 transition" title="メンバーから外す">
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}