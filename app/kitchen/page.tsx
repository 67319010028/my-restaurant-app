"use client";
import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Clock, CheckCircle2, Timer,
  ChefHat, Utensils, ClipboardList
} from 'lucide-react';

// กำหนด Interface เพื่อความปลอดภัยของข้อมูล
interface OrderItem {
  name: string;
  quantity: number;
  isSpecial?: boolean;
  selectedNoodle?: string;
  note?: string;
}

interface Order {
  id: number;
  table_no: string | number;
  created_at: string;
  status: string;
  total_price: number;
  items: OrderItem[];
}

export default function KitchenPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [activeTab, setActiveTab] = useState('ทั้งหมด');

  // ฟังก์ชันเช็คว่าสถานะนี้ถือว่า "ทำเสร็จแล้ว" ในมุมมองของห้องครัวหรือไม่
  const isFinished = (status: string) => status === 'เสร็จแล้ว' || status === 'เรียกเช็คบิล';

  useEffect(() => {
    fetchOrders();
    const channel = supabase
      .channel('kitchen_updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => fetchOrders())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  /* --- Mock Data for Fallback --- */
  const MOCK_ORDERS: Order[] = [
    {
      id: 991,
      table_no: "5",
      created_at: new Date().toISOString(),
      status: "รอ",
      total_price: 350,
      items: [
        { name: "ข้าวกะเพราหมูสับ", quantity: 2, isSpecial: true, note: "ไม่ใส่ถั่วฝักยาว" },
        { name: "น้ำตกหมู", quantity: 1 }
      ]
    },
    {
      id: 992,
      table_no: "3",
      created_at: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
      status: "กำลังทำ",
      total_price: 120,
      items: [
        { name: "ผัดซีอิ๊วทะเล", quantity: 1, selectedNoodle: "เส้นใหญ่" }
      ]
    },
    {
      id: 993,
      table_no: "8",
      created_at: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
      status: "เสร็จแล้ว",
      total_price: 80,
      items: [
        { name: "ข้าวผัดปู", quantity: 1 }
      ]
    }
  ];

  const fetchOrders = async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error) {
        // ถ้า query สำเร็จ ให้ใช้ข้อมูลจริงเสมอ
        setOrders(data || []);
      } else {
        console.warn('Supabase fetch failed, using Mock Data instead:', error);
        setOrders(MOCK_ORDERS);
      }
    } catch (e) {
      console.error("Unexpected error fetching orders:", e);
      setOrders(MOCK_ORDERS);
    }
  };

  const updateStatus = async (id: number, newStatus: string) => {
    // Optimistic Update: Update local state immediately for smooth experience (Demo Mode)
    setOrders(prev => prev.map(o => o.id === id ? { ...o, status: newStatus } : o));

    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: newStatus })
        .eq('id', id);

      if (error) {
        console.warn('Supabase update failed (Demo Mode active):', error);
      }
    } catch (e) {
      console.warn('Supabase update exception (Demo Mode active):', e);
    }
  };

  const filteredOrders = orders.filter(order => {
    // ไม่แสดงออเดอร์ที่ยังไม่ได้รับจากแอดมิน (สถานะ "รอ")
    if (order.status === 'รอ') return false;

    if (activeTab === 'รอ') return order.status === 'กำลังเตรียม';
    if (activeTab === 'กำลังทำ') return order.status === 'กำลังทำ';
    if (activeTab === 'เสร็จแล้ว') return isFinished(order.status);
    if (activeTab === 'ทั้งหมด') return order.status !== 'เสร็จสิ้น' && order.status !== 'รอ';
    return true;
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-gray-100 text-gray-800 pb-10 font-sans">

      {/* Header & Status Summary Row */}
      <header className="p-6 bg-white/80 backdrop-blur-xl sticky top-0 z-10 shadow-lg border-b border-gray-200">
        <div className="flex items-center gap-4 mb-6">
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-3 rounded-2xl shadow-md">
            <ChefHat size={32} className="text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-gray-800">ร้านป้ากุ้ง (ครัว)</h1>
            <p className="text-xs text-gray-500 font-bold uppercase tracking-widest flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
              Kitchen Management System
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white p-4 rounded-2xl border-2 border-orange-200 shadow-sm hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-2">
              <Timer size={20} className="text-orange-500" />
              <div className="text-3xl font-black text-orange-600">{orders.filter(o => o.status === 'กำลังเตรียม').length}</div>
            </div>
            <div className="text-orange-600 text-[11px] font-bold uppercase tracking-wider">รอดำเนินการ</div>
          </div>

          <div className="bg-white p-4 rounded-2xl border-2 border-amber-200 shadow-sm hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-2">
              <ChefHat size={20} className="text-amber-500" />
              <div className="text-3xl font-black text-amber-600">{orders.filter(o => o.status === 'กำลังทำ').length}</div>
            </div>
            <div className="text-amber-600 text-[11px] font-bold uppercase tracking-wider">กำลังทำ</div>
          </div>

          <div className="bg-white p-4 rounded-2xl border-2 border-emerald-200 shadow-sm hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-2">
              <CheckCircle2 size={20} className="text-emerald-500" />
              <div className="text-3xl font-black text-emerald-600">{orders.filter(o => isFinished(o.status)).length}</div>
            </div>
            <div className="text-emerald-600 text-[11px] font-bold uppercase tracking-wider">เสร็จแล้ว</div>
          </div>
        </div>
      </header>

      {/* Tabs Filter */}
      <div className="px-6 flex gap-3 mb-6 overflow-x-auto no-scrollbar py-3">
        {['ทั้งหมด', 'รอ', 'กำลังทำ', 'เสร็จแล้ว'].map((tab) => {
          const count = orders.filter(o => {
            if (tab === 'ทั้งหมด') return o.status !== 'เสร็จสิ้น' && o.status !== 'รอ';
            if (tab === 'รอ') return o.status === 'กำลังเตรียม';
            if (tab === 'กำลังทำ') return o.status === 'กำลังทำ';
            if (tab === 'เสร็จแล้ว') return isFinished(o.status);
            return false;
          }).length;

          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 rounded-xl font-bold text-sm transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === tab
                ? 'bg-blue-500 text-white shadow-md'
                : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
                }`}
            >
              {tab}
              {count > 0 && (
                <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold ${activeTab === tab ? 'bg-white/25' : 'bg-red-100 text-red-600'
                  }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Order Cards List */}
      <main className="px-6 space-y-5 max-w-7xl mx-auto">
        {filteredOrders.length === 0 ? (
          <div className="py-32 text-center">
            <div className="bg-white rounded-3xl p-12 border-2 border-dashed border-gray-200 shadow-sm">
              <ClipboardList size={64} className="text-gray-300 mx-auto mb-4" />
              <p className="text-gray-600 font-bold text-lg">ไม่พบรายการสั่งอาหาร</p>
              <p className="text-gray-400 text-sm mt-2">รอออเดอร์จากแอดมิน...</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredOrders.map((order, index) => (
              <div
                key={order.id}
                className="bg-white rounded-3xl overflow-hidden shadow-lg hover:shadow-xl transition-all hover:scale-[1.02] border border-gray-100 animate-in fade-in slide-in-from-bottom duration-500"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                {/* Header */}
                <div className="p-5 flex justify-between items-center bg-gradient-to-r from-gray-50 to-blue-50 border-b border-gray-100">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl flex items-center justify-center text-2xl font-black text-white shadow-md">
                      {order.table_no}
                    </div>
                    <div>
                      <h3 className="text-gray-800 font-black text-lg">โต๊ะ {order.table_no}</h3>
                      <p className="text-gray-500 text-[11px] font-bold flex items-center gap-1.5">
                        <Clock size={12} />
                        {new Date(order.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>

                  <div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase ${isFinished(order.status)
                    ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                    : order.status === 'กำลังทำ'
                      ? 'bg-amber-100 text-amber-700 border border-amber-200'
                      : 'bg-orange-100 text-orange-700 border border-orange-200'
                    }`}>
                    {isFinished(order.status) ? '✓ เสร็จแล้ว' : order.status}
                  </div>
                </div>

                {/* Items List */}
                <div className="p-5 space-y-3 bg-white">
                  {order.items?.map((item, idx) => (
                    <div key={idx} className="flex flex-col bg-gray-50 p-3 rounded-xl border border-gray-100">
                      <div className="flex justify-between items-start">
                        <span className="flex-1 font-bold text-gray-800 text-base">
                          {item.name}
                          {item.isSpecial && (
                            <span className="ml-2 text-orange-600 font-black text-xs uppercase bg-orange-50 px-2 py-0.5 rounded-full border border-orange-200">⭐ พิเศษ</span>
                          )}
                        </span>
                        <span className="bg-blue-500 text-white px-3 py-1 rounded-lg text-sm font-bold ml-2 shrink-0">
                          ×{item.quantity}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-2 items-center mt-2">
                        {item.selectedNoodle && (
                          <span className="text-[11px] bg-blue-50 text-blue-700 px-3 py-1 rounded-full font-bold flex items-center gap-1.5 border border-blue-100">
                            <Utensils size={12} /> {item.selectedNoodle}
                          </span>
                        )}
                        {item.note && (
                          <span className="text-[11px] text-amber-700 font-bold bg-amber-50 px-3 py-1 rounded-full flex items-center gap-1 border border-amber-100">
                            💬 {item.note}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Action Buttons */}
                <div className="p-5 bg-gray-50 border-t border-gray-100">
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-xs text-gray-500 font-bold uppercase">ยอดรวม</span>
                    <span className="text-2xl font-black text-gray-800">
                      ฿{Number(order.total_price || 0).toLocaleString()}
                    </span>
                  </div>

                  {isFinished(order.status) ? (
                    <div className="bg-emerald-500 text-white py-4 rounded-xl text-center font-bold uppercase text-sm flex items-center justify-center gap-2 shadow-md">
                      <CheckCircle2 size={18} /> เสิร์ฟเรียบร้อย
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        onClick={() => updateStatus(order.id, 'กำลังเตรียม')}
                        className="bg-orange-500 hover:bg-orange-600 text-white py-3 rounded-xl font-bold text-[11px] active:scale-95 transition-all shadow-sm"
                      >
                        รอ
                      </button>
                      <button
                        onClick={() => updateStatus(order.id, 'กำลังทำ')}
                        className="bg-amber-500 hover:bg-amber-600 text-white py-3 rounded-xl font-bold text-[11px] active:scale-95 transition-all shadow-sm"
                      >
                        กำลังทำ
                      </button>
                      <button
                        onClick={() => updateStatus(order.id, 'เสร็จแล้ว')}
                        className="bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-xl font-bold text-[11px] active:scale-95 transition-all shadow-sm"
                      >
                        ✓ เสร็จ
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}