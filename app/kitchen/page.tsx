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

  const fetchOrders = async () => {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching orders:', error);
      return;
    }
    if (data) setOrders(data as Order[]);
  };

  const updateStatus = async (id: number, newStatus: string) => {
    const { error } = await supabase
      .from('orders')
      .update({ status: newStatus })
      .eq('id', id);
    if (error) console.error('Error updating status:', error);
  };

  const filteredOrders = orders.filter(order => {
    if (activeTab === 'รอ') return order.status === 'รอ' || order.status === 'กำลังเตรียม';
    if (activeTab === 'กำลังทำ') return order.status === 'กำลังทำ';
    if (activeTab === 'เสร็จแล้ว') return isFinished(order.status);
    if (activeTab === 'ทั้งหมด') return order.status !== 'เสร็จสิ้น';
    return true;
  });

  return (
    <div className="min-h-screen bg-[#242C3B] text-white pb-10 font-sans">
      
      {/* Header & Status Summary Row */}
      <header className="p-6 bg-[#242C3B] sticky top-0 z-10 shadow-md">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-[#F97316] p-2 rounded-xl">
            <ChefHat size={28} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">ร้านป้ากุ้ง (ครัว)</h1>
            <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Kitchen Management</p>
          </div>
        </div>

        <div className="flex gap-2 text-center">
          <div className="bg-[#3D3133] p-3 rounded-2xl flex-1 border border-red-900/20">
            <Timer size={18} className="text-red-500 mx-auto mb-1" />
            <div className="text-red-200 text-[10px] font-bold uppercase">รอ</div>
            <div className="text-xl font-black">{orders.filter(o => ['รอ', 'กำลังเตรียม'].includes(o.status)).length}</div>
          </div>
          <div className="bg-[#3D392E] p-3 rounded-2xl flex-1 border border-yellow-900/20">
            <ChefHat size={18} className="text-yellow-500 mx-auto mb-1" />
            <div className="text-yellow-200 text-[10px] font-bold uppercase">กำลังทำ</div>
            <div className="text-xl font-black">{orders.filter(o => o.status === 'กำลังทำ').length}</div>
          </div>
          <div className="bg-[#2D3D33] p-3 rounded-2xl flex-1 border border-green-900/20">
            <CheckCircle2 size={18} className="text-green-500 mx-auto mb-1" />
            <div className="text-green-200 text-[10px] font-bold uppercase">เสร็จ</div>
            <div className="text-xl font-black">{orders.filter(o => isFinished(o.status)).length}</div>
          </div>
        </div>
      </header>

      {/* Tabs Filter */}
      <div className="px-6 flex gap-2 mb-6 overflow-x-auto no-scrollbar py-2">
        {['ทั้งหมด', 'รอ', 'กำลังทำ', 'เสร็จแล้ว'].map((tab) => {
          const count = orders.filter(o => {
            if (tab === 'ทั้งหมด') return o.status !== 'เสร็จสิ้น';
            if (tab === 'รอ') return o.status === 'รอ' || o.status === 'กำลังเตรียม';
            if (tab === 'กำลังทำ') return o.status === 'กำลังทำ';
            if (tab === 'เสร็จแล้ว') return isFinished(o.status);
            return false;
          }).length;

          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2 rounded-2xl font-bold text-xs transition-all flex items-center gap-2 whitespace-nowrap ${
                activeTab === tab ? 'bg-[#3B82F6] text-white shadow-lg' : 'bg-[#333D4F] text-gray-400'
              }`}
            >
              {tab}
              {count > 0 && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${activeTab === tab ? 'bg-white/20' : 'bg-black/40 text-white'}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Order Cards List */}
      <main className="px-6 space-y-5">
        {filteredOrders.length === 0 ? (
          <div className="py-20 text-center text-gray-500 font-bold italic">ไม่พบรายการสั่งอาหาร...</div>
        ) : (
          filteredOrders.map((order) => (
            <div key={order.id} className="bg-white rounded-[2rem] overflow-hidden shadow-2xl">
              <div className="p-4 flex justify-between items-center bg-gray-50">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-[#242C3B] rounded-2xl flex items-center justify-center text-xl font-black text-white">
                    {order.table_no}
                  </div>
                  <div>
                    <h3 className="text-[#242C3B] font-black">โต๊ะ {order.table_no}</h3>
                    <p className="text-gray-400 text-[10px] font-bold">{new Date(order.created_at).toLocaleTimeString()}</p>
                  </div>
                </div>
                
                <div className={`px-3 py-1 rounded-full text-[9px] font-black uppercase ${
                    isFinished(order.status) ? 'bg-green-100 text-green-600' : 'bg-gray-200 text-gray-600'
                }`}>
                  {isFinished(order.status) ? 'เสร็จแล้ว' : order.status}
                </div>
              </div>

              {/* Items List */}
              <div className="p-4 space-y-3">
                {order.items?.map((item, idx) => (
                  <div key={idx} className="flex flex-col border-b border-gray-50 pb-3 last:border-0">
                    <div className="flex justify-between items-start text-[#242C3B] font-bold text-base">
                      <span className="flex-1">
                        {item.name}
                        {item.isSpecial && (
                          <span className="ml-2 text-red-600 font-black text-sm uppercase">[พิเศษ]</span>
                        )}
                      </span>
                      <span className="bg-blue-600 text-white px-3 py-0.5 rounded-lg text-sm ml-2 shrink-0">x{item.quantity}</span>
                    </div>

                    <div className="flex flex-wrap gap-2 items-center mt-1.5">
                      {item.selectedNoodle && (
                        <span className="text-[11px] bg-blue-50 text-blue-700 px-2.5 py-1 rounded-md font-black border border-blue-100 flex items-center gap-1">
                          <Utensils size={10} /> เส้น: {item.selectedNoodle}
                        </span>
                      )}
                      {item.note && (
                        <span className="text-[11px] text-orange-500 font-bold italic bg-orange-50 px-2 py-1 rounded-md border border-orange-100">
                          ** {item.note}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Action Buttons */}
              <div className="p-4 bg-gray-50 border-t border-gray-100 flex flex-col gap-3">
                <div className="flex justify-between items-center">
                   <span className="text-[10px] text-gray-400 font-black uppercase">ยอดรวม:</span>
                   <span className="text-[#242C3B] text-lg font-black tracking-tight">
                    ฿{Number(order.total_price || 0).toLocaleString()}
                   </span>
                </div>
                
                {isFinished(order.status) ? (
                  <div className="text-center py-2 text-green-500 text-[10px] font-black uppercase italic tracking-widest flex items-center justify-center gap-2">
                    <CheckCircle2 size={14} /> เสิร์ฟเรียบร้อย
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={() => updateStatus(order.id, 'รอ')} className="bg-red-500 text-white flex-1 py-3 rounded-xl font-black text-[10px] active:scale-95 transition-transform">รอ</button>
                    <button onClick={() => updateStatus(order.id, 'กำลังทำ')} className="bg-orange-500 text-white flex-1 py-3 rounded-xl font-black text-[10px] active:scale-95 transition-transform">กำลังทำ</button>
                    <button onClick={() => updateStatus(order.id, 'เสร็จแล้ว')} className="bg-green-500 text-white flex-[1.5] py-3 rounded-xl font-black text-[10px] active:scale-95 transition-transform shadow-md">เสร็จแล้ว</button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </main>
    </div>
  );
}