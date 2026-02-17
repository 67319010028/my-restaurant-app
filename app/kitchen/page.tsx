"use client";
import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {
  Clock, CheckCircle2, Timer,
  ChefHat, Utensils, ClipboardList, BellRing, Check, Plus, Minus
} from 'lucide-react';

// กำหนด Interface เพื่อความปลอดภัยของข้อมูล
interface OrderItem {
  id?: string | number;
  name: string;
  quantity: number;
  finished_quantity?: number; // New field for partial tracking
  isSpecial?: boolean;
  selectedNoodle?: string;
  note?: string;
  isDone?: boolean;
  status?: 'waiting' | 'cooking' | 'done'; // New Status Field
}

interface Order {
  id: number;
  table_no: string | number;
  created_at: string;
  status: string;
  total_price: number;
  items: OrderItem[];
  queue_no?: number;
}

export default function KitchenPage() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [activeTab, setActiveTab] = useState('ทั้งหมด');
  const [isAudioUnlocked, setIsAudioUnlocked] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Notification sound function (Pure Web Audio API - iOS Friendly)
  const playNotificationSound = () => {
    if (!audioContextRef.current) return;

    try {
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') ctx.resume();

      const playTone = (freq: number, time: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, time);
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(0.3, time + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.01, time + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(time);
        osc.stop(time + duration);
      };

      const now = ctx.currentTime;
      playTone(880, now, 0.3); // High ping
      playTone(880, now + 0.15, 0.3); // Second high ping
    } catch (e) {
      console.error('Kitchen Web Audio Play Error:', e);
    }
  };

  const unlockAudio = () => {
    setIsUnlocking(true);
    try {
      const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass();

      ctx.resume().then(() => {
        audioContextRef.current = ctx;
        playNotificationSound(); // Play test sound
        setIsAudioUnlocked(true);
        localStorage.setItem('audio_unlocked', 'true');
        console.log('Kitchen Web Audio Unlocked');
      }).catch((e: any) => {
        alert('Kitchen Unlock error: ' + e.message);
      }).finally(() => {
        setIsUnlocking(false);
      });
    } catch (e: any) {
      alert('Kitchen Browser not compatible: ' + e.message);
      setIsUnlocking(false);
    }
  };

  // ฟังก์ชันเช็คว่าสถานะนี้ถือว่า "ทำเสร็จแล้ว" ในมุมมองของห้องครัวหรือไม่
  const isFinished = (status: string) => status === 'เสร็จแล้ว' || status === 'เรียกเช็คบิล';

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/staff');
        return;
      }

      // ตรวจสอบ Role จากตาราง profiles
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();

      const userRole = profile?.role?.toLowerCase();
      if (!profile || (userRole !== 'kitchen' && userRole !== 'ห้องครัว')) {
        router.push('/staff');
      } else {
        setIsLoggedIn(true);
      }
    };
    checkUser();

    fetchOrders();

    // 1. ตรวจสอบว่าเคยอนุญาตเสียงไว้หรือยัง
    const savedAudioPref = localStorage.getItem('audio_unlocked');
    if (savedAudioPref === 'true') {
      setIsAudioUnlocked(true);
    }

    // 2. ฟังก์ชันแอบปลดล็อก (ถ้าเคยอนุญาตไว้แล้ว)
    const handleFirstInteraction = () => {
      if (localStorage.getItem('audio_unlocked') === 'true' && !audioContextRef.current) {
        try {
          const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
          const ctx = new AudioContextClass();
          ctx.resume().then(() => {
            audioContextRef.current = ctx;
            console.log('Kitchen Audio auto-resumed');
          });
        } catch (e) {
          console.error('Kitchen Auto-resume failed', e);
        }
      }
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('touchstart', handleFirstInteraction);
    };

    window.addEventListener('click', handleFirstInteraction);
    window.addEventListener('touchstart', handleFirstInteraction);

    // BroadcastChannel for Realtime Sync (Listen for updates from Admin)
    const broadcastChannel = new BroadcastChannel('restaurant_demo_channel');
    broadcastChannel.onmessage = (event) => {
      const { type, id, status, table_no } = event.data;

      if (type === 'ORDER_UPDATE') {
        if (status === 'เสร็จสิ้น' && table_no) {
          // ✅ Case: Table-wide billing (Remove all orders for this table)
          setOrders(prev => {
            const updated = prev.map(o => o.table_no === table_no ? { ...o, status: 'เสร็จสิ้น' } : o);
            if (typeof window !== 'undefined') localStorage.setItem('demo_admin_orders', JSON.stringify(updated));
            return updated;
          });
          return;
        }

        // Only update status of existing orders, don't add new ones
        // (Supabase realtime will handle new orders via fetchOrders)
        setOrders(prev => {
          const exists = prev.find(o => o.id === id);
          if (exists) {
            const updated = prev.map(o => o.id === id ? { ...o, status } : o);
            if (typeof window !== 'undefined') localStorage.setItem('demo_admin_orders', JSON.stringify(updated));
            return updated;
          }
          // Don't add new orders here - let Supabase realtime handle it
          return prev;
        });
      }
    };

    const channel = supabase
      .channel('kitchen_updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload: any) => {
        if (payload.eventType === 'INSERT') {
          playNotificationSound();
        }
        fetchOrders();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      broadcastChannel.close();
    };
  }, [router]);

  /* --- Mock Data for Fallback --- */
  const MOCK_ORDERS: Order[] = [
    {
      id: 991,
      table_no: "5",
      created_at: new Date().toISOString(),
      status: "กำลังเตรียม",
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
        .order('created_at', { ascending: true });

      let baseOrders = data || [];

      if (typeof window !== 'undefined') {
        const savedOrdersStr = localStorage.getItem('demo_admin_orders');
        let savedOrders = savedOrdersStr ? JSON.parse(savedOrdersStr) : [];

        // ✅ Only merge localStorage if DB fetch returned nothing 
        // to prevent "shadow" duplicate orders.
        const combined = baseOrders.length > 0 ? baseOrders : savedOrders;

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

    // Broadcast update to Admin/Customer tab
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

  const updateItemFinishedQuantity = async (orderId: number, itemIdx: number, delta: number) => {
    const order = orders.find(o => o.id === orderId);
    if (!order || !order.items) return;

    const newItems = [...order.items];
    const item = { ...newItems[itemIdx] };
    const currentFinished = item.finished_quantity || 0;
    const newFinished = Math.max(0, Math.min(item.quantity, currentFinished + delta));

    item.finished_quantity = newFinished;
    item.isDone = newFinished === item.quantity;

    // Auto status update
    if (item.isDone) item.status = 'done';
    else if (newFinished > 0) item.status = 'cooking';

    newItems[itemIdx] = item;

    // Optimistic Update
    const updated = orders.map(o => o.id === orderId ? { ...o, items: newItems } : o);
    setOrders(updated);

    if (typeof window !== 'undefined') localStorage.setItem('demo_admin_orders', JSON.stringify(updated));

    // Broadcast to Customer
    const broadcastChannel = new BroadcastChannel('restaurant_demo_channel');
    broadcastChannel.postMessage({
      type: 'ORDER_UPDATE',
      id: orderId,
      items: newItems,
      table_no: order.table_no
    });

    try {
      const { error } = await supabase
        .from('orders')
        .update({ items: newItems })
        .eq('id', orderId);

      if (error) console.warn('Supabase item update failed:', error);
    } catch (e) {
      console.warn('Supabase item update exception:', e);
    }
  };

  const toggleItemStatus = async (orderId: number, itemIdx: number) => {
    const order = orders.find(o => o.id === orderId);
    if (!order || !order.items) return;

    const item = order.items[itemIdx];
    let newStatus: 'waiting' | 'cooking' | 'done' = 'waiting';
    let newFinished = 0;

    // Cycle Logic: Waiting -> Cooking -> Done -> Waiting
    if (!item.status || item.status === 'waiting') {
      newStatus = 'cooking';
      newFinished = 0; // Cooking but not yet done
    } else if (item.status === 'cooking') {
      newStatus = 'done';
      newFinished = item.quantity;
    } else {
      newStatus = 'waiting';
      newFinished = 0;
    }

    // Update locally immediately
    const newItems = [...order.items];
    newItems[itemIdx] = {
      ...item,
      status: newStatus,
      finished_quantity: newFinished,
      isDone: newStatus === 'done'
    };

    // calculate order status
    const allFinished = newItems.every(i => i.status === 'done' || (i.finished_quantity === i.quantity));
    const someStarted = newItems.some(i => i.status === 'cooking' || i.status === 'done' || (i.finished_quantity || 0) > 0);

    let newOrderStatus = order.status;
    if (allFinished) newOrderStatus = 'เสร็จแล้ว';
    else if (someStarted) newOrderStatus = 'กำลังทำ';
    else newOrderStatus = 'กำลังเตรียม';

    const updatedOrders = orders.map(o => o.id === orderId ? { ...o, items: newItems, status: newOrderStatus } : o);
    setOrders(updatedOrders);

    if (typeof window !== 'undefined') localStorage.setItem('demo_admin_orders', JSON.stringify(updatedOrders));

    // Broadcast
    const broadcastChannel = new BroadcastChannel('restaurant_demo_channel');
    broadcastChannel.postMessage({
      type: 'ORDER_UPDATE',
      id: orderId,
      items: newItems,
      status: newOrderStatus,
      table_no: order.table_no
    });

    try {
      await Promise.all([
        supabase.from('orders').update({ items: newItems }).eq('id', orderId),
        supabase.from('orders').update({ status: newOrderStatus }).eq('id', orderId)
      ]);
    } catch (e) {
      console.warn('Supabase toggle item exception:', e);
    }
  };


  const markOrderAsFinished = async (orderId: number) => {
    const order = orders.find(o => o.id === orderId);
    if (!order || !order.items) return;

    // 1. Mark all items as done locally and visually
    const newItems = order.items.map(item => ({
      ...item,
      finished_quantity: item.quantity,
      isDone: true
    }));

    // Optimistic Update
    const updatedWithItems = orders.map(o => o.id === orderId ? { ...o, items: newItems, status: 'เสร็จแล้ว' } : o);
    setOrders(updatedWithItems);
    if (typeof window !== 'undefined') localStorage.setItem('demo_admin_orders', JSON.stringify(updatedWithItems));

    // Broadcast Item Updates
    const broadcastChannel = new BroadcastChannel('restaurant_demo_channel');
    broadcastChannel.postMessage({
      type: 'ORDER_UPDATE',
      id: orderId,
      items: newItems,
      status: 'เสร็จแล้ว', // Send status update too
      table_no: order.table_no
    });

    // 2. Persist to Supabase
    try {
      await Promise.all([
        supabase.from('orders').update({ items: newItems }).eq('id', orderId),
        supabase.from('orders').update({ status: 'เสร็จแล้ว' }).eq('id', orderId)
      ]);
    } catch (e) {
      console.warn('Supabase finish-all exception:', e);
    }
  };

  const filteredOrders = orders.filter(order => {
    // กรองออเดอร์ที่เช็คบิลเสร็จสิ้นแล้ว (เสร็จสิ้น) ออกจากทุกหน้าในครัว
    if (order.status === 'เสร็จสิ้น' || order.status === 'ยกเลิก' || order.status === 'ออร์เดอร์ยกเลิก') return false;

    if (activeTab === 'รอ') return order.status === 'กำลังเตรียม';
    if (activeTab === 'กำลังทำ') return order.status === 'กำลังทำ';
    if (activeTab === 'เสร็จแล้ว') return isFinished(order.status);
    if (activeTab === 'ทั้งหมด') return true; // กรองเสร็จสิ้นไปแล้วข้างบน
    return true;
  });

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-indigo-50/30 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F9F7F2] font-sans pb-32 text-[#2D3436]">

      {/* Header & Status Summary Row */}
      <header className="p-6 bg-white/90 backdrop-blur-xl sticky top-0 z-10 shadow-sm border-b border-slate-100">
        <div className="flex items-center gap-4 mb-6">
          <div className="bg-slate-900 p-3 rounded-2xl shadow-xl">
            <ChefHat size={32} className="text-white" />
          </div>
          <div>
            <h1 className="text-4xl font-black text-black">ร้านป้ากุ้ง (ครัว)</h1>
            <p className="text-sm text-black font-bold uppercase tracking-widest flex items-center gap-2">
              <span className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></span>
              ระบบจัดการห้องครัว
            </p>
          </div>
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              router.push('/staff');
            }}
            className="text-red-600 font-black text-xs uppercase tracking-wider bg-red-100 px-6 py-2 rounded-full ml-auto border border-red-200"
          >
            ออกจากระบบ
          </button>
        </div>

        {/* Audio Unlock Banner Overlay */}
        {!isAudioUnlocked && (
          <div className="fixed inset-0 z-[999] bg-white flex items-center justify-center p-6 sm:p-10">
            <div className="w-full max-w-sm text-center">
              <div className="w-24 h-24 bg-[#F0F4EF] rounded-[2.5rem] flex items-center justify-center mx-auto mb-8 shadow-inner">
                <ChefHat size={48} className={`text-[#7C9070] ${isUnlocking ? 'animate-spin' : 'animate-bounce'}`} />
              </div>
              <h1 className="text-4xl font-black text-[#2D3436] tracking-tight">ระบบครัว</h1>
              <p className="text-black font-bold mb-10 leading-relaxed px-4">
                กรุณากดปุ่มเพื่อเปิดเสียงแจ้งเตือน<br />
                เมื่อมีออเดอร์ใหม่ส่งมาจากแอดมิน<br />
                (เพื่อให้ทำงานได้บนมือถือ)
              </p>
              <button
                onClick={unlockAudio}
                disabled={isUnlocking}
                className={`w-full py-6 rounded-[2rem] font-black text-xl shadow-2xl transition-all flex items-center justify-center gap-3 active:scale-95 ${isUnlocking ? 'bg-slate-200 text-[#BBC3C6]' : 'bg-[#7C9070] text-white shadow-[#7C9070]/20 hover:scale-[1.02]'}`}
              >
                {isUnlocking ? 'กำลังเปิดเสียง...' : 'เปิดระบบเสียงห้องครัว ✨'}
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white p-6 rounded-3xl border-2 border-[#E8E4D8] shadow-sm hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-2">
              <Timer size={28} className="text-[#7C9070]" />
              <div className="text-5xl font-black text-black">{orders.filter(o => o.status === 'กำลังเตรียม').length}</div>
            </div>
            <div className="text-black text-sm font-black uppercase tracking-wider">รอดำเนินการ</div>
          </div>

          <div className="bg-white p-6 rounded-3xl border-2 border-[#E8E4D8] shadow-sm hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-2">
              <ChefHat size={28} className="text-[#7C9070]" />
              <div className="text-5xl font-black text-black">{orders.filter(o => o.status === 'กำลังทำ').length}</div>
            </div>
            <div className="text-black text-sm font-black uppercase tracking-wider">กำลังทำ</div>
          </div>

          <div className="bg-white p-6 rounded-3xl border-2 border-emerald-100 shadow-sm hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-2">
              <CheckCircle2 size={28} className="text-emerald-500" />
              <div className="text-5xl font-black text-black">{orders.filter(o => isFinished(o.status)).length}</div>
            </div>
            <div className="text-emerald-600 text-sm font-black uppercase tracking-wider">เสร็จแล้ว</div>
          </div>
        </div>
      </header>

      {/* Tabs Filter */}
      <div className="px-6 flex gap-3 mb-6 overflow-x-auto no-scrollbar py-3">
        {['ทั้งหมด', 'รอ', 'กำลังทำ', 'เสร็จแล้ว'].map((tab) => {
          const count = orders.filter(o => {
            if (tab === 'ทั้งหมด') return o.status === 'กำลังเตรียม' || o.status === 'กำลังทำ' || o.status === 'เสร็จแล้ว' || o.status === 'เรียกเช็คบิล';
            if (tab === 'รอ') return o.status === 'กำลังเตรียม';
            if (tab === 'กำลังทำ') return o.status === 'กำลังทำ';
            if (tab === 'เสร็จแล้ว') return isFinished(o.status);
            return false;
          }).length;

          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-8 py-4 rounded-2xl font-black text-lg transition-all flex items-center gap-2 whitespace-nowrap border-2 ${activeTab === tab
                ? 'bg-black text-white border-black shadow-lg'
                : 'bg-white text-black hover:bg-orange-50 border-orange-100'
                }`}
            >
              {tab}
              {count > 0 && (
                <span className={`text-base px-3 py-1 rounded-full font-black ${activeTab === tab ? 'bg-white/20' : 'bg-red-600 text-white'
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
            <div className="bg-white rounded-3xl p-12 border-2 border-dashed border-gray-100 shadow-sm max-w-md mx-auto">
              <ClipboardList size={64} className="text-gray-300 mx-auto mb-4" />
              <p className="text-black font-bold text-lg">ไม่พบรายการสั่งอาหาร</p>
              <p className="text-black text-sm mt-2">กำลังรอรับออเดอร์ใหม่...</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
            {filteredOrders.map((order, index) => (
              <div
                key={order.id}
                className="bg-[#F8F9FB] rounded-[2.5rem] overflow-hidden shadow-sm border border-gray-100 animate-in fade-in slide-in-from-bottom duration-500"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                {/* Header */}
                <div className="p-6 flex justify-between items-center bg-white">
                  <div className="flex items-center gap-4">
                    <div className="w-20 h-20 bg-[#7C9070] rounded-3xl flex items-center justify-center text-white shadow-lg shadow-[#7C9070]/20">
                      {order.table_no}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-gray-900 font-black text-xl">โต๊ะ {order.table_no}</h3>
                      </div>
                      <p className="text-black text-sm font-bold flex items-center gap-1.5">
                        <Clock size={14} />
                        {new Date(order.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>

                  <div className={`p-4 rounded-2xl border-2 transition-all ${isAudioUnlocked ? 'bg-[#F0F4EF] border-[#7C9070] text-[#7C9070]' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                    {isFinished(order.status) ? '✓ เสร็จแล้ว' : order.status}
                  </div>
                </div>

                {/* Items List */}
                <div className="p-4 space-y-3 bg-white mx-4 my-2 rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                  {order.items?.map((item, idx) => {
                    const finished = item.finished_quantity || 0;
                    const total = item.quantity;
                    const isDone = item.isDone || finished === total || item.status === 'done';
                    const isCooking = item.status === 'cooking' && !isDone;

                    const isMulti = total > 1;

                    return (
                      <div
                        key={idx}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleItemStatus(order.id, idx);
                        }}
                        className={`flex flex-col sm:flex-row sm:items-start justify-between p-3 border-b last:border-0 border-slate-50 cursor-pointer transition-colors active:scale-[0.99] ${isDone ? 'bg-green-50' : isCooking ? 'bg-orange-50' : 'hover:bg-gray-50'
                          }`}
                      >
                        <div className="flex-1">
                          <span className={`font-black text-xl block mb-1 transition-all flex items-center gap-2 ${isDone ? 'text-green-700 line-through opacity-50' : 'text-[#2D3436]'
                            }`}>
                            {item.name}
                          </span>

                          <div className="flex flex-wrap gap-2 items-center mb-2">
                            {item.isSpecial && (
                              <span className="text-white font-black text-[10px] uppercase bg-red-600 px-2 py-0.5 rounded-md shadow-sm">
                                ⭐ พิเศษ
                              </span>
                            )}
                            {item.selectedNoodle && (
                              <span className="text-[10px] bg-slate-50 text-[#555] px-2 py-0.5 rounded-md font-bold border border-slate-100">
                                {item.selectedNoodle}
                              </span>
                            )}
                          </div>



                          {item.note && (
                            <p className="text-sm text-[#7C9070] font-bold mt-1 bg-[#F9F7F2] px-2 py-1 rounded-lg inline-block">
                              {item.note}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-3 sm:flex-col sm:items-end mt-2 sm:mt-0">
                          <div className={`px-3 py-1 rounded-xl text-lg font-black shrink-0 shadow-sm transition-colors ${isDone ? 'bg-green-600 text-white' : 'bg-[#2D3436] text-white'
                            }`}>
                            x{item.quantity}
                          </div>


                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Footer / Total Price (Buttons Removed) */}
                <div className="p-6 bg-white border-t border-slate-100">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-[#636E72] font-black uppercase tracking-widest">ยอดรวม</span>
                    <span className="text-3xl font-black text-[#2D3436]">
                      ฿{Number(order.total_price || 0).toLocaleString()}
                    </span>
                  </div>

                  {isFinished(order.status) ? (
                    <div className="bg-green-500 text-white py-5 rounded-[1.8rem] text-center font-black text-lg flex items-center justify-center gap-2 shadow-lg shadow-green-100">
                      <CheckCircle2 size={24} strokeWidth={3} /> เสร็จแล้ว
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-3 pt-4">
                      <button
                        onClick={(e) => { e.stopPropagation(); updateStatus(order.id, 'กำลังเตรียม'); }}
                        className={`py-5 rounded-2xl font-black text-xl active:scale-95 transition-all border-2 ${order.status === 'กำลังเตรียม'
                          ? 'bg-[#2D3436] text-white border-[#2D3436] shadow-xl'
                          : 'bg-white text-[#2D3436] border-slate-100'
                          }`}
                      >
                        รอ
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); updateStatus(order.id, 'กำลังทำ'); }}
                        className={`py-5 rounded-2xl font-black text-xl active:scale-95 transition-all border-2 ${order.status === 'กำลังทำ'
                          ? 'bg-[#7C9070] text-white border-[#7C9070] shadow-xl'
                          : 'bg-white text-[#2D3436] border-slate-100'
                          }`}
                      >
                        ทำ
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); markOrderAsFinished(order.id); }}
                        className={`py-5 rounded-2xl font-black text-xl active:scale-95 transition-all border-2 ${order.status === 'เสร็จแล้ว'
                          ? 'bg-green-600 text-white border-green-600 shadow-xl'
                          : 'bg-white text-[#2D3436] border-slate-100'
                          }`}
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