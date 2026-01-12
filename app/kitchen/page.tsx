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

    // BroadcastChannel for Realtime Sync (Listen for updates from Admin)
    const broadcastChannel = new BroadcastChannel('restaurant_demo_channel');
    broadcastChannel.onmessage = (event) => {
      const { type, action, id, status, item } = event.data;

      if (type === 'ORDER_UPDATE') {
        setOrders(prev => {
          const exists = prev.find(o => o.id === id);
          if (exists) {
            const updated = prev.map(o => o.id === id ? { ...o, status } : o);
            if (typeof window !== 'undefined') localStorage.setItem('demo_admin_orders', JSON.stringify(updated));
            return updated;
          } else {
            // If new order (though usually 'รอ' status first), add it
            const newOrders = [item, ...prev];
            if (typeof window !== 'undefined') localStorage.setItem('demo_admin_orders', JSON.stringify(newOrders));
            return newOrders;
          }
        });
      }
    };

    const channel = supabase
      .channel('kitchen_updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => fetchOrders())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      broadcastChannel.close();
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
      // 1. Fetch from Real Database
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });

      let baseOrders = data || [];

      if (typeof window !== 'undefined') {
        // 2. Sync with LocalStorage (Demo Mode / Offline)
        const savedOrdersStr = localStorage.getItem('demo_admin_orders');
        let savedOrders = savedOrdersStr ? JSON.parse(savedOrdersStr) : [];

        // Merge logic similar to Admin page: prioritize DB if exists, otherwise use local
        const combined = [...baseOrders];
        savedOrders.forEach((s: any) => {
          const isMock = s.id >= 991 && s.id <= 993; // Local kitchen mocks
          const isAdminMock = s.id >= 101 && s.id <= 104; // Admin mocks
          if (!isMock && !isAdminMock && !combined.some(c => c.id === s.id)) {
            combined.push(s);
          }
        });

        setOrders(combined);
        localStorage.setItem('demo_admin_orders', JSON.stringify(combined));
      } else {
        setOrders(baseOrders);
      }

      if (error) {
        console.warn('Supabase fetch failed, using Local/Mock Data:', error);
        if (orders.length === 0) setOrders(MOCK_ORDERS);
      }
    } catch (e) {
      console.error("Unexpected error fetching orders:", e);
      setOrders(MOCK_ORDERS);
    }
  };

  const updateStatus = async (id: number, newStatus: string) => {
    // Optimistic Update: Update local state immediately for smooth experience (Demo Mode)
    const updated = orders.map(o => o.id === id ? { ...o, status: newStatus } : o);
    setOrders(updated);

    // Sync LocalStorage
    if (typeof window !== 'undefined') localStorage.setItem('demo_admin_orders', JSON.stringify(updated));

    // Broadcast update to Admin tab
    const broadcastChannel = new BroadcastChannel('restaurant_demo_channel');
    broadcastChannel.postMessage({
      type: 'ORDER_UPDATE',
      id,
      status: newStatus,
      table_no: orders.find(o => o.id === id)?.table_no
    });

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
    // กรองออเดอร์ที่เช็คบิลเสร็จสิ้นแล้ว (เสร็จสิ้น) ออกจากทุกหน้าในครัว
    if (order.status === 'เสร็จสิ้น' || order.status === 'ยกเลิก' || order.status === 'ออร์เดอร์ยกเลิก') return false;

    // ไม่แสดงออเดอร์ที่ยังไม่ได้รับจากแอดมิน (สถานะ "รอ")
    if (order.status === 'รอ') return false;

    if (activeTab === 'รอ') return order.status === 'กำลังเตรียม';
    if (activeTab === 'กำลังทำ') return order.status === 'กำลังทำ';
    if (activeTab === 'เสร็จแล้ว') return isFinished(order.status);
    if (activeTab === 'ทั้งหมด') return true; // กรองเสร็จสิ้นไปแล้วข้างบน
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
                className="bg-[#F8F9FB] rounded-[2.5rem] overflow-hidden shadow-sm border border-gray-100 animate-in fade-in slide-in-from-bottom duration-500"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                {/* Header */}
                <div className="p-6 flex justify-between items-center bg-white">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 bg-blue-500 rounded-3xl flex items-center justify-center text-3xl font-black text-white shadow-lg">
                      {order.table_no}
                    </div>
                    <div>
                      <h3 className="text-gray-900 font-black text-xl">โต๊ะ {order.table_no}</h3>
                      <p className="text-gray-400 text-sm font-bold flex items-center gap-1.5">
                        <Clock size={14} />
                        {new Date(order.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>

                  <div className={`px-4 py-2 rounded-full text-xs font-black ${isFinished(order.status)
                    ? 'bg-emerald-100 text-emerald-600'
                    : order.status === 'กำลังทำ'
                      ? 'bg-amber-100 text-amber-600'
                      : 'bg-orange-100 text-orange-600'
                    }`}>
                    {isFinished(order.status) ? '✓ เสร็จแล้ว' : order.status}
                  </div>
                </div>

                {/* Items List */}
                <div className="p-4 space-y-3 bg-white mx-4 my-2 rounded-3xl border border-gray-50 shadow-sm">
                  {order.items?.map((item, idx) => (
                    <div key={idx} className="flex flex-col bg-white p-4 rounded-3xl">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <span className="font-black text-gray-900 text-xl block">
                            {item.name}
                          </span>
                          <div className="flex flex-wrap gap-2 items-center mt-2">
                            {item.isSpecial && (
                              <span className="text-orange-600 font-black text-[10px] uppercase bg-orange-50 px-3 py-1 rounded-full border border-orange-100 flex items-center gap-1">
                                <span className="text-sm">⭐</span> พิเศษ
                              </span>
                            )}
                            {item.selectedNoodle && (
                              <span className="text-[10px] bg-blue-50 text-blue-600 px-3 py-1 rounded-full font-black flex items-center gap-1 border border-blue-50">
                                <Utensils size={12} strokeWidth={3} /> {item.selectedNoodle}
                              </span>
                            )}
                          </div>
                          {item.note && (
                            <p className="text-[10px] text-amber-600 font-bold mt-2 bg-amber-50/50 p-2 rounded-xl border border-amber-50">
                              💬 {item.note}
                            </p>
                          )}
                        </div>
                        <span className="bg-blue-500 text-white px-4 py-1.5 rounded-xl text-sm font-black ml-4 shrink-0 shadow-md">
                          ×{item.quantity}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Action Buttons */}
                <div className="p-6 bg-white">
                  <div className="flex justify-between items-center mb-6">
                    <span className="text-xs text-gray-400 font-black uppercase tracking-widest">ยอดรวม</span>
                    <span className="text-3xl font-black text-gray-900">
                      ฿{Number(order.total_price || 0).toLocaleString()}
                    </span>
                  </div>

                  {isFinished(order.status) ? (
                    <div className="bg-[#10B981] text-white py-5 rounded-[1.8rem] text-center font-black text-lg flex items-center justify-center gap-2 shadow-lg shadow-green-100">
                      <CheckCircle2 size={24} strokeWidth={3} /> เสิร์ฟเรียบร้อย
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-3">
                      <button
                        onClick={() => updateStatus(order.id, 'กำลังเตรียม')}
                        className="bg-orange-500 hover:bg-orange-600 text-white py-4 rounded-2xl font-black text-sm active:scale-95 transition-all shadow-md"
                      >
                        รอ
                      </button>
                      <button
                        onClick={() => updateStatus(order.id, 'กำลังทำ')}
                        className="bg-amber-500 hover:bg-amber-600 text-white py-4 rounded-2xl font-black text-sm active:scale-95 transition-all shadow-md"
                      >
                        กำลังทำ
                      </button>
                      <button
                        onClick={() => updateStatus(order.id, 'เสร็จแล้ว')}
                        className="bg-emerald-500 hover:bg-emerald-600 text-white py-4 rounded-2xl font-black text-sm active:scale-95 transition-all shadow-md"
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