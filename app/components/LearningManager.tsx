'use client';

import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { BookOpen, Plus, Play, MoreVertical, Loader2 } from 'lucide-react';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Props {
    workspaceId: string;
    userId: string;
}

export default function LearningManager({ workspaceId, userId }: Props) {
   const [decks, setDecks] = useState<any[]>([]);
   const [loading, setLoading] = useState(true);

   useEffect(() => {
       if(workspaceId) fetchDecks();
   }, [workspaceId]);

   const fetchDecks = async () => {
       setLoading(true);
       // デッキ一覧を新しい順に取得
       const { data } = await supabase
        .from('decks')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false });
       
       if (data) setDecks(data);
       setLoading(false);
   };

   const handleCreateDeck = async () => {
       const title = prompt('新しい単語帳（デッキ）の名前を入力してください:\n例: 4月_商品知識テスト');
       if (!title) return;

       const { error } = await supabase.from('decks').insert([{ workspace_id: workspaceId, title }]);
       if (error) {
           alert('作成に失敗しました');
           console.error(error);
       } else {
           fetchDecks();
       }
   };

   if (loading) return <div className="py-20 flex justify-center text-purple-500"><Loader2 className="animate-spin" size={32} /></div>;

   return (
       <div className="bg-white p-6 md:p-8 rounded-2xl border border-gray-200 shadow-sm animate-in fade-in">
           <div className="flex justify-between items-center mb-8 border-b border-gray-100 pb-4">
               <div>
                   <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                       <BookOpen className="text-purple-600" />
                       学習デッキ一覧
                   </h2>
                   <p className="text-sm text-gray-500 mt-1">
                       AIを活用したあなた専用の記憶定着システム（SRS）です。
                   </p>
               </div>
               <button 
                   onClick={handleCreateDeck} 
                   className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition shadow-sm"
               >
                   <Plus size={18} /> <span className="hidden sm:inline">新規デッキ</span>
               </button>
           </div>

           {decks.length === 0 ? (
               <div className="text-center py-16 bg-purple-50/50 rounded-2xl border-2 border-dashed border-purple-100">
                   <BookOpen className="mx-auto text-purple-200 mb-3" size={40} />
                   <h3 className="font-bold text-purple-900 mb-1">まだデッキがありません</h3>
                   <p className="text-gray-500 text-sm">右上のボタンから最初のデッキを作成してください。</p>
               </div>
           ) : (
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                   {decks.map(deck => (
                       <div key={deck.id} className="border border-gray-200 p-5 rounded-2xl hover:border-purple-400 hover:shadow-md transition group flex flex-col justify-between h-40 bg-gradient-to-br from-white to-gray-50">
                           <div className="flex justify-between items-start">
                               <h3 className="font-bold text-gray-800 text-lg leading-tight group-hover:text-purple-700 transition">{deck.title}</h3>
                               <button className="text-gray-400 hover:text-gray-700 p-1"><MoreVertical size={16}/></button>
                           </div>
                           
                           <div className="flex justify-between items-end mt-4">
                               <div className="text-xs text-gray-500 font-medium bg-white px-2 py-1 border border-gray-100 rounded-lg">
                                   <div>全カード: <span className="text-gray-800">0</span> 枚</div>
                                   <div className="text-purple-600">復習待ち: 0 枚</div>
                               </div>
                               <button className="bg-purple-100 text-purple-700 hover:bg-purple-600 hover:text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-1 transition shadow-sm">
                                   <Play size={14} fill="currentColor" /> 学習する
                               </button>
                           </div>
                       </div>
                   ))}
               </div>
           )}
       </div>
   );
}
