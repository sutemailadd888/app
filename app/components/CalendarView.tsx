// app/components/CalendarView.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Calendar as CalIcon } from 'lucide-react';

interface Props {
  session: any;
}

export default function CalendarView({ session }: Props) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // カレンダーの日付計算
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth(); // 0-11
  
  // その月の1日が何曜日か (0:日, 1:月...)
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  // その月が何日あるか
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // 表示する日付配列を作る (空白埋め + 日付)
  const calendarDays = [];
  for (let i = 0; i < firstDayOfWeek; i++) {
    calendarDays.push(null); // 空白セル
  }
  for (let i = 1; i <= daysInMonth; i++) {
    calendarDays.push(new Date(year, month, i));
  }

  useEffect(() => {
    fetchEvents();
  }, [currentDate, session]);

  const fetchEvents = async () => {
    const token = session?.provider_token || session?.access_token;
    if (!token) return;

    setLoading(true);
    
    // 月初と月末のISO日時を計算
    const startOfMonth = new Date(year, month, 1);
    const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59);

    try {
      const res = await fetch(
        `/api/calendar/list?timeMin=${startOfMonth.toISOString()}&timeMax=${endOfMonth.toISOString()}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      if (data.events) setEvents(data.events);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const changeMonth = (diff: number) => {
    setCurrentDate(new Date(year, month + diff, 1));
  };

  // 指定した日付にあるイベントをフィルタリング
  const getEventsForDay = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
    return events.filter(e => {
        // start.dateTime (通常) か start.date (終日) を見る
        const start = e.start.dateTime || e.start.date;
        return start.startsWith(dateStr);
    });
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden mb-8">
      {/* ヘッダー: 年月操作 */}
      <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
        <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2">
            <CalIcon className="text-purple-600" size={20}/>
            {year}年 {month + 1}月
        </h3>
        <div className="flex gap-2">
            <button onClick={() => changeMonth(-1)} className="p-1 hover:bg-gray-200 rounded transition"><ChevronLeft/></button>
            <button onClick={() => changeMonth(1)} className="p-1 hover:bg-gray-200 rounded transition"><ChevronRight/></button>
        </div>
      </div>

      {/* カレンダーグリッド */}
      <div className="p-4">
        {/* 曜日ヘッダー */}
        <div className="grid grid-cols-7 mb-2 text-center">
            {['日', '月', '火', '水', '木', '金', '土'].map((d, i) => (
                <div key={i} className={`text-xs font-bold ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-400'}`}>
                    {d}
                </div>
            ))}
        </div>

        {/* 日付セル */}
        {loading && events.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-gray-400 gap-2"><Loader2 className="animate-spin"/> 読み込み中...</div>
        ) : (
            <div className="grid grid-cols-7 gap-1 md:gap-2">
                {calendarDays.map((date, i) => {
                    if (!date) return <div key={i} className="h-24 md:h-32 bg-gray-50/50 rounded-lg"></div>; // 空白
                    
                    const dayEvents = getEventsForDay(date);
                    const isToday = new Date().toDateString() === date.toDateString();

                    return (
                        <div key={i} className={`h-24 md:h-32 border rounded-lg p-1 md:p-2 overflow-hidden flex flex-col relative ${isToday ? 'bg-purple-50 border-purple-200' : 'border-gray-100 bg-white'}`}>
                            <div className={`text-xs font-bold mb-1 ${isToday ? 'text-purple-700' : 'text-gray-700'}`}>
                                {date.getDate()}
                            </div>
                            
                            {/* イベントリスト (スクロール可能) */}
                            <div className="flex-1 overflow-y-auto space-y-1 scrollbar-hide">
                                {dayEvents.map((ev: any) => (
                                    <div key={ev.id} className="text-[10px] bg-blue-100 text-blue-800 px-1 py-0.5 rounded truncate border-l-2 border-blue-500 cursor-pointer hover:opacity-80" title={ev.summary}>
                                        {ev.start.dateTime ? ev.start.dateTime.slice(11, 16) : '終日'} {ev.summary}
                                    </div>
                                ))}
                                {dayEvents.length === 0 && (
                                    <div className="h-full flex items-center justify-center">
                                        <div className="w-1 h-1 rounded-full bg-gray-200"></div>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        )}
      </div>
    </div>
  );
}