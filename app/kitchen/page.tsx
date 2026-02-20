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

  // ฟังก์ชันเช็คว่าสถานะนี้ถือว่า "ทำเสร็จแล้ว" และยังค้างอยู่ในจอครัว
  const isFinished = (status: string) => status === 'เสร็จแล้ว';

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
          fetchOrders(true); // Force fetch on new order
        } else if (payload.eventType === 'UPDATE') {
          // If it's a simple status/item update, we can update locally instead of full fetch
          const updatedOrder = payload.new;
          const statusToRemove = ['เสร็จสิ้น', 'เสิร์ฟแล้ว', 'เรียกเช็คบิล', 'ยกเลิก', 'ออร์เดอร์ยกเลิก'];

          if (statusToRemove.includes(updatedOrder.status)) {
            // Remove from view if finished, served, billed or cancelled
            setOrders(prev => prev.filter(o => o.id !== updatedOrder.id));
          } else {
            // Update items/status for existing order
            setOrders(prev => {
              const exists = prev.find(o => o.id === updatedOrder.id);
              if (exists) {
                return prev.map(o => o.id === updatedOrder.id ? { ...o, ...updatedOrder } : o);
              } else {
                // If it's a status change from finished back to active
                return [...prev, updatedOrder].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
              }
            });
          }
        } else {
          fetchOrders();
        }
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

  // Use a ref to prevent rapid consecutive fetches
  const lastFetchTimeRef = useRef<number>(0);
  const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const fetchOrders = async (force = false) => {
    const now = Date.now();
    // Debounce: prevent fetching more than once every 1000ms unless forced
    if (!force && lastFetchTimeRef.current && (now - lastFetchTimeRef.current < 1000)) {
      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
      fetchTimeoutRef.current = setTimeout(() => fetchOrders(), 1100);
      return;
    }

    lastFetchTimeRef.current = now;
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
      fetchTimeoutRef.current = null;
    }

    try {
      // 1. Fetch from Real Database - กรองเอาเฉพาะที่ยังไม่จ่ายเงิน, ยังไม่เสิร์ฟ และยังไม่เรียกเช็คบิล
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .not('status', 'in', '("เสร็จสิ้น","เสิร์ฟแล้ว","เรียกเช็คบิล","ยกเลิก","ออร์เดอร์ยกเลิก")')
        .order('created_at', { ascending: true });

      if (!error) {
        // ✅ If success, use DB data (even if empty) to clear "old" local data
        const baseOrders = data || [];
        setOrders(baseOrders);
        if (typeof window !== 'undefined') {
          localStorage.setItem('demo_admin_orders', JSON.stringify(baseOrders));
        }
      } else {
        // ❌ Only fallback if error occurs
        console.warn('Supabase fetch failed, using Local/Mock Data:', error);
        if (typeof window !== 'undefined') {
          const savedOrdersStr = localStorage.getItem('demo_admin_orders');
          if (savedOrdersStr) setOrders(JSON.parse(savedOrdersStr));
          else setOrders(MOCK_ORDERS);
        } else {
          setOrders(MOCK_ORDERS);
        }
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

    // ✅ Add: Calculate overall order status based on updated items
    const allFinished = newItems.every(i => (i.finished_quantity === i.quantity) || i.isDone || i.status === 'done');
    const someStarted = newItems.some(i => (i.finished_quantity || 0) > 0 || i.status === 'cooking' || i.status === 'done');

    let newOrderStatus = order.status;
    if (allFinished) newOrderStatus = 'เสร็จแล้ว';
    else if (someStarted) newOrderStatus = 'กำลังทำ';
    else newOrderStatus = 'กำลังเตรียม';

    // Optimistic Update
    const updated = orders.map(o => o.id === orderId ? { ...o, items: newItems, status: newOrderStatus } : o);
    setOrders(updated);

    if (typeof window !== 'undefined') localStorage.setItem('demo_admin_orders', JSON.stringify(updated));

    // Broadcast to Customer
    const broadcastChannel = new BroadcastChannel('restaurant_demo_channel');
    broadcastChannel.postMessage({
      type: 'ORDER_UPDATE',
      id: orderId,
      items: newItems,
      status: newOrderStatus, // Send updated status
      table_no: order.table_no
    });

    try {
      const { error } = await supabase
        .from('orders')
        .update({ items: newItems, status: newOrderStatus }) // Sync both items and status
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
    // กรองออเดอร์ที่เช็คบิลเสร็จสิ้นแล้ว, เสิร์ฟไปแล้ว หรือกำลังเรียกเช็คบิล ออกจากจอครัว
    if (['เสร็จสิ้น', 'เสิร์ฟแล้ว', 'เรียกเช็คบิล', 'ยกเลิก', 'ออร์เดอร์ยกเลิก'].includes(order.status)) return false;

    if (activeTab === 'รอ') return order.status === 'กำลังเตรียม';
    if (activeTab === 'กำลังทำ') return order.status === 'กำลังทำ';
    if (activeTab === 'เสร็จแล้ว') return isFinished(order.status);
    if (activeTab === 'ทั้งหมด') return true;
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

      {/* Premium Header Container */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-2xl border-b border-slate-200/60 shadow-[0_1px_40px_rgba(0,0,0,0.02)]">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-5">
              <div className="bg-slate-900 w-16 h-16 rounded-[1.8rem] flex items-center justify-center shadow-2xl relative group overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <ChefHat size={32} className="text-white relative z-10" />
              </div>
              <div>
                <h1 className="text-4xl font-black text-slate-900 tracking-tighter">ครัวป้ากุ้ง</h1>
                <div className="flex items-center gap-2 mt-1">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">ระบบจัดการครัวแบบเรียลไทม์</p>
                </div>
              </div>
            </div>

            <div className="hidden md:flex items-center gap-4 bg-slate-50 p-2 rounded-2xl border border-slate-100">
              <div className="px-5 py-2">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">ยอดจดออเดอร์</p>
                <p className="text-xl font-black text-slate-900 leading-none">{orders.length}</p>
              </div>
              <div className="w-px h-8 bg-slate-200"></div>
              <button
                onClick={async () => {
                  await supabase.auth.signOut();
                  router.push('/staff');
                }}
                className="bg-white hover:bg-red-50 text-red-500 px-6 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all border border-slate-100 shadow-sm"
              >
                ออกจากระบบ
              </button>
            </div>

            {/* Mobile Logout (Small Icon) */}
            <button
              onClick={async () => {
                await supabase.auth.signOut();
                router.push('/staff');
              }}
              className="md:hidden bg-red-50 text-red-500 p-4 rounded-2xl border border-red-100 shadow-sm"
            >
              <BellRing size={20} />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-4 mt-8">
            {[
              { label: 'รอดำเนินการ', count: orders.filter(o => o.status === 'กำลังเตรียม').length, icon: <Timer size={20} />, color: 'slate' },
              { label: 'กำลังทำ', count: orders.filter(o => o.status === 'กำลังทำ').length, icon: <ChefHat size={20} />, color: 'indigo' },
              {
                label: 'เสร็จแล้ว',
                count: orders.filter(o => isFinished(o.status)).length,
                icon: <CheckCircle2 size={20} />,
                color: 'emerald',
                action: async () => {
                  if (confirm('ต้องการนำออเดอร์ที่ทำเสร็จแล้วทั้งหมดออกจากหน้าจอใช่หรือไม่?')) {
                    const finishedIds = orders.filter(o => isFinished(o.status)).map(o => o.id);
                    if (finishedIds.length === 0) return;

                    // Optimistic update
                    setOrders(prev => prev.map(o => isFinished(o.status) ? { ...o, status: 'เสิร์ฟแล้ว' } : o));

                    try {
                      await supabase.from('orders').update({ status: 'เสิร์ฟแล้ว' }).in('id', finishedIds);
                    } catch (e) {
                      console.error('Clear all finished failed:', e);
                    }
                  }
                }
              },
            ].map((stat, i) => (
              <div key={i} className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm hover:translate-y-[-2px] transition-all group relative">
                <div className="flex items-center justify-between mb-3">
                  <div className={`p-2 rounded-xl bg-${stat.color}-50 text-${stat.color}-600 group-hover:bg-${stat.color}-600 group-hover:text-white transition-colors`}>
                    {stat.icon}
                  </div>
                  <div className="text-4xl font-black text-slate-900 tracking-tighter">{stat.count}</div>
                </div>
                <div className="flex justify-between items-center">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.1em]">{stat.label}</div>
                  {stat.action && stat.count > 0 && (
                    <button
                      onClick={stat.action}
                      className="text-[9px] font-black text-emerald-600 hover:text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg uppercase transition-colors"
                    >
                      เคลียร์ทั้งหมด
                    </button>
                  )}
                </div>
              </div>
            ))}
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
                {/* Header Section */}
                <div className="p-7 bg-white">
                  <div className="flex justify-between items-start mb-6">
                    <div className="flex items-center gap-5">
                      <div className="w-16 h-16 bg-slate-900 rounded-[1.8rem] flex items-center justify-center text-white text-2xl font-black shadow-xl shrink-0">
                        {order.table_no}
                      </div>
                      <div>
                        <h3 className="text-2xl font-black text-slate-900 tracking-tight">โต๊ะ {order.table_no}</h3>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest flex items-center gap-1.5">
                            <Clock size={12} /> {new Date(order.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${isFinished(order.status)
                      ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                      : order.status === 'กำลังทำ'
                        ? 'bg-indigo-50 text-indigo-600 border-indigo-100'
                        : 'bg-slate-50 text-slate-400 border-slate-100'
                      }`}>
                      {order.status === 'กำลังเตรียม' ? 'รอดำเนินการ' : order.status === 'กำลังทำ' ? 'ภายในครัว' : 'เสร็จแล้ว'}
                    </div>
                  </div>
                </div>

                {/* Items List */}
                <div className="p-4 space-y-3 bg-white mx-4 my-2 rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                  {order.items?.map((item, idx) => {
                    const finished = item.finished_quantity || 0;
                    const total = item.quantity;
                    const isDone = item.isDone || finished === total || item.status === 'done';
                    const isCooking = item.status === 'cooking' && !isDone;

                    return (
                      <div
                        key={idx}
                        className={`flex flex-col p-5 border-2 rounded-[2rem] transition-all relative ${isDone ? 'bg-emerald-50/50 border-emerald-100 opacity-80' : isCooking ? 'bg-orange-50/50 border-orange-100' : 'bg-white border-slate-50 shadow-sm'
                          }`}
                      >
                        <div className="flex justify-between items-start mb-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-1">
                              <span className={`font-black text-2xl transition-all ${isDone ? 'text-emerald-700 line-through' : 'text-[#2D3436]'
                                }`}>
                                {item.name}
                              </span>
                              <div className={`px-4 py-1.5 rounded-2xl text-lg font-black shrink-0 shadow-sm ${isDone ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-white'
                                }`}>
                                x{item.quantity}
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-2 items-center">
                              {item.isSpecial && (
                                <span className="text-white font-black text-[10px] uppercase bg-red-600 px-3 py-1 rounded-lg">
                                  ⭐ พิเศษ
                                </span>
                              )}
                              {item.selectedNoodle && (
                                <span className="text-[11px] bg-slate-100 text-[#555] px-3 py-1 rounded-lg font-black border border-slate-200">
                                  {item.selectedNoodle}
                                </span>
                              )}
                            </div>

                            {item.note && (
                              <p className="text-sm text-[#7C9070] font-bold mt-3 bg-white/60 border border-[#7C9070]/10 px-4 py-2 rounded-2xl inline-block shadow-sm">
                                บันทึก: {item.note}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col gap-4">
                          {/* Workflow Actions */}
                          {!isDone && (
                            <div className="flex items-center gap-3">
                              {item.status !== 'cooking' ? (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const newItems = [...order.items];
                                    newItems[idx] = { ...item, status: 'cooking' };
                                    setOrders(prev => prev.map(o => o.id === order.id ? { ...o, items: newItems, status: o.status === 'กำลังเตรียม' ? 'กำลังทำ' : o.status } : o));
                                    supabase.from('orders').update({ items: newItems }).eq('id', order.id);
                                  }}
                                  className="flex-1 bg-indigo-50 text-indigo-600 py-4 rounded-2xl font-black text-xs uppercase tracking-[0.2em] border border-indigo-100 hover:bg-indigo-100 transition-all flex items-center justify-center gap-2 shadow-sm"
                                >
                                  <ChefHat size={16} /> เริ่มลงมือทำ
                                </button>
                              ) : (
                                <div className="flex-1 flex gap-2">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      updateItemFinishedQuantity(order.id, idx, 1);
                                    }}
                                    className="flex-[2] bg-emerald-600 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-lg shadow-emerald-100 hover:bg-emerald-700 active:scale-95 transition-all flex items-center justify-center gap-2"
                                  >
                                    <CheckCircle2 size={16} /> ทำเสร็จ +1 จาน
                                  </button>
                                  {total > 1 && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleItemStatus(order.id, idx);
                                      }}
                                      className="flex-1 bg-slate-900 text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-tighter hover:bg-black transition-all"
                                    >
                                      เสร็จสิ้น
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Standard Progress UI (Always visible if more than 1) */}
                          {total > 1 && (
                            <div className="space-y-2">
                              <div className="flex justify-between items-center px-1">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">ความคืบหน้า ({finished}/{total} จาน)</p>
                                <p className="text-[10px] font-black text-emerald-600">{Math.round((finished / total) * 100)}%</p>
                              </div>
                              <div className="h-4 bg-slate-100 rounded-full overflow-hidden border border-slate-200/50 flex p-0.5">
                                {Array.from({ length: total }).map((_, i) => (
                                  <div
                                    key={i}
                                    className={`flex-1 mx-0.5 rounded-sm transition-all duration-500 ${i < finished ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'bg-slate-200/50'
                                      }`}
                                  />
                                ))}
                              </div>
                            </div>
                          )}

                          {isDone && (
                            <div className="bg-emerald-50 text-emerald-600 py-4 rounded-2xl font-black text-xs text-center flex items-center justify-center gap-2 border border-emerald-100 shadow-sm animate-in fade-in duration-500">
                              <CheckCircle2 size={16} /> ทำเสร็จเรียบร้อยแล้ว
                            </div>
                          )}
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
                    <button
                      onClick={(e) => { e.stopPropagation(); updateStatus(order.id, 'เสิร์ฟแล้ว'); }}
                      className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-5 rounded-[1.8rem] text-center font-black text-lg flex items-center justify-center gap-2 shadow-lg shadow-green-100 transition-all active:scale-95"
                    >
                      <CheckCircle2 size={24} strokeWidth={3} /> นำออกจากจอ (เสิร์ฟแล้ว)
                    </button>
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