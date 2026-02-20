"use client";
import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {
  Utensils, ClipboardList, TrendingUp, Plus,
  Search, Edit3, Trash2, X, Image as ImageIcon,
  Check, UploadCloud, Clock, ChefHat, CheckCircle2,
  Loader2, Calendar, DollarSign, ListFilter, ListChecks,
  PlusCircle, Timer, BellRing, Eye, EyeOff, LayoutGrid, QrCode, Wallet, Users
} from 'lucide-react';

export default function AdminApp() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'menu' | 'billing' | 'sales' | 'floor'>('floor');
  const [isTableManageMode, setIsTableManageMode] = useState(false);
  const [orderSubTab, setOrderSubTab] = useState('กำลังทำ');
  const [menus, setMenus] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [tables, setTables] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('ทั้งหมด');
  const [isSaving, setIsSaving] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState<'DISCONNECTED' | 'CONNECTING' | 'SUBSCRIBED' | 'ERROR'>('DISCONNECTED');
  const [lastEventTime, setLastEventTime] = useState<string>('ยังไม่มีข้อมูล');
  const [isAudioUnlocked, setIsAudioUnlocked] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ✅ จัดการเรื่องวันที่ให้เป็นปัจจุบันตามเวลาไทย (init ทันที)
  const [salesViewMode, setSalesViewMode] = useState<'daily' | 'monthly'>('daily');
  const [selectedSalesDate, setSelectedSalesDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
  const [selectedSalesMonth, setSelectedSalesMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  useEffect(() => {
    // Keep it here as backup or for manual re-sync if needed
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (!selectedSalesDate) setSelectedSalesDate(today);
    if (!selectedSalesMonth) setSelectedSalesMonth(month);
  }, []);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [noodleTypes, setNoodleTypes] = useState(['เส้นเล็ก', 'เส้นใหญ่', 'บะหมี่', 'หมี่ขาว']);
  const [customNoodle, setCustomNoodle] = useState('');

  const [formData, setFormData] = useState({
    name: '', price: '', category: 'เมนูข้าว', image_url: '', imageFile: null as File | null, noodle_options: [] as string[]
  });

  const [isUnlocking, setIsUnlocking] = useState(false);

  // States for Table Management
  const [newTableNo, setNewTableNo] = useState('');
  const [newTableCapacity, setNewTableCapacity] = useState('4');
  const [showQrModal, setShowQrModal] = useState<string | null>(null);
  const [isAddingTable, setIsAddingTable] = useState(false);

  // State for Interactive Floor Plan Popup
  const [selectedTableDetail, setSelectedTableDetail] = useState<any | null>(null);

  // Minimalist State: Hide/Show Payment History
  const [showPaymentHistory, setShowPaymentHistory] = useState(false);

  // State for Sales Detail Popup
  const [selectedOrderForDetail, setSelectedOrderForDetail] = useState<any | null>(null);

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
      console.error('Web Audio Play Error:', e);
    }
  };

  const unlockAudio = () => {
    setIsUnlocking(true);
    try {
      // 1. Initialize AudioContext on user gesture
      const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass();

      // 2. Resume & Play a silent test tone to confirm unlock
      ctx.resume().then(() => {
        audioContextRef.current = ctx;
        playNotificationSound(); // Play test sound
        setIsAudioUnlocked(true);
        localStorage.setItem('audio_unlocked', 'true');
        console.log('Web Audio Context Unlocked');
      }).catch((e: any) => {
        alert('Unlock error: ' + e.message);
      }).finally(() => {
        setIsUnlocking(false);
      });
    } catch (e: any) {
      alert('Browser not compatible with Web Audio: ' + e.message);
      setIsUnlocking(false);
    }
  };

  useEffect(() => {
    fetchMenus();
    fetchOrders();
    fetchTables();

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
            console.log('Audio auto-resumed via interaction');
          });
        } catch (e) {
          console.error('Auto-resume failed', e);
        }
      }
      // ลบ event listener หลังจากใช้งานครั้งแรก
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('touchstart', handleFirstInteraction);
    };

    window.addEventListener('click', handleFirstInteraction);
    window.addEventListener('touchstart', handleFirstInteraction);

    const channel = new BroadcastChannel('restaurant_demo_channel');
    channel.onmessage = (event) => {
      const { type, id, status, table_no } = event.data;
      if (type === 'ORDER_UPDATE') {
        // ✅ Case: Table-wide update (e.g., Billing or Payment)
        if ((status === 'เรียกเช็คบิล' || status === 'เสร็จสิ้น') && table_no) {
          setOrders(prev => prev.map(o => (String(o.table_no) === String(table_no) && o.status !== 'เสร็จสิ้น') ? { ...o, status } : o));
          if (status === 'เรียกเช็คบิล') playNotificationSound();
          return;
        }

        // Single order update
        setOrders(prev => {
          const exists = prev.find(o => o.id === id);
          if (exists) {
            return prev.map(o => o.id === id ? { ...o, ...event.data } : o);
          }
          return prev;
        });
      }
    };

    const menuSub = supabase.channel('menu_change').on('postgres_changes', { event: '*', schema: 'public', table: 'menus' }, () => fetchMenus()).subscribe();

    const tableSub = supabase.channel('table_change').on('postgres_changes', { event: '*', schema: 'public', table: 'tables' }, () => fetchTables()).subscribe();

    const orderSub = supabase.channel('order_change').on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'orders'
    }, (payload: any) => {
      console.log('Real-time order change received:', payload);
      setLastEventTime(new Date().toLocaleTimeString('th-TH'));

      if (payload.eventType === 'INSERT') {
        playNotificationSound();
        fetchOrders(true); // Force fetch on new order
      } else if (payload.eventType === 'UPDATE') {
        // If it's a simple status/item update, update locally instead of full fetch
        const updatedOrder = payload.new;
        const excludedStatuses = ['เสร็จสิ้น', 'ยกเลิก', 'ออร์เดอร์ยกเลิก'];
        setOrders(prev => {
          const exists = prev.find(o => o.id === updatedOrder.id);
          if (exists) {
            // Update existing order in state
            return prev.map(o => o.id === updatedOrder.id ? { ...o, ...updatedOrder } : o);
          } else if (!excludedStatuses.includes(updatedOrder.status)) {
            // Only add NEW relevant orders (not paid/cancelled ones) that we may have missed
            return [...prev, updatedOrder].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
          }
          return prev;
        });

        if (updatedOrder.status === 'เรียกเช็คบิล') {
          playNotificationSound();
        }
      } else {
        fetchOrders();
      }
    }).subscribe((status) => {
      console.log('Real-time Status:', status);
      if (status === 'SUBSCRIBED') setRealtimeStatus('SUBSCRIBED');
      else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') setRealtimeStatus('ERROR');
      else setRealtimeStatus('CONNECTING');
    });

    return () => {
      supabase.removeChannel(menuSub);
      supabase.removeChannel(tableSub);
      supabase.removeChannel(orderSub);
      channel.close();
    };
  }, []);

  /* --- MOCK DATA FOR DEMO --- */
  const MOCK_MENUS = [
    { id: 1, name: "ข้าวผัดปู", price: 80, category: "เมนูข้าว", image_url: "https://images.unsplash.com/photo-1563379926898-05f4575a45d8?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80", is_available: true },
    { id: 2, name: "ก๋วยเตี๋ยวต้มยำ", price: 120, category: "เมนูเส้น", image_url: "https://images.unsplash.com/photo-1555126634-323283e090fa?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80", is_available: true, noodle_options: ['เส้นเล็ก', 'เส้นใหญ่'] },
    { id: 3, name: "ผัดกะเพรา", price: 60, category: "เมนูข้าว", image_url: "https://images.unsplash.com/photo-1599305090598-fe179d501227?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80", is_available: true },
    { id: 4, name: "ต้มยำกุ้ง", price: 150, category: "กับข้าว", image_url: "https://images.unsplash.com/photo-1548943487-a2e4e43b485c?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80", is_available: true },
  ];

  const MOCK_ORDERS = [
    { id: 101, table_no: '5', status: 'เสร็จสิ้น', created_at: new Date().toISOString(), total_price: 150, items: [{ name: "ต้มยำกุ้ง", quantity: 1, price: 150, selectedNoodle: "" }] },
    { id: 102, table_no: '2', status: 'เสร็จสิ้น', created_at: new Date(Date.now() - 1000 * 60 * 10).toISOString(), total_price: 80, items: [{ name: "ข้าวผัดปู", quantity: 1, price: 80 }] },
    { id: 103, table_no: '3', status: 'เสร็จสิ้น', created_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(), total_price: 120, items: [{ name: "ก๋วยเตี๋ยวต้มยำ", quantity: 1, price: 120 }] },
    { id: 104, table_no: '7', status: 'เสร็จสิ้น', created_at: new Date(Date.now() - 1000 * 60 * 120).toISOString(), total_price: 200, items: [{ name: "ผัดกะเพรา", quantity: 2, price: 60 }, { name: "ข้าวผัดปู", quantity: 1, price: 80 }] }
  ];

  /* --- Fetching Logic --- */
  /* --- Fetching Logic (Hybrid: Real DB -> LocalStorage -> Mock) --- */
  const fetchMenus = async () => {
    try {
      // 1. Try Fetching from Real Database
      const { data, error } = await supabase.from('menus').select('*').order('id', { ascending: false });

      if (!error) {
        // ถ้า query สำเร็จ (แม้จะไม่มีข้อมูล) ให้ใช้ข้อมูลจาก DB
        setMenus(data || []);
        if (typeof window !== 'undefined') localStorage.setItem('demo_menus', JSON.stringify(data || []));
      } else {
        // กรณี Error จริงๆ (เช่น No connection) ถึงจะใช้ Mock/Cache
        console.warn("Supabase fetch error, using Cached/Mock Menus:", error);
        if (typeof window !== 'undefined') {
          const savedMenus = localStorage.getItem('demo_menus');
          if (savedMenus) setMenus(JSON.parse(savedMenus));
          else setMenus(MOCK_MENUS);
        } else {
          setMenus(MOCK_MENUS);
        }
      }
    } catch (e) {
      console.warn("Fetch Exception", e);
      setMenus(MOCK_MENUS);
    }
  };

  const fetchTables = async () => {
    try {
      const { data, error } = await supabase.from('tables').select('*').order('table_number', { ascending: true });
      if (!error) setTables(data || []);
    } catch (e) {
      console.warn("Fetch Tables Exception", e);
    }
  };

  const handleAddTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTableNo) return;

    // ✅ ป้องกันการเพิ่มเลขโต๊ะซ้ำ
    const isDuplicate = tables.some(t => t.table_number.toString() === newTableNo.trim());
    if (isDuplicate) {
      alert(`มีเลขโต๊ะ ${newTableNo} ในระบบอยู่แล้ว ไม่สามารถเพิ่มซ้ำได้`);
      return;
    }

    setIsAddingTable(true);
    try {
      const { error } = await supabase.from('tables').insert([{
        table_number: newTableNo.trim(),
        capacity: parseInt(newTableCapacity),
        status: 'available'
      }]);
      if (!error) {
        setNewTableNo('');
        fetchTables();
      } else {
        alert("ไม่สามารถเพิ่มโต๊ะได้: " + error.message);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsAddingTable(false);
    }
  };

  const handleDeleteTable = async (id: number) => {
    if (!confirm("ต้องการลบโต๊ะนี้ใช่หรือไม่?")) return;
    try {
      const { error } = await supabase.from('tables').delete().eq('id', id);
      if (!error) fetchTables();
    } catch (e) {
      console.error(e);
    }
  };

  const lastFetchTimeRef = useRef<number>(0);
  const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const fetchOrders = async (force = false) => {
    const now = Date.now();
    // Debounce: prevent fetching more than once every 1500ms unless forced
    if (!force && lastFetchTimeRef.current && (now - lastFetchTimeRef.current < 1500)) {
      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
      fetchTimeoutRef.current = setTimeout(() => fetchOrders(), 1600);
      return;
    }

    lastFetchTimeRef.current = now;
    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current);
      fetchTimeoutRef.current = null;
    }

    try {
      // 1. Fetch from Real Database - Fetch desde el inicio del mes pasado para tener historial de ventas
      // ✅ ดึง 1000 รายการล่าสุดเพื่อให้ครอบคลุมข้อมูลปัจจุบันทั้งหมด
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1000);

      if (!error) {
        // ✅ If database fetch succeeded, use it (even if empty) to prevent "hanging" old data
        const baseOrders = data || [];
        setOrders(baseOrders);
        if (typeof window !== 'undefined') {
          localStorage.setItem('demo_admin_orders', JSON.stringify(baseOrders));
        }
      } else {
        // ❌ Only fallback to localStorage if there was a real network/database error
        console.warn("Supabase fetch error, using Cached orders:", error);
        if (typeof window !== 'undefined') {
          const savedOrdersStr = localStorage.getItem('demo_admin_orders');
          if (savedOrdersStr) {
            setOrders(JSON.parse(savedOrdersStr));
          } else {
            setOrders(MOCK_ORDERS);
          }
        } else {
          setOrders(MOCK_ORDERS);
        }
      }

      if (error) console.warn("Supabase Fetch Error", error);
    } catch (e) {
      console.warn("Fetch Exception", e);
      setOrders(MOCK_ORDERS);
    }
  };

  /* --- CRUD Operations (Effective Local State) --- */
  const updateOrderStatus = async (id: number, newStatus: string, tableNo?: string) => {
    // 1. Prepare updated orders array
    const now = new Date().toISOString();
    const cleanTableNo = tableNo ? String(tableNo).trim() : '';
    let updatedOrders;
    if (newStatus === 'เสร็จสิ้น' && cleanTableNo) {
      // ✅ If paying, close ONLY active orders for that table (don't overwrite old sessions' updated_at)
      updatedOrders = orders.map(o => (
        String(o.table_no).trim() === cleanTableNo &&
        !['เสร็จสิ้น', 'ยกเลิก', 'ออร์เดอร์ยกเลิก'].includes(o.status || '')
      ) ? { ...o, status: newStatus, updated_at: now } : o);
    } else {
      updatedOrders = orders.map(o => o.id === id ? { ...o, status: newStatus, updated_at: now } : o);
    }

    // 2. Local State & Storage Update
    setOrders(updatedOrders);
    if (typeof window !== 'undefined') localStorage.setItem('demo_admin_orders', JSON.stringify(updatedOrders));

    // 3. Broadcast to Customer/Kitchen
    const channel = new BroadcastChannel('restaurant_demo_channel');
    channel.postMessage({
      type: 'ORDER_UPDATE',
      id,
      status: newStatus,
      table_no: tableNo || orders.find(o => o.id === id)?.table_no
    });

    // 4. Supabase Update
    try {
      if (newStatus === 'เสร็จสิ้น' && tableNo) {
        // Calculate Total Amount from ALL non-finished orders for this table
        const tableOrders = orders.filter(o => String(o.table_no) === String(tableNo) && o.status !== 'เสร็จสิ้น');
        const totalAmount = tableOrders.reduce((sum, o) => sum + (Number(o.total_price) || 0), 0);

        // 4.1 Update all orders for this table to 'เสร็จสิ้น'
        // ปรับปรุง Filter ให้แม่นยำและรองรับการทำงานของ Supabase 100%
        const { error: updateError } = await supabase.from('orders')
          .update({
            status: newStatus,
            updated_at: new Date().toISOString()
          })
          .eq('table_no', cleanTableNo)
          .not('status', 'in', '(เสร็จสิ้น,ยกเลิก,ออร์เดอร์ยกเลิก)');

        if (updateError) {
          // Fallback: หากหาด้วย String ไม่เจอ ให้ลองหาด้วย Number
          const tableInt = parseInt(cleanTableNo);
          if (!isNaN(tableInt)) {
            await supabase.from('orders')
              .update({ status: newStatus, updated_at: new Date().toISOString() })
              .eq('table_no', tableInt)
              .not('status', 'in', '(เสร็จสิ้น,ยกเลิก,ออร์เดอร์ยกเลิก)');
          }
        }

        if (updateError) console.error("Database Update Error:", updateError);

        // 4.2 Reset Table Status to 'available'
        await supabase.from('tables').update({ status: 'available' }).eq('table_number', cleanTableNo);

        // 4.3 อัปเดตสถานะใน local state ทันที (เฉพาะรายการที่ยังไม่จบ)
        setOrders(prev => prev.map(o => (
          String(o.table_no).trim() === cleanTableNo &&
          !['เสร็จสิ้น', 'ยกเลิก', 'ออร์เดอร์ยกเลิก'].includes(o.status || '')
        ) ? { ...o, status: newStatus, updated_at: now } : o));
        setTables(prev => prev.map(t => String(t.table_number).trim() === cleanTableNo ? { ...t, status: 'available' } : t));

        // 4.4 รอสักครู่เพื่อให้ DB มั่นใจ แล้วค่อย fetch ใหม่
        setTimeout(async () => {
          await fetchTables();
          await fetchOrders(true);
        }, 1000);

      } else {
        await supabase.from('orders').update({
          status: newStatus,
          updated_at: now
        }).eq('id', id);

        // Update table status based on newStatus
        const tNo = tableNo || orders.find(o => o.id === id)?.table_no;
        if (tNo) {
          const dbStatus = newStatus === 'เรียกเช็คบิล' ? 'billing' : 'occupied';
          if (['กำลังเตรียม', 'กำลังทำ', 'เสร็จแล้ว', 'เรียกเช็คบิล'].includes(newStatus)) {
            await supabase.from('tables').update({ status: dbStatus }).eq('table_number', tNo);
          }
        }
      }
    } catch (e) {
      console.warn('Supabase update failed:', e);
    }
  };

  const deleteOrder = async (id: number) => {
    if (confirm("ต้องการลบข้อมูลออเดอร์นี้ออกจากระบบใช่หรือไม่?")) {
      // Optimistic Delete
      const updatedOrders = orders.filter(o => o.id !== id);
      setOrders(updatedOrders);

      // Save to Persistence
      if (typeof window !== 'undefined') localStorage.setItem('demo_admin_orders', JSON.stringify(updatedOrders));

      await supabase.from('orders').delete().eq('id', id);
    }
  };

  const deleteMenu = async (id: number) => {
    if (confirm("ยืนยันการลบเมนูนี้?")) {
      // Optimistic Delete
      const updatedMenus = menus.filter(m => m.id !== id);
      setMenus(updatedMenus);

      if (typeof window !== 'undefined') localStorage.setItem('demo_menus', JSON.stringify(updatedMenus));

      // Broadcast Delete to Customer
      const channel = new BroadcastChannel('restaurant_demo_channel');
      channel.postMessage({ type: 'MENU_UPDATE', action: 'DELETE', id });

      await supabase.from('menus').delete().eq('id', id);
    }
  };

  const toggleMenuAvailability = async (id: number, currentStatus: boolean) => {
    // Optimistic Update
    const updatedMenus = menus.map(m => m.id === id ? { ...m, is_available: !currentStatus } : m);
    setMenus(updatedMenus);

    if (typeof window !== 'undefined') localStorage.setItem('demo_menus', JSON.stringify(updatedMenus));

    const newItem = updatedMenus.find(m => m.id === id);

    // Broadcast Update to Customer
    const channel = new BroadcastChannel('restaurant_demo_channel');
    if (newItem) {
      channel.postMessage({ type: 'MENU_UPDATE', action: 'UPSERT', item: newItem });
    }

    await supabase.from('menus').update({ is_available: !currentStatus }).eq('id', id);
  };

  // ✅ กรองรายชื่อโต๊ะที่ต้องแสดงในหน้าเช็คบิล (Source of Truth คือสถานะ Table)
  const billingTables = tables.filter(t => t.status === 'billing').map(t => String(t.table_number));

  // โโต๊ะที่มีออเดอร์ค้าง และสถานะกำลังรอเช็คบิล (ใช้ logic เดียวกับหน้าแสดงผล 100%)
  const tablesForBilling = Array.from(new Set(
    orders.filter(o => o.status === 'เรียกเช็คบิล' && billingTables.includes(String(o.table_no))).map(o => String(o.table_no))
  ));

  const billingOrdersCount = tablesForBilling.length;

  const handleEditClick = (item: any) => {
    setEditingId(item.id);
    setFormData({
      name: item.name, price: item.price.toString(), category: item.category,
      image_url: item.image_url, imageFile: null, noodle_options: item.noodle_options || []
    });
    setIsModalOpen(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setFormData({ ...formData, imageFile: file, image_url: URL.createObjectURL(file) });
  };

  /* --- Helper Functions --- */
  const formatOrderTime = (date: string) => {
    if (!date) return '(เพิ่งสั่ง)';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '(เพิ่งสั่ง)';
    return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';
  };

  const handleAddCustomNoodle = () => {
    const trimmed = customNoodle.trim();
    if (trimmed !== '' && !noodleTypes.includes(trimmed)) {
      setNoodleTypes([...noodleTypes, trimmed]);
      setFormData(prev => ({ ...prev, noodle_options: [...prev.noodle_options, trimmed] }));
      setCustomNoodle('');
    }
  };

  const handleDeleteNoodleType = (noodleToDelete: string) => {
    if (confirm(`ต้องการลบตัวเลือก "${noodleToDelete}" ?`)) {
      setNoodleTypes(prev => prev.filter(n => n !== noodleToDelete));
      setFormData(prev => ({ ...prev, noodle_options: prev.noodle_options.filter(n => n !== noodleToDelete) }));
    }
  };

  const toggleNoodle = (noodle: string) => {
    setFormData(prev => ({
      ...prev,
      noodle_options: prev.noodle_options.includes(noodle)
        ? prev.noodle_options.filter(t => t !== noodle)
        : [...prev.noodle_options, noodle]
    }));
  };

  const handleSaveMenu = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!formData.name || !formData.price) {
      alert("กรุณากรอกชื่อและราคาให้ครบถ้วน");
      return;
    }
    setIsSaving(true);
    let finalImageUrl = formData.image_url;

    // LOCAL UPDATE LOGIC (DEMO MODE)
    const newMenuData = {
      id: editingId || Date.now(), // Generate fake ID for new items
      name: formData.name,
      price: Number(formData.price),
      category: formData.category,
      image_url: finalImageUrl || "https://via.placeholder.com/150",
      noodle_options: formData.noodle_options,
      has_noodle: (formData.noodle_options && formData.noodle_options.length > 0),
      is_available: true
    };

    let updatedMenus;
    if (editingId) {
      updatedMenus = menus.map(m => m.id === editingId ? { ...m, ...newMenuData } : m);
    } else {
      updatedMenus = [newMenuData, ...menus];
    }

    setMenus(updatedMenus);
    if (typeof window !== 'undefined') localStorage.setItem('demo_menus', JSON.stringify(updatedMenus));

    // Broadcast change to Customer Page
    const channel = new BroadcastChannel('restaurant_demo_channel');
    channel.postMessage({ type: 'MENU_UPDATE', action: 'UPSERT', item: newMenuData });

    try {
      if (formData.imageFile) {
        const fileName = `${Date.now()}-${formData.imageFile.name}`;
        await supabase.storage.from('menu-images').upload(fileName, formData.imageFile);
        const { data: publicUrlData } = supabase.storage.from('menu-images').getPublicUrl(fileName);
        finalImageUrl = publicUrlData.publicUrl;
      }

      const menuPayload = {
        name: formData.name, price: Number(formData.price), category: formData.category,
        image_url: finalImageUrl, noodle_options: formData.noodle_options,
        has_noodle: (formData.noodle_options && formData.noodle_options.length > 0)
      };

      if (editingId) await supabase.from('menus').update(menuPayload).eq('id', editingId);
      else await supabase.from('menus').insert([{ ...menuPayload, is_available: true }]);
    } catch (err: any) {
      console.warn("Supabase save failed (Demo Mode) - Ignoring error", err);
    } finally {
      setIsSaving(false);
      setIsModalOpen(false);
      setEditingId(null);
      setFormData({ name: '', price: '', category: 'เมนูข้าว', image_url: '', imageFile: null, noodle_options: [] });
    }
  };

  /* --- Login State --- */
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginEmail, setLoginEmail] = useState(''); // เปลี่ยนจาก Username เป็น Email ตามมาตรฐาน Supabase
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  // ตรวจสอบ Session เมื่อเปิดหน้าเว็บ
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

      if (!profile || profile.role?.toLowerCase() !== 'admin') {
        router.push('/staff');
      } else {
        setIsLoggedIn(true);
      }
    };
    checkUser();
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAuthenticating(true);
    setLoginError(false);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: loginPassword,
      });

      if (error) {
        setLoginError(true);
      } else {
        setIsLoggedIn(true);
      }
    } catch (err) {
      setLoginError(true);
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/staff');
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-[#FFF7ED] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FFF0E6] text-[#000000] font-sans pb-32 relative">

      {/* แจ้งเตือนเช็คบิล */}
      {billingOrdersCount > 0 && (
        <div onClick={() => setActiveTab('billing')} className="fixed top-4 left-4 right-4 z-[110] bg-red-600 text-white p-4 rounded-3xl shadow-2xl flex items-center justify-between animate-bounce cursor-pointer border-2 border-white">
          <div className="flex items-center gap-4">
            <div className="bg-white/30 p-3 rounded-full"><BellRing size={28} className="animate-pulse" /></div>
            <div>
              <p className="font-black text-2xl">เรียกเช็คบิล! ({billingOrdersCount} โต๊ะ)</p>
            </div>
          </div>
          <button className="bg-white text-red-600 px-6 py-2 rounded-full text-sm font-black uppercase shadow-lg border-2 border-red-100">ดูบิล</button>
        </div>
      )}

      {/* Global Realtime Monitor & Test Sound */}
      {/* Global Audio Unlock Overlay */}
      {!isAudioUnlocked && (
        <div className="fixed inset-0 z-[999] bg-white flex items-center justify-center p-6 sm:p-10">
          <div className="w-full max-w-sm text-center">
            <div className="w-24 h-24 bg-orange-100 rounded-[2.5rem] flex items-center justify-center mx-auto mb-8 shadow-inner">
              <BellRing size={48} className={`text-[#FF4D00] ${isUnlocking ? 'animate-spin' : 'animate-bounce'}`} />
            </div>
            <h2 className="text-3xl font-black text-[#411E24] mb-4">เปิดเสียงแจ้งเตือน</h2>
            <p className="text-black font-bold mb-10 leading-relaxed px-4">
              คลิกปุ่มด้านล่างเพื่อเริ่มระบบเสียงแจ้งเตือน<br />
              ออเดอร์ใหม่และลูกค้าเรียกเช็คบิล<br />
              (เพื่อให้ทำงานได้บนมือถือ)
            </p>
            <button
              onClick={unlockAudio}
              disabled={isUnlocking}
              className={`w-full py-6 rounded-[2rem] font-black text-xl shadow-2xl transition-all flex items-center justify-center gap-3 active:scale-95 ${isUnlocking ? 'bg-gray-200 text-black' : 'bg-[#FF4D00] text-white shadow-orange-200 hover:scale-[1.02]'}`}
            >
              {isUnlocking ? 'กำลังเปิดเสียง...' : 'ตกลง เปิดเสียง ✨'}
            </button>
          </div>
        </div>
      )}

      {/* PROFESSIONAL TOP HEADER */}
      <header className="sticky top-0 z-[60] bg-white/80 backdrop-blur-xl border-b border-[#E8E4D8] px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex flex-col">
              <div className="flex items-center gap-3 mb-1">
                <div className={`w-3 h-3 rounded-full ${realtimeStatus === 'SUBSCRIBED' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                <span className="text-sm font-black text-[#2D3436] uppercase tracking-widest">เครือข่าย: {realtimeStatus === 'SUBSCRIBED' ? 'พร้อม' : 'ขัดข้อง'}</span>
              </div>
              <p className="text-xs text-[#636E72] font-bold ml-6">อัปเดตล่าสุด: {lastEventTime}</p>
            </div>
          </div>

          <div className="flex items-center gap-5">
            <button
              onClick={playNotificationSound}
              className={`group flex items-center gap-2 px-4 py-2 rounded-2xl text-[10px] font-black transition-all duration-300 border ${isAudioUnlocked ? 'bg-[#F0F4EF] text-[#7C9070] border-[#7C9070]/20' : 'bg-slate-50 text-slate-400 border-slate-100 hover:bg-slate-100'}`}
            >
              <BellRing size={14} className={isAudioUnlocked ? 'animate-bounce' : ''} />
              <span className="hidden sm:inline text-[#2D3436]">ทดสอบเสียง</span>
            </button>

            <button
              onClick={handleLogout}
              className="px-6 py-2.5 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white rounded-2xl text-xs font-black uppercase tracking-widest transition-all border-2 border-red-100"
            >
              ออกจากระบบ
            </button>
          </div>
        </div>
      </header>

      {activeTab === 'floor' && (
        <main className="p-6 max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700 pb-52">
          <header className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <h1 className="text-4xl font-black text-[#2D3436] tracking-tight mb-2">ผังที่นั่งร้านอาหาร</h1>
              <div className="text-[#636E72] font-medium flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                ตรวจสอบสถานะโต๊ะและการจองแบบ Real-time
              </div>
            </div>
            <button
              onClick={() => setIsTableManageMode(!isTableManageMode)}
              className={`flex items-center gap-2 px-8 py-3.5 rounded-2xl font-black text-sm transition-all duration-300 shadow-lg ${isTableManageMode ? 'bg-[#2D3436] text-white' : 'bg-white text-[#7C9070] border border-[#E8E4D8] shadow-sm hover:shadow-md hover:-translate-y-0.5'}`}
            >
              {isTableManageMode ? <LayoutGrid size={18} /> : <PlusCircle size={18} />}
              {isTableManageMode ? 'ดูแผนผังโต๊ะ' : 'แก้ไขผังร้าน'}
            </button>
          </header>

          {isTableManageMode ? (
            <div className="animate-in slide-in-from-top-4 duration-500">
              <form onSubmit={handleAddTable} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] mb-10 flex flex-col md:flex-row gap-6">
                <div className="flex-1">
                  <label className="text-xs font-black uppercase text-black ml-2 mb-3 block tracking-widest">หมายเลขโต๊ะ</label>
                  <input
                    type="text"
                    placeholder="เช่น 5, 12, VIP-1"
                    required
                    className="w-full bg-slate-50 rounded-2xl px-6 py-4 font-bold outline-none border border-transparent focus:border-orange-200 focus:bg-white transition-all text-slate-900"
                    value={newTableNo}
                    onChange={(e) => setNewTableNo(e.target.value)}
                  />
                </div>
                <div className="md:w-48">
                  <label className="text-xs font-black uppercase text-black ml-2 mb-3 block tracking-widest">จำนวนที่นั่ง</label>
                  <select
                    className="w-full bg-slate-50 rounded-2xl px-6 py-4 font-bold outline-none border border-transparent focus:border-orange-200 focus:bg-white transition-all text-slate-900 appearance-none"
                    value={newTableCapacity}
                    onChange={(e) => setNewTableCapacity(e.target.value)}
                  >
                    {[2, 4, 6, 8, 10, 12].map(num => <option key={num} value={num}>{num} ที่นั่ง</option>)}
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={isAddingTable}
                  className="md:mt-8 bg-slate-900 text-white px-10 py-4 rounded-2xl font-black text-sm shadow-xl hover:bg-slate-800 disabled:bg-slate-200 transition-all flex items-center justify-center gap-2"
                >
                  {isAddingTable ? 'กำลังเพิ่ม...' : <><PlusCircle size={20} /> เพิ่มโต๊ะใหม่</>}
                </button>
              </form>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {tables.map((table) => (
                  <div key={table.id} className="group bg-white p-6 rounded-[2.2rem] border border-slate-50 flex justify-between items-center shadow-[0_4px_20px_rgb(0,0,0,0.02)] hover:shadow-xl transition-all duration-500">
                    <div className="flex items-center gap-5">
                      <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center text-2xl font-black text-slate-900 group-hover:bg-orange-50 group-hover:border-orange-100 transition-colors">
                        {table.table_number}
                      </div>
                      <div>
                        <h4 className="font-black text-lg text-slate-900 mb-0.5">โต๊ะ {table.table_number}</h4>
                        <p className="text-[10px] text-black font-bold uppercase tracking-widest flex items-center gap-1.5">
                          <Users size={12} /> {table.capacity} ที่นั่ง • {table.status === 'available' ? 'ว่าง' : 'มีลูกค้า'}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowQrModal(table.table_number)}
                        className="p-3 bg-slate-50 text-black hover:bg-blue-50 hover:text-blue-500 rounded-2xl transition-all"
                        title="QR Menu"
                      >
                        <QrCode size={20} />
                      </button>
                      <button
                        onClick={() => handleDeleteTable(table.id)}
                        className="p-3 bg-slate-50 text-black hover:bg-red-50 hover:text-red-500 rounded-2xl transition-all"
                        title="ลบ"
                      >
                        <Trash2 size={20} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="animate-in fade-in duration-700">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                {tables.length === 0 ? (
                  <div className="col-span-full py-32 text-center bg-white rounded-[3rem] border-2 border-dashed border-slate-100 text-black font-bold flex flex-col items-center gap-4">
                    <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center text-black">
                      <LayoutGrid size={40} />
                    </div>
                    ยังไม่มีการตั้งค่าโต๊ะในขณะนี้<br />
                    คลิก "แก้ไขผังร้าน" เพื่อเริ่ม
                  </div>
                ) : (
                  tables.map((table) => {
                    // 🎯 FILTER: เอาเฉพาะออเดอร์ย้อนหลังไม่เกิน 12 ชม. เพื่อป้องกันโต๊ะค้าง
                    const twelveHoursAgo = Date.now() - 12 * 60 * 60 * 1000;
                    const tableNo = String(table.table_number).trim();

                    const activeOrders = orders.filter(o => {
                      const t = new Date(o.created_at).getTime();
                      return String(o.table_no).trim() === tableNo && t > twelveHoursAgo;
                    });

                    // ✅ ตามความต้องการเจ้าของร้าน: ถ้าเรียกเช็คบิลแล้ว ให้หน้าแผนผังขึ้นเป็น "ว่าง" ทันที
                    // เพื่อให้ดูออกว่ามีกี่โต๊ะที่ "กำลังนั่งกินอยู่จริงๆ" โดยไม่รวมพวกที่รอจ่ายเงินแล้วจะลุก
                    const isOccupied = activeOrders.some(o => !['เสร็จสิ้น', 'เรียกเช็คบิล', 'ยกเลิก', 'ออร์เดอร์ยกเลิก'].includes(o.status));

                    let statusClass = 'bg-white border-slate-100 text-slate-900 shadow-sm';
                    let labelClass = 'text-slate-400';
                    let statusText = 'โต๊ะว่าง';

                    if (isOccupied) {
                      statusClass = 'bg-[#7C9070] border-[#7C9070] text-white shadow-xl shadow-[#7C9070]/20';
                      labelClass = 'text-[#F0F4EF]';
                      statusText = 'มีออเดอร์';
                    }

                    return (
                      <button
                        key={table.id}
                        onClick={() => setSelectedTableDetail(table)}
                        className={`${statusClass} h-48 rounded-[2.5rem] border-2 transition-all duration-500 hover:scale-[1.03] hover:shadow-2xl active:scale-95 flex flex-col items-center justify-center gap-3 relative overflow-hidden group`}
                      >
                        <span className="text-2xl font-black tracking-tighter">{table.table_number}</span>
                        <div className="flex flex-col items-center">
                          <span className={`text-xl font-black uppercase tracking-[0.2em] mb-1 ${labelClass}`}>{statusText}</span>
                          <p className={`text-xs font-bold inline-flex items-center gap-1.5 opacity-80 ${labelClass}`}>
                            <Users size={16} /> {table.capacity} ที่นั่ง
                          </p>
                        </div>
                        {isOccupied && (
                          <div className="mt-2 bg-white/30 backdrop-blur-md px-4 py-1.5 rounded-full text-[8px] font-black uppercase tracking-widest border border-white/20 scale-90 group-hover:scale-100 transition-transform">
                            กำลังทาน
                          </div>
                        )}
                      </button>
                    );
                  })
                )}
              </div>

              <div className="mt-16 flex flex-wrap gap-6 justify-center">
                <div className="flex items-center gap-3 bg-white px-6 py-3 rounded-2xl border border-[#E8E4D8] shadow-sm">
                  <div className="w-3 h-3 bg-white border-2 border-[#BBC3C6] rounded-full"></div>
                  <span className="text-xs font-black text-[#636E72] tracking-wider">โต๊ะว่าง</span>
                </div>
                <div className="flex items-center gap-3 bg-white px-6 py-3 rounded-2xl border border-[#E8E4D8] shadow-sm">
                  <div className="w-3 h-3 bg-[#7C9070] rounded-full"></div>
                  <span className="text-xs font-black text-[#636E72] tracking-wider">มีลูกค้า</span>
                </div>
                <div className="flex items-center gap-3 bg-white px-6 py-3 rounded-2xl border border-[#E8E4D8] shadow-sm">
                  <div className="w-3 h-3 bg-amber-400 rounded-full animate-pulse"></div>
                  <span className="text-xs font-black text-[#636E72] tracking-wider">รอเช็คบิล</span>
                </div>
              </div>
            </div>
          )}
        </main>
      )}

      {activeTab === 'menu' && (
        <main className="p-6 max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700 pb-52">
          <header className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <h1 className="text-4xl font-black text-slate-900 tracking-tight mb-2">คลังรายการอาหาร</h1>
              <div className="text-black font-medium flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                จัดการเมนู ความพร้อมของสินค้า และราคา
              </div>
            </div>
            <button
              onClick={() => {
                setEditingId(null);
                setFormData({ name: '', price: '', category: 'เมนูข้าว', image_url: '', imageFile: null, noodle_options: [] });
                setIsModalOpen(true);
              }}
              className="bg-slate-900 text-white px-8 py-3.5 rounded-2xl font-black text-sm flex items-center gap-2 shadow-xl hover:bg-slate-800 hover:-translate-y-0.5 transition-all"
            >
              <Plus size={20} strokeWidth={3} /> เพิ่มเมนูใหม่
            </button>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
            <div className="bg-emerald-50 p-8 rounded-[2.5rem] border border-emerald-100 shadow-[0_4px_20px_rgb(0,0,0,0.02)] flex items-center gap-6 group">
              <div className="bg-white w-14 h-14 rounded-2xl flex items-center justify-center text-emerald-600 shadow-sm transition-transform group-hover:scale-110">
                <CheckCircle2 size={24} />
              </div>
              <div>
                <p className="text-[10px] font-black text-emerald-600/60 uppercase tracking-[0.2em] mb-1">เมนูที่เปิดขาย</p>
                <p className="text-4xl font-black text-slate-900">{menus.filter(m => m.is_available).length}</p>
              </div>
            </div>
            <div className="bg-slate-50 p-8 rounded-[2.5rem] border border-slate-100 shadow-[0_4px_20px_rgb(0,0,0,0.02)] flex items-center gap-6 group">
              <div className="bg-white w-14 h-14 rounded-2xl flex items-center justify-center text-slate-400 shadow-sm transition-transform group-hover:scale-110">
                <EyeOff size={24} />
              </div>
              <div>
                <p className="text-[10px] font-black text-black uppercase tracking-[0.2em] mb-1">สินค้าหมด</p>
                <p className="text-4xl font-black text-slate-900">{menus.filter(m => !m.is_available).length}</p>
              </div>
            </div>
          </div>

          <div className="flex gap-3 overflow-x-auto no-scrollbar mb-10 pb-2">
            {['ทั้งหมด', 'เมนูข้าว', 'เมนูเส้น', 'กับข้าว'].map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-8 py-3 rounded-2xl text-sm font-black transition-all duration-300 whitespace-nowrap border-2 ${selectedCategory === cat ? 'bg-black border-black text-white shadow-lg' : 'bg-white border-slate-100 text-black hover:border-orange-200 hover:text-orange-600'}`}
              >
                {cat === 'ทั้งหมด' ? 'ทุกหมวดหมู่' : cat}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {menus.filter(m => selectedCategory === 'ทั้งหมด' || m.category === selectedCategory).map((item) => (
              <div key={item.id} className="group bg-white p-4 md:p-5 rounded-[2rem] md:rounded-[2.5rem] shadow-[0_8px_30px_rgb(0,0,0,0.02)] flex items-center gap-4 md:gap-6 border border-slate-50 hover:border-orange-100 hover:shadow-xl transition-all duration-500">
                <div className={`w-20 h-20 md:w-24 md:h-24 rounded-[1.5rem] md:rounded-[1.8rem] overflow-hidden bg-slate-100 flex-shrink-0 shadow-sm ring-1 ring-slate-100 ${!item.is_available && 'grayscale opacity-40'}`}>
                  <img src={item.image_url || 'https://via.placeholder.com/150'} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" alt={item.name} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start mb-1 md:mb-2">
                    <div className="flex-1 min-w-0">
                      <h3 className={`font-black text-lg md:text-xl truncate ${!item.is_available ? 'text-slate-300' : 'text-slate-900'}`}>{item.name}</h3>
                      <div className="flex flex-wrap gap-1 mt-1 md:mt-2">
                        {item.noodle_options?.slice(0, 2).map((n: string) => (
                          <span key={n} className="bg-slate-50 text-black text-[8px] md:text-[9px] px-2 py-0.5 md:px-2.5 md:py-1 rounded-full font-black uppercase tracking-wider">#{n}</span>
                        ))}
                      </div>
                    </div>
                    <div className="text-right ml-2 md:ml-4 flex-shrink-0">
                      <p className="text-xl md:text-2xl font-black text-slate-900 tracking-tighter">฿{item.price}</p>
                      <p className="text-[8px] md:text-[9px] font-black text-black uppercase tracking-widest mt-1">ราคาต่อหน่วย</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-3 md:mt-4">
                    <div className="flex items-center gap-2 md:gap-3">
                      <button
                        onClick={() => toggleMenuAvailability(item.id, item.is_available)}
                        className={`w-10 h-5 md:w-12 md:h-6 rounded-full relative transition-all duration-500 ${item.is_available ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]' : 'bg-slate-200'}`}
                      >
                        <div className={`absolute top-0.5 md:top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${item.is_available ? 'right-0.5 md:right-1' : 'left-0.5 md:left-1'}`} />
                      </button>
                      <span className={`text-[8px] md:text-[10px] font-black uppercase tracking-widest ${item.is_available ? 'text-emerald-500' : 'text-slate-300'}`}>
                        {item.is_available ? 'เปิดขาย' : 'สินค้าหมด'}
                      </span>
                    </div>
                    <div className="flex gap-1 md:gap-2">
                      <button onClick={() => handleEditClick(item)} className="p-2 md:p-3 bg-slate-50 text-slate-400 hover:bg-orange-50 hover:text-orange-600 rounded-xl md:rounded-2xl transition-all"><Edit3 size={16} /></button>
                      <button onClick={() => deleteMenu(item.id)} className="p-2 md:p-3 bg-slate-50 text-slate-400 hover:bg-red-50 hover:text-red-500 rounded-xl md:rounded-2xl transition-all"><Trash2 size={16} /></button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </main>
      )}

      {
        activeTab === 'billing' && (
          <main className="p-6 max-w-5xl mx-auto animate-in slide-in-from-right-4 duration-700 pb-52">
            <header className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div>
                <h1 className="text-4xl font-black text-slate-900 tracking-tight mb-2">จัดการการชำระเงิน</h1>
                <div className="text-black font-medium flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  ตรวจสอบออเดอร์และยืนยันการชำระเงินของลูกค้า
                </div>
              </div>
              <div className="flex gap-3">

                <div onClick={() => fetchOrders(true)} className="bg-white p-4 rounded-2xl text-black hover:text-orange-600 cursor-pointer border border-slate-100 shadow-sm transition-all hover:shadow-md active:scale-95">
                  <ClipboardList size={28} strokeWidth={2.5} />
                </div>
              </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {(() => {
                // ใช้ตัวแปรเดียวกับการนับแจ้งเตือนด้านบน เพื่อให้ข้อมูล "เด้ง" ตรงกับ "บิล" และยอดเงินถูกต้อง
                const tablesWithBillingOrders = tablesForBilling;

                // ตรวจสอบความถูกต้องของสถานะโต๊ะ และกรองเฉพาะโต๊ะที่เรียกเช็คบิลจริงๆ
                const activeBillingTables = tablesWithBillingOrders.filter(tNo => {
                  const table = tables.find(t => String(t.table_number) === String(tNo));
                  return table?.status === 'billing';
                });

                if (activeBillingTables.length === 0) {
                  return (
                    <div className="col-span-full py-32 text-center bg-white rounded-[3rem] border-2 border-dashed border-slate-100 flex flex-col items-center gap-4">
                      <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center text-slate-200">
                        <Wallet size={40} />
                      </div>
                      <p className="text-slate-300 font-bold">ไม่มีรายการรอเช็คบิลในขณะนี้</p>
                    </div>
                  );
                }

                return activeBillingTables.map((tableNo) => {
                  // ✅ กรองเฉพาะออเดอร์ที่ลูกค้า "เรียกเช็คบิล" ในรอบปัจจุบันจริง ๆ
                  // โดยการหาออเดอร์ที่มีสถานะ 'เรียกเช็คบิล' และมีรายการอาหาร (ป้องกัน junk data)
                  const allBillingOrders = orders.filter(o =>
                    String(o.table_no) === String(tableNo) &&
                    o.status === 'เรียกเช็คบิล' &&
                    o.items && o.items.length > 0
                  );

                  if (allBillingOrders.length === 0) return null;

                  // 🚀 SESSION ISOLATION: หาออเดอร์ที่เป็นรอบล่าสุดจริงๆ โดยดูจาก updated_at ล่าสุด
                  // เมื่อลูกค้ากดเรียกเช็คบิล ออเดอร์ทั้งหมดในรอบนั้นจะถูกอัปเดตพร้อมกันด้วย timestamp เดียวกัน
                  const latestUpdateMs = Math.max(...allBillingOrders.map(o => new Date(o.updated_at || o.created_at).getTime()));

                  // เอาเฉพาะออเดอร์ที่อัปเดตสถานะพร้อมๆ กัน (ภายใน 5 วินาที) เพื่อแยกเซสชั่นลูกค้าเก่าที่ค้างอยู่
                  const tableOrders = allBillingOrders.filter(o => {
                    const t = new Date(o.updated_at || o.created_at).getTime();
                    return Math.abs(latestUpdateMs - t) < 5000;
                  });

                  const totalAmount = tableOrders.reduce((sum, o) => sum + (Number(o.total_price) || 0), 0);


                  return (
                    <div key={tableNo} className="bg-white rounded-[3rem] overflow-hidden shadow-[0_8px_40px_rgb(0,0,0,0.04)] border border-slate-100 animate-in fade-in slide-in-from-bottom-4 duration-500">
                      <div className="bg-slate-900 p-6 text-white flex justify-between items-center">
                        <div className="flex items-center gap-4">
                          <div className="bg-white/10 p-3 rounded-2xl"><Utensils size={24} /></div>
                          <div>
                            <span className="font-black text-xl block leading-none">โต๊ะ {tableNo}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] font-black text-black uppercase tracking-widest mb-1">เวลาที่แจ้ง</p>
                          <div className="bg-white/10 px-3 py-1.5 rounded-xl text-[11px] font-bold flex items-center gap-2 border border-white/5">
                            <Clock size={12} className="text-orange-400" /> {formatOrderTime(tableOrders[0]?.updated_at || tableOrders[0]?.created_at)}
                          </div>
                        </div>
                      </div>

                      <div className="p-8">
                        {(() => {
                          const allTableOrders = orders.filter(o => String(o.table_no) === String(tableNo) && o.status !== 'เสร็จสิ้น');
                          const unservedOrders = allTableOrders.filter(o => o.status === 'รอ' || o.status === 'กำลังเตรียม' || o.status === 'กำลังทำ');

                          if (unservedOrders.length > 0) {
                            return (
                              <div className="mb-8 bg-red-50/50 border-2 border-red-100 rounded-[2rem] p-6">
                                <p className="text-red-600 font-black text-xs flex items-center gap-2 mb-4 tracking-widest uppercase">
                                  <BellRing size={16} /> แจ้งเตือน: มีรายการค้างที่ยังไม่เสร็จ!
                                </p>
                                <div className="space-y-3">
                                  {unservedOrders.map(o => (
                                    <div key={o.id} className="bg-white p-4 rounded-2xl shadow-sm border border-red-50 flex justify-between items-center">
                                      <div className="flex-1">
                                        {o.items?.map((item: any, i: number) => (
                                          <div key={i} className="mb-2">
                                            <div className="text-[11px] font-bold text-slate-600 mb-0.5">
                                              {item.quantity}x {item.name} {item.selectedNoodle && `(${item.selectedNoodle})`}
                                            </div>
                                            {item.note && (
                                              <div className="text-[10px] text-orange-600 font-bold bg-orange-50 px-2 py-0.5 rounded-md inline-block">
                                                {item.note}
                                              </div>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                      <span className="bg-orange-50 text-orange-600 px-3 py-1 rounded-full uppercase text-[9px] font-black">{o.status}</span>
                                    </div>
                                  ))}
                                </div>
                                <p className="text-[9px] text-red-400 mt-4 font-bold border-t border-red-100 pt-3">
                                  * กรุณาตรวจสอบและเสิร์ฟรายการที่ค้างอยู่ก่อนปิดโต๊ะ
                                </p>
                              </div>
                            );
                          }
                          return null;
                        })()}

                        <div className="space-y-3 mb-8">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">สรุปรายการสั่งซื้อ</p>
                          {(() => {
                            // รวมรายการอาหารทั้งหมดจากทุก order ของโต๊ะนี้เป็น 1 บิลเดียว
                            const mergedItems: Record<string, any> = {};
                            tableOrders.forEach(order => {
                              order.items?.forEach((item: any) => {
                                const key = `${item.name}|${item.selectedNoodle || ''}|${item.note || ''}|${item.isSpecial ? '1' : '0'}`;
                                if (mergedItems[key]) {
                                  mergedItems[key].quantity += Number(item.quantity) || 1;
                                } else {
                                  mergedItems[key] = { ...item, quantity: Number(item.quantity) || 1 };
                                }
                              });
                            });

                            return Object.values(mergedItems).map((item: any, i: number) => (
                              <div key={i} className="flex justify-between items-center py-3 border-b border-slate-50 last:border-0">
                                <div className="flex items-start gap-3 flex-1">
                                  <span className="bg-slate-100 text-slate-600 font-black text-sm px-2.5 py-0.5 rounded-xl min-w-[40px] text-center">
                                    {item.quantity}×
                                  </span>
                                  <div>
                                    <span className="text-slate-900 font-bold leading-tight">
                                      {item.name} {item.isSpecial && <span className="text-orange-500 text-xs">(พิเศษ)</span>}
                                    </span>
                                    {item.selectedNoodle && (
                                      <div className="text-[10px] text-slate-400 font-bold mt-0.5">เส้น: {item.selectedNoodle}</div>
                                    )}
                                    {item.note && (
                                      <div className="text-[11px] text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-lg inline-block mt-1">
                                        {item.note}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <span className="font-black text-slate-900 ml-4">
                                  ฿{((item.totalItemPrice || item.price || 0) * item.quantity).toLocaleString()}
                                </span>
                              </div>
                            ));
                          })()}
                        </div>


                        <div className="flex justify-between items-end pt-6 border-t border-slate-100 mb-8">
                          <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">รวมทั้งสิ้น</p>
                            <span className="text-4xl font-black text-slate-900 tracking-tighter">฿{totalAmount.toLocaleString()}</span>
                          </div>
                          <div className="flex flex-col items-end">
                            <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest flex items-center gap-1.5 mb-1">
                              <Check size={14} strokeWidth={3} /> รวมภาษีแล้ว
                            </span>
                          </div>
                        </div>

                        <div className="flex gap-4">
                          <button
                            onClick={async () => {
                              const billingIds = tableOrders.map(o => o.id);
                              if (confirm(`ยกเลิกการเรียกเช็คบิลสำหรับโต๊ะ ${tableNo}?\n(สถานะออเดอร์จะกลับเป็น 'เสิร์ฟแล้ว' และโต๊ะจะเป็น 'ใช้งานอยู่')`)) {
                                // Update orders back to served
                                const { error: err1 } = await supabase.from('orders').update({ status: 'เสิร์ฟแล้ว' }).in('id', billingIds);
                                // Update table back to occupied
                                const { error: err2 } = await supabase.from('tables').update({ status: 'occupied' }).eq('table_number', tableNo);

                                if (!err1 && !err2) {
                                  // Update Local State
                                  setOrders(prev => prev.map(o => billingIds.includes(o.id) ? { ...o, status: 'เสิร์ฟแล้ว' } : o));
                                  setTables(prev => prev.map(t => String(t.table_number) === String(tableNo) ? { ...t, status: 'occupied' } : t));
                                }
                                fetchOrders(true);
                                fetchTables();
                              }
                            }}
                            className="px-8 py-5 bg-slate-50 text-slate-400 rounded-3xl font-black text-sm hover:bg-slate-100 transition-all active:scale-95"
                          >
                            ยกเลิก
                          </button>
                          <button
                            onClick={() => updateOrderStatus(0, 'เสร็จสิ้น', tableNo as string)}
                            className="flex-1 bg-slate-900 text-white py-5 rounded-3xl font-black text-lg shadow-xl shadow-slate-200 hover:bg-slate-800 transition-all flex items-center justify-center gap-3 active:scale-95"
                          >
                            <CheckCircle2 size={24} /> ชำระเงินเรียบร้อย
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              })()}
            </div>
          </main>
        )
      }

      {/* ✅ TAB: SALES (แก้ไขตรรกะให้ยอดขึ้น 100%) */}
      {
        activeTab === 'sales' && (
          <main className="p-6 max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700 pb-52">
            <header className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div>
                <h1 className="text-4xl font-black text-slate-900 tracking-tight mb-2">รายงานรายได้</h1>
                <div className="text-black font-medium flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  วิเคราะห์ผลประกอบการและยอดขายแบบ Real-time
                </div>
              </div>
              <div className="flex bg-slate-100 p-1.5 rounded-2xl shadow-inner inline-flex self-start">
                <button
                  onClick={() => setSalesViewMode('daily')}
                  className={`px-8 py-2.5 rounded-xl font-bold text-sm transition-all duration-300 ${salesViewMode === 'daily' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  รายวัน
                </button>
                <button
                  onClick={() => setSalesViewMode('monthly')}
                  className={`px-8 py-2.5 rounded-xl font-bold text-sm transition-all duration-300 ${salesViewMode === 'monthly' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  รายเดือน
                </button>
              </div>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10">
              <div className="lg:col-span-3 bg-white p-8 rounded-[2.5rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 flex flex-col md:flex-row items-center gap-8">
                <div className="bg-emerald-50 w-20 h-20 rounded-[2rem] flex items-center justify-center text-emerald-600 flex-shrink-0">
                  <Calendar size={40} strokeWidth={2.5} />
                </div>
                <div className="flex-1 text-center md:text-left">
                  <p className="text-xs font-black text-black uppercase tracking-[0.2em] mb-2">
                    {salesViewMode === 'daily' ? 'ช่วงเวลาที่เลือก' : 'สรุปยอดรายเดือน'}
                  </p>
                  <div className="relative group inline-block">
                    <div className="flex items-center gap-4 cursor-pointer hover:text-orange-600 transition-colors">
                      <div className="text-3xl font-black text-slate-900 group-hover:text-orange-600">
                        {(() => {
                          try {
                            const dateString = salesViewMode === 'daily' ? selectedSalesDate : selectedSalesMonth + '-01';
                            const dateObj = new Date(dateString);
                            return dateObj.toLocaleDateString('th-TH', {
                              year: 'numeric',
                              month: 'long',
                              day: salesViewMode === 'daily' ? 'numeric' : undefined,
                              timeZone: 'Asia/Bangkok'
                            });
                          } catch (e) {
                            return 'เลือกวันที่';
                          }
                        })()}
                      </div>
                      <div className="bg-slate-50 p-2 rounded-xl text-slate-400 group-hover:bg-orange-50 group-hover:text-orange-600 transition-all">
                        <Calendar size={24} />
                      </div>
                    </div>
                    <input
                      type={salesViewMode === 'daily' ? "date" : "month"}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full"
                      value={salesViewMode === 'daily' ? selectedSalesDate : selectedSalesMonth}
                      onChange={(e) => salesViewMode === 'daily' ? setSelectedSalesDate(e.target.value) : setSelectedSalesMonth(e.target.value)}
                    />
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (confirm("ต้องการรีเฟรชข้อมูลและตรวจสอบยอดขายล่าสุดจากระบบใช่หรือไม่?")) {
                      localStorage.removeItem('demo_admin_orders');
                      fetchOrders(true);
                    }
                  }}
                  className="bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-orange-600 px-6 py-4 rounded-2xl font-bold text-xs uppercase tracking-widest transition-all border border-slate-100"
                >
                  รีเฟรชข้อมูล
                </button>
              </div>
            </div>

            {(() => {
              // Wrap calculations in useMemo style logic (using a self-executing function but we should consider useMemo if it becomes a problem)
              // For now, let's keep it clean
              const salesData = (() => {
                const filteredSales = (orders || []).filter(o => {
                  const s = (o.status || '').trim();
                  // ✅ รองรับสถานะที่เกี่ยวข้องกับบิลที่จบแล้วทั้งหมด
                  const isFinished = ['เสร็จสิ้น', 'ชำระเงินแล้ว', 'ชำระเงิน', 'เสร็จแล้ว'].includes(s);
                  if (!isFinished) return false;

                  // ✅ ใช้เวลาที่ชำระเงิน (updated_at) เป็นหลัก ถ้าไม่มีค่อยใช้เวลาสั่ง (created_at)
                  const timestamp = o.updated_at || o.created_at;
                  if (!timestamp) return false;

                  const d = new Date(timestamp);
                  if (isNaN(d.getTime())) return false;

                  // 🎯 สร้าง Key สำหรับเปรียบเทียบ โดยใช้ Local Time (YYYY-MM-DD)
                  // ทำแบบ Manual เพื่อความชัวร์ 100% ในทุก Browser
                  const year = d.getFullYear();
                  const month = String(d.getMonth() + 1).padStart(2, '0');
                  const day = String(d.getDate()).padStart(2, '0');
                  const orderDateStr = `${year}-${month}-${day}`;
                  const orderMonthStr = `${year}-${month}`;

                  if (salesViewMode === 'daily') {
                    return orderDateStr === selectedSalesDate;
                  } else {
                    return orderMonthStr === selectedSalesMonth;
                  }
                });

                const groupedSalesForMetrics = filteredSales
                  .reduce((acc: any[], order) => {
                    const orderTime = new Date(order.updated_at || order.created_at).getTime();
                    // ✅ สำหรับตัวเลขสรุป (Metrics): นับเป็น "จำนวนบิล" (โต๊ะเดียวกันจ่ายไล่เลี่ยกัน = 1 บิล)
                    const existing = acc.find(item =>
                      String(item.table_no).trim() === String(order.table_no).trim() &&
                      Math.abs(new Date(item.updated_at || item.created_at).getTime() - orderTime) < 60 * 1000
                    );
                    if (existing) {
                      existing.total_price = (Number(existing.total_price) || 0) + (Number(order.total_price) || 0);
                    } else {
                      acc.push({ ...order });
                    }
                    return acc;
                  }, []);

                const totalRevenue = groupedSalesForMetrics.reduce((sum, o) => sum + (Number(o.total_price) || 0), 0);
                const totalOrders = groupedSalesForMetrics.length;
                const avgTicket = totalOrders > 0 ? (totalRevenue / totalOrders).toFixed(0) : 0;

                return { filteredSales, totalRevenue, totalOrders, avgTicket };
              })();

              const { filteredSales, totalRevenue, totalOrders, avgTicket } = salesData;
              return (
                <>
                  {/* 1. TOP METRICS ROW */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
                    {[
                      { label: 'รายได้รวม', value: `฿${totalRevenue.toLocaleString()}`, icon: <TrendingUp />, color: 'emerald', sub: 'ยอดขายสำเร็จ' },
                      { label: 'จำนวนออเดอร์', value: totalOrders, icon: <ListChecks />, color: 'blue', sub: 'สำเร็จแล้ว' },
                      { label: 'เฉลี่ยต่อบิล', value: `฿${avgTicket}`, icon: <DollarSign />, color: 'violet', sub: 'ต่อการทำรายการ' },
                    ].map((card, i) => (
                      <div key={i} className="bg-white p-7 rounded-[2.5rem] shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-slate-50 hover:shadow-[0_20px_40px_rgba(0,0,0,0.06)] transition-all duration-500">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-6 
                          ${card.color === 'emerald' ? 'bg-emerald-50 text-emerald-600' :
                            card.color === 'blue' ? 'bg-blue-50 text-blue-600' :
                              'bg-violet-50 text-violet-600'}`}>
                          {React.cloneElement(card.icon as any, { size: 24, strokeWidth: 2.5 })}
                        </div>
                        <p className="text-xs font-black text-black uppercase tracking-widest mb-1">{card.label}</p>
                        <p className="text-3xl font-black text-slate-900 mb-2">{card.value}</p>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-bold text-black uppercase tracking-wider">{card.sub}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 mb-8">
                    {/* 2. TREND GRAPH (7-DAY REVENUE) */}
                    <div className="bg-white rounded-[3rem] shadow-[0_8px_40px_rgb(0,0,0,0.04)] border border-slate-100 overflow-hidden flex flex-col">
                      <div className="px-10 py-7 border-b border-slate-50 bg-slate-50/30 flex justify-between items-center">
                        <div>
                          <h3 className="text-xl font-black text-slate-900">แนวโน้มรายได้</h3>
                          <p className="text-[10px] text-black font-bold uppercase tracking-wider">แนวโน้มรายได้ (7 วันล่าสุด)</p>
                        </div>
                        <div className="bg-emerald-50 text-emerald-600 p-2 rounded-xl">
                          <TrendingUp size={20} />
                        </div>
                      </div>
                      <div className="p-10 flex-1 flex flex-col justify-center">
                        {(() => {
                          const last7Days = [...Array(7)].map((_, i) => {
                            const d = new Date();
                            d.setDate(d.getDate() - (6 - i));
                            return d.toISOString().split('T')[0];
                          });

                          const dailyData = last7Days.map(dateStr => {
                            const dayRevenue = orders.filter(o => {
                              if (o.status !== 'เสร็จสิ้น') return false;
                              // ✅ ใช้เวลาที่ชำระเงิน (updated_at) เพื่อให้ตรงกับหน้าสรุปยอดขาย
                              const d = new Date(o.updated_at || o.created_at || Date.now());
                              return d.toISOString().split('T')[0] === dateStr;
                            }).reduce((sum, o) => sum + (Number(o.total_price) || 0), 0);
                            return dayRevenue;
                          });

                          const maxRevenue = Math.max(...dailyData, 1000);
                          const points = dailyData.map((val, i) => {
                            const x = (i / 6) * 100;
                            const y = 100 - (val / maxRevenue) * 100;
                            return `${x},${y}`;
                          }).join(' ');

                          return (
                            <div className="relative h-48 w-full group">
                              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full overflow-visible">
                                {/* Gradient Fill */}
                                <defs>
                                  <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#10b981" stopOpacity="0.2" />
                                    <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                                  </linearGradient>
                                </defs>
                                <path
                                  d={`M 0,100 L ${points} L 100,100 Z`}
                                  fill="url(#chartGradient)"
                                />
                                {/* Main Line */}
                                <polyline
                                  fill="none"
                                  stroke="#10b981"
                                  strokeWidth="2.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  points={points}
                                  className="drop-shadow-sm"
                                />
                                {/* Data Points */}
                                {dailyData.map((val, i) => (
                                  <circle
                                    key={i}
                                    cx={(i / 6) * 100}
                                    cy={100 - (val / maxRevenue) * 100}
                                    r="1.5"
                                    fill="white"
                                    stroke="#10b981"
                                    strokeWidth="1"
                                    className="hover:r-2 transition-all cursor-pointer"
                                  />
                                ))}
                              </svg>
                              <div className="flex justify-between mt-6 px-1">
                                {last7Days.map((d, i) => (
                                  <span key={i} className="text-[9px] font-black text-black uppercase tracking-widest">
                                    {new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
                                  </span>
                                ))}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    {/* 3. TOP SELLING ITEMS TABLE */}
                    <div className="bg-white rounded-[3rem] shadow-[0_8px_40px_rgb(0,0,0,0.04)] border border-slate-100 overflow-hidden">
                      <div className="px-10 py-7 border-b border-slate-50 bg-slate-50/30 flex justify-between items-center">
                        <div>
                          <h3 className="text-xl font-black text-slate-900">เมนูยอดนิยม</h3>
                          <p className="text-[10px] text-black font-bold uppercase tracking-wider">5 อันดับเมนูขายดี</p>
                        </div>
                        <div className="bg-indigo-50 text-indigo-600 p-2 rounded-xl">
                          <PlusCircle size={20} />
                        </div>
                      </div>
                      <div className="p-8">
                        <table className="w-full">
                          <thead>
                            <tr className="text-[10px] text-black font-black uppercase tracking-widest border-b border-slate-50">
                              <th className="text-left pb-4">อันดับ</th>
                              <th className="text-left pb-4">ชื่อเมนู</th>
                              <th className="text-center pb-4">จำนวน</th>
                              <th className="text-right pb-4">ยอดขายรวม</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {(() => {
                              const itemStats: Record<string, { qty: number, revenue: number }> = {};
                              filteredSales.forEach(o => {
                                o.items?.forEach((item: any) => {
                                  if (!itemStats[item.name]) itemStats[item.name] = { qty: 0, revenue: 0 };
                                  itemStats[item.name].qty += Number(item.quantity) || 0;
                                  itemStats[item.name].revenue += (Number(item.price) || 0) * (Number(item.quantity) || 0);
                                });
                              });
                              return Object.entries(itemStats)
                                .sort((a, b) => b[1].qty - a[1].qty)
                                .slice(0, 5)
                                .map(([name, stats], idx) => (
                                  <tr key={name} className="group hover:bg-slate-50/50 transition-colors">
                                    <td className="py-4">
                                      <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black ${idx === 0 ? 'bg-emerald-500 text-white shadow-lg' : 'bg-slate-100 text-black'}`}>
                                        {idx + 1}
                                      </span>
                                    </td>
                                    <td className="py-4 font-black text-slate-900">{name}</td>
                                    <td className="py-4 text-center font-bold text-slate-500">{stats.qty}</td>
                                    <td className="py-4 text-right font-black text-emerald-600">฿{stats.revenue.toLocaleString()}</td>
                                  </tr>
                                ));
                            })()}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>

                  {/* 4. COMPACT TRANSACTION HISTORY */}
                  <div className="bg-white rounded-[3rem] shadow-[0_8px_40px_rgb(0,0,0,0.04)] border border-slate-100 overflow-hidden">
                    <div className="px-10 py-7 border-b border-slate-50 bg-slate-50/30 flex justify-between items-center">
                      <h3 className="text-xl font-black text-slate-900">ประวัติการขายล่าสุด</h3>
                      <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-xl border border-slate-100 shadow-sm text-[10px] font-black text-black uppercase tracking-widest">
                        <ListFilter size={14} /> รายการช่วงเวลาที่เลือก
                      </div>
                    </div>
                    <div className="p-8">
                      {filteredSales.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-slate-300 gap-4">
                          <ClipboardList size={40} />
                          <div className="text-center text-slate-400">
                            <p className="text-sm font-bold">ไม่พบรายการบิลล์สำหรับวันที่เลือก</p>
                            <p className="text-[10px] uppercase tracking-widest mt-1">
                              (ตรวจพบข้อมูลทั้งหมด {orders.length} รายการในระบบ)
                            </p>
                          </div>
                          <button
                            onClick={() => { setSelectedSalesDate(''); setSalesViewMode('daily'); }}
                            className="text-indigo-500 text-xs font-bold hover:underline"
                          >
                            ตรวจสอบรายการทั้งหมดที่มี
                          </button>
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-50">
                          {(() => {
                            const groupedSales = filteredSales
                              .reduce((acc: any[], order) => {
                                const d = new Date(order.updated_at || order.created_at || Date.now());
                                const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                                const orderTime = d.getTime();

                                // 🎯 DIFFERENCE: รายวัน=รวมแยกโต๊ะ/เซสชั่น | รายเดือน=รวมตามวัน ("รวมไปเลย")
                                const existing = acc.find(item => {
                                  if (salesViewMode === 'daily') {
                                    return String(item.table_no).trim() === String(order.table_no).trim() &&
                                      Math.abs(new Date(item.updated_at || item.created_at).getTime() - orderTime) < 60 * 1000;
                                  } else {
                                    // โหมดรายเดือน: รวมยอดตาม "วัน" (ignore table_no)
                                    const id = new Date(item.updated_at || item.created_at || Date.now());
                                    const idDateStr = `${id.getFullYear()}-${String(id.getMonth() + 1).padStart(2, '0')}-${String(id.getDate()).padStart(2, '0')}`;
                                    return idDateStr === dateStr;
                                  }
                                });

                                if (existing) {
                                  existing.total_price = (Number(existing.total_price) || 0) + (Number(order.total_price) || 0);
                                  existing.items = [...(existing.items || []), ...(order.items || [])];
                                  existing.combinedIds = [...(existing.combinedIds || []), order.id];
                                } else {
                                  acc.push({ ...order, combinedIds: [order.id] });
                                }
                                return acc;
                              }, [])
                              .sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime());

                            const rows = groupedSales.map((order) => {
                              const isMonthlyAgg = salesViewMode === 'monthly';
                              const rowDate = new Date(order.updated_at || order.created_at);

                              return (
                                <div
                                  key={order.key || order.id || Math.random()}
                                  onClick={() => setSelectedOrderForDetail(order)}
                                  className="py-6 flex items-center justify-between group hover:bg-slate-50/80 transition-all px-6 -mx-4 rounded-[2.5rem] cursor-pointer active:scale-[0.98]"
                                >
                                  <div className="flex items-center gap-6">
                                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-sm font-black shadow-lg group-hover:scale-110 transition-transform ${isMonthlyAgg ? 'bg-indigo-500 text-white' : 'bg-slate-900 text-white'}`}>
                                      {isMonthlyAgg ? <Calendar size={20} /> : order.table_no}
                                    </div>
                                    <div className="flex flex-col">
                                      <div className="flex items-center gap-2 mb-1">
                                        <span className="text-base font-black text-slate-900">
                                          {isMonthlyAgg
                                            ? `สรุปยอดขายวันที่ ${rowDate.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}`
                                            : `โต๊ะ ${order.table_no}`}
                                        </span>
                                        <span className="text-[9px] bg-slate-100 px-2 py-0.5 rounded-lg font-black text-slate-500 tracking-wider">
                                          {`${order.combinedIds?.length || 1} ออเดอร์`}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-3">
                                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest flex items-center gap-1">
                                          <Clock size={10} />
                                          {isMonthlyAgg ? 'ยอดรวมทั้งวัน' : formatOrderTime(order.updated_at || order.created_at)}
                                        </span>
                                        <span className="text-[10px] text-emerald-500 font-black uppercase tracking-[0.1em] flex items-center gap-1">
                                          <CheckCircle2 size={10} /> ชำระเงินแล้ว
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-10">
                                    <div className="text-right">
                                      <p className="text-xl font-black text-slate-900 tracking-tighter">฿{(Number(order.total_price) || 0).toLocaleString()}</p>
                                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mt-0.5">ยอดสุทธิ</p>
                                    </div>
                                    <div className="bg-slate-50 p-3 rounded-2xl text-slate-300 group-hover:bg-slate-900 group-hover:text-white transition-all">
                                      <Eye size={20} />
                                    </div>
                                  </div>
                                </div>
                              );
                            });

                            if (salesViewMode === 'monthly' && groupedSales.length > 0) {
                              rows.push(
                                <div key="monthly-summary-footer" className="mt-6 pt-6 border-t-2 border-dashed border-slate-100 flex items-center justify-between px-6 bg-emerald-50/50 -mx-4 py-8 rounded-[2.5rem]">
                                  <div className="flex items-center gap-6">
                                    <div className="w-12 h-12 rounded-2xl bg-emerald-500 flex items-center justify-center text-white shadow-lg">
                                      <TrendingUp size={24} />
                                    </div>
                                    <div>
                                      <p className="text-base font-black text-emerald-900">ยอดรวมประจำเดือน</p>
                                      <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-[0.1em]">ยอดรวมสุทธิประจำเดือน</p>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-3xl font-black text-emerald-600 tracking-tighter animate-in fade-in slide-in-from-right duration-700">
                                      ฿{totalRevenue.toLocaleString()}
                                    </p>
                                    <p className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.2em] mt-1">{totalOrders} บิลล์ทั้งหมด</p>
                                  </div>
                                </div>
                              );
                            }
                            return rows;
                          })()}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              );
            })()}
          </main>
        )
      }

      {/* ✅ MODAL: TABLE DETAIL (Interactive Floor Plan) */}
      {
        selectedTableDetail && (
          <div className="fixed inset-0 z-[150] bg-black/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div className="bg-white w-full max-w-2xl rounded-[3rem] overflow-hidden shadow-2xl animate-in zoom-in duration-300 max-h-[90vh] flex flex-col">
              <div className="bg-slate-900 p-8 text-white flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="bg-white/20 p-3 rounded-2xl"><LayoutGrid size={32} /></div>
                    <h3 className="text-4xl font-black">โต๊ะ {selectedTableDetail.table_number}</h3>
                  </div>
                  <div className="flex gap-2">
                    <span className="bg-white/20 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider">
                      {selectedTableDetail.capacity} ที่นั่ง
                    </span>
                    <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${selectedTableDetail.status === 'available' ? 'bg-green-400' : selectedTableDetail.status === 'billing' ? 'bg-yellow-400' : 'bg-orange-400'}`}>
                      {selectedTableDetail.status === 'available' ? 'ว่าง' : selectedTableDetail.status === 'billing' ? 'เรียกเช็คบิล' : 'มีลูกค้า'}
                    </span>
                  </div>
                </div>
                <button onClick={() => setSelectedTableDetail(null)} className="bg-white/10 hover:bg-white/20 transition-colors p-3 rounded-full">
                  <X size={28} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8">
                <div className="space-y-6">
                  <h4 className="text-xl font-black flex items-center gap-2 text-[#2D3436]">
                    <ClipboardList className="text-[#7C9070]" /> รายการออเดอร์ (เซสชั่นปัจจุบัน)
                  </h4>

                  {(() => {
                    const tableNo = String(selectedTableDetail.table_number).trim();
                    // 1. กรองออเดอร์ทั้งหมดของโต๊ะนี้ที่ "กำลังนั่งทานอยู่" (กินอยู่/ยังไม่เช็คบิล)
                    const allTableOrders = orders.filter(o =>
                      String(o.table_no).trim() === tableNo &&
                      !['เสร็จสิ้น', 'เรียกเช็คบิล', 'ยกเลิก', 'ออร์เดอร์ยกเลิก'].includes(o.status)
                    );

                    if (allTableOrders.length === 0) {
                      return (
                        <div className="py-20 text-center bg-gray-50 rounded-[2.5rem] border-2 border-dashed border-gray-100">
                          <p className="text-gray-400 font-bold uppercase tracking-widest text-sm">ยังไม่มีรายการสั่งอาหาร (โต๊ะว่าง/ยังไม่สั่ง)</p>
                        </div>
                      );
                    }

                    // 🎯 SESSION ISOLATION (ขั้นเทพ):
                    // กรณีมีคนเรียกเช็คบิล: เอาเฉพาะออเดอร์ที่เรียกเช็คบิลพร้อมกัน (รอบเดียวกัน)
                    const billingOrders = allTableOrders.filter(o => o.status === 'เรียกเช็คบิล');
                    let currentSessionOrders;

                    if (billingOrders.length > 0) {
                      const latestUpdateMs = Math.max(...billingOrders.map(o => new Date(o.updated_at || o.created_at).getTime()));
                      currentSessionOrders = allTableOrders.filter(o => {
                        const t = new Date(o.updated_at || o.created_at).getTime();
                        // เอาเฉพาะออเดอร์ที่อัปเดตสถานะพร้อมๆ กัน (ภายใน 10 วินาที) หรือออเดอร์ที่ถูกสั่งตามมาหลังจากการเรียกเช็คบิลนี้
                        return Math.abs(latestUpdateMs - t) < 10000 || t >= latestUpdateMs;
                      });
                    } else {
                      // กรณีไม่มีใครเรียกเช็คบิล (กำลังกิน): เอาเฉพาะออเดอร์ล่าสุดในรอบ 12 ชม.
                      const latestOrderTime = Math.max(...allTableOrders.map(o => new Date(o.created_at).getTime()));
                      currentSessionOrders = allTableOrders.filter(o =>
                        (latestOrderTime - new Date(o.created_at).getTime()) < 12 * 60 * 60 * 1000
                      );
                    }

                    const totalSessionAmount = currentSessionOrders.reduce((sum, o) => sum + (Number(o.total_price) || 0), 0);

                    return (
                      <div className="space-y-6">
                        <div className="space-y-4">
                          {currentSessionOrders.map((order) => (
                            <div key={order.id} className="bg-white border border-slate-100 rounded-[2rem] p-6 shadow-sm">
                              <div className="flex justify-between items-center mb-4">
                                <div className="flex items-center gap-3">
                                  <span className={`text-[10px] px-3 py-1 rounded-full font-black uppercase tracking-widest ${order.status === 'เรียกเช็คบิล' ? 'bg-amber-100 text-amber-600' :
                                    order.status === 'เสร็จแล้ว' ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600'
                                    }`}>
                                    {order.status}
                                  </span>
                                  <span className="text-[10px] text-gray-400 font-bold flex items-center gap-1">
                                    <Clock size={12} /> {formatOrderTime(order.created_at)}
                                  </span>
                                </div>
                                <div className="flex gap-2">
                                  {['รอ', 'กำลังเตรียม', 'กำลังทำ', 'เสร็จแล้ว'].includes(order.status) && (
                                    <button
                                      onClick={() => updateOrderStatus(order.id, 'เสร็จแล้ว')}
                                      className="bg-green-50 text-green-600 p-2 rounded-xl hover:bg-green-100 transition-colors"
                                    >
                                      <CheckCircle2 size={18} />
                                    </button>
                                  )}
                                  <button
                                    onClick={() => deleteOrder(order.id)}
                                    className="bg-red-50 text-red-300 p-2 rounded-xl hover:bg-red-100 transition-colors"
                                  >
                                    <Trash2 size={18} />
                                  </button>
                                </div>
                              </div>
                              <div className="space-y-2">
                                {order.items?.map((item: any, idx: number) => (
                                  <div key={idx} className="flex justify-between items-center text-sm">
                                    <div className="flex items-start gap-2">
                                      <span className="text-slate-400 font-bold">{item.quantity}x</span>
                                      <div>
                                        <p className="font-extrabold text-slate-800 leading-tight">
                                          {item.name} {item.isSpecial && <span className="text-orange-500 text-xs">(พิเศษ)</span>}
                                        </p>
                                        {item.selectedNoodle && <p className="text-[10px] text-slate-400 font-bold">{item.selectedNoodle}</p>}
                                        {item.note && <p className="text-[10px] text-emerald-500 font-bold bg-emerald-50 px-1.5 py-0.5 rounded mt-1 inline-block">{item.note}</p>}
                                      </div>
                                    </div>
                                    <span className="font-black text-slate-900">฿{(item.price * item.quantity).toLocaleString()}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="bg-slate-50 rounded-[2.5rem] p-8 mt-4 border border-slate-100 flex justify-between items-center">
                          <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">ยอดรวมเซสชั่นปัจจุบัน</p>
                            <p className="text-3xl font-black text-slate-900">฿{totalSessionAmount.toLocaleString()}</p>
                          </div>
                          <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                            <Wallet className="text-slate-400" size={24} />
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              <div className="p-8 bg-gray-50 border-t flex gap-4">
                {selectedTableDetail.status !== 'available' && (
                  <button
                    onClick={() => {
                      if (confirm(`ยืนยันการชำระเงินและล้างข้อมูลโต๊ะ ${selectedTableDetail.table_number}?`)) {
                        updateOrderStatus(0, 'เสร็จสิ้น', selectedTableDetail.table_number?.toString());
                        setSelectedTableDetail(null);
                      }
                    }}
                    className="flex-1 bg-slate-900 text-white py-5 rounded-[2rem] font-black text-lg shadow-xl shadow-slate-200 hover:bg-slate-800 transition-all flex items-center justify-center gap-3 active:scale-95"
                  >
                    <CheckCircle2 size={24} /> ชำระเงิน/ล้างโต๊ะ
                  </button>
                )}
                {selectedTableDetail.status === 'billing' ? (
                  <button
                    onClick={() => { setActiveTab('billing'); setSelectedTableDetail(null); }}
                    className="px-8 bg-amber-500 text-white py-5 rounded-[2rem] font-black text-lg shadow-xl shadow-amber-100 flex items-center justify-center gap-2 animate-pulse"
                  >
                    <Wallet /> ไปที่คิวเช็คบิล
                  </button>
                ) : (
                  <button
                    onClick={() => setSelectedTableDetail(null)}
                    className="flex-[0.5] bg-white border-2 border-gray-200 text-gray-400 py-5 rounded-[2rem] font-black text-lg hover:bg-gray-100 transition-colors"
                  >
                    ปิด
                  </button>
                )}
              </div>
            </div>
          </div>
        )
      }

      {/* ✅ MODAL: ORDER DETAIL (Sales Summary) */}
      {
        selectedOrderForDetail && (
          <div className="fixed inset-0 z-[150] bg-black/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div className="bg-white w-full max-w-xl rounded-[3rem] overflow-hidden shadow-2xl animate-in zoom-in duration-300 max-h-[85vh] flex flex-col">
              <div className="bg-slate-900 p-8 text-white flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="bg-white/10 p-3 rounded-2xl"><ClipboardList size={28} /></div>
                    <h3 className="text-3xl font-black">รายละเอียดออเดอร์</h3>
                  </div>
                  <div className="flex gap-2">
                    <span className="bg-white/20 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">
                      โต๊ะ {selectedOrderForDetail.table_no}
                    </span>
                    <span className="bg-white/20 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">
                      รหัสบิล: #{selectedOrderForDetail.id}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedOrderForDetail(null)}
                  className="bg-white/10 hover:bg-white/20 transition-colors p-3 rounded-full"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8">
                <div className="space-y-6">
                  <div className="flex justify-between items-center bg-slate-50 p-6 rounded-[2rem] border border-slate-100">
                    <div className="flex items-center gap-3">
                      <Clock size={20} className="text-slate-400" />
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">เวลาทำรายการ</p>
                        <p className="font-bold text-slate-900">{formatOrderTime(selectedOrderForDetail.updated_at || selectedOrderForDetail.created_at)}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">สถานะบิล</p>
                      <p className="font-black text-emerald-600 uppercase italic">ชำระเงินเรียบร้อย</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-xs font-black uppercase text-slate-400 tracking-[0.2em] ml-2">รายการที่สั่ง</h4>
                    <div className="space-y-3">
                      {selectedOrderForDetail.items?.map((item: any, idx: number) => (
                        <div key={idx} className="bg-white border border-slate-100 rounded-[1.8rem] p-5 flex justify-between items-center shadow-sm">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center font-black text-slate-900 border border-slate-100">
                              {item.quantity}
                            </div>
                            <div>
                              <p className="font-bold text-slate-900 leading-tight">
                                {item.name} {item.isSpecial && '(พิเศษ)'}
                              </p>
                              {item.selectedNoodle && (
                                <p className="text-[10px] text-slate-400 font-black uppercase tracking-wider mt-0.5">#{item.selectedNoodle}</p>
                              )}
                              {item.note && (
                                <div className="text-[9px] text-orange-600 font-bold bg-orange-50 px-2 py-0.5 rounded-md inline-block mt-1">
                                  {item.note}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-black text-slate-900 tracking-tight">฿{((item.totalItemPrice || item.price) * item.quantity).toLocaleString()}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-8 bg-slate-50 border-t border-slate-200">
                <div className="flex justify-between items-end">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">ยอดรวมชำระ</p>
                    <p className="text-4xl font-black text-slate-900 tracking-tighter">฿{(Number(selectedOrderForDetail.total_price) || 0).toLocaleString()}</p>
                  </div>
                  <button
                    onClick={() => setSelectedOrderForDetail(null)}
                    className="bg-slate-900 text-white px-10 py-4 rounded-[1.5rem] font-black text-sm shadow-xl active:scale-95 transition-all"
                  >
                    ปิดหน้ารายละเอียด
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      }
      {
        isModalOpen && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200] flex justify-end">
            <div className="bg-white w-full max-w-md h-full p-8 overflow-y-auto">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl font-black">{editingId ? 'แก้ไขเมนู' : 'เพิ่มเมนูใหม่'}</h2>
                <button onClick={() => setIsModalOpen(false)} className="p-2 bg-gray-100 rounded-full"><X size={24} /></button>
              </div>
              <form onSubmit={handleSaveMenu} className="space-y-6 pb-20">
                <div onClick={() => !isSaving && fileInputRef.current?.click()} className="w-full h-40 bg-[#F9F7F2] rounded-[2rem] border-2 border-dashed border-[#E8E4D8] flex items-center justify-center overflow-hidden cursor-pointer">
                  {formData.image_url ? <img src={formData.image_url} className="w-full h-full object-cover" /> : <ImageIcon size={30} className="text-[#BBC3C6]" />}
                  <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleFileChange} />
                </div>
                <input type="text" placeholder="ชื่อเมนู" required className="w-full bg-gray-50 rounded-[1.5rem] p-5 font-bold outline-none text-[#411E24]" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
                <input type="number" placeholder="ราคา" required className="w-full bg-gray-50 rounded-[1.5rem] p-5 font-bold outline-none text-[#411E24]" value={formData.price} onChange={(e) => setFormData({ ...formData, price: e.target.value })} />

                <div>
                  <label className="text-[10px] font-black uppercase text-gray-400 ml-2 mb-2 block">หมวดหมู่</label>
                  <div className="flex gap-2 overflow-x-auto no-scrollbar">
                    {['เมนูข้าว', 'เมนูเส้น', 'กับข้าว'].map(cat => (
                      <button key={cat} type="button" onClick={() => setFormData({ ...formData, category: cat })} className={`px-5 py-2.5 rounded-full text-[10px] font-black whitespace-nowrap ${formData.category === cat ? 'bg-[#7C9070] text-white' : 'bg-[#F0F4EF] text-[#7C9070]'}`}>{cat}</button>
                    ))}
                  </div>
                </div>

                <div className="bg-indigo-50/50 p-6 rounded-[2.5rem] border border-indigo-100 space-y-4">
                  <label className="text-[10px] font-black uppercase text-indigo-500 flex items-center gap-2"><ListChecks size={14} /> ตัวเลือกเส้นสำหรับลูกค้า</label>
                  <div className="flex gap-2">
                    <input type="text" placeholder="เพิ่มเส้น..." className="flex-1 bg-white rounded-full px-4 py-2 text-xs font-bold outline-none text-[#411E24]" value={customNoodle} onChange={(e) => setCustomNoodle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddCustomNoodle())} />
                    <button type="button" onClick={handleAddCustomNoodle} className="bg-indigo-500 text-white p-2 rounded-full"><PlusCircle size={20} /></button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {noodleTypes.map(noodle => (
                      <div key={noodle} className="relative group">
                        <button type="button" onClick={() => toggleNoodle(noodle)} className={`w-full py-3 rounded-xl text-[10px] font-black border-2 ${formData.noodle_options.includes(noodle) ? 'bg-indigo-500 border-indigo-500 text-white' : 'bg-white border-transparent text-slate-400'}`}>{noodle}</button>
                        <button type="button" onClick={(e) => { e.stopPropagation(); handleDeleteNoodleType(noodle); }} className="absolute -top-1 -right-1 bg-red-100 text-red-500 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"><X size={10} /></button>
                      </div>
                    ))}
                  </div>
                </div>

                <button type="submit" disabled={isSaving} className={`w-full py-5 rounded-[2rem] font-black text-lg text-white shadow-xl ${isSaving ? 'bg-slate-200' : 'bg-[#7C9070] shadow-[#7C9070]/20 hover:bg-[#6D7F62] transition-all'}`}>
                  {isSaving ? 'กำลังบันทึก...' : 'บันทึกเมนู'}
                </button>
              </form>
            </div>
          </div>
        )
      }

      {/* PROFESSIONAL BOTTOM NAV */}
      <nav className="fixed bottom-8 left-1/2 -translate-x-1/2 w-[90%] max-w-lg bg-white/80 backdrop-blur-2xl border border-white/40 p-3 flex justify-around items-center z-50 rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.15)] ring-1 ring-black/5 animate-in slide-in-from-bottom-10 duration-1000">
        {[
          { id: 'floor', label: 'ผังร้าน', icon: <LayoutGrid size={22} />, color: 'sage' },
          { id: 'menu', label: 'เมนู', icon: <Utensils size={22} />, color: 'sage' },
          { id: 'billing', label: 'เช็คบิล', icon: <Wallet size={22} />, color: 'amber', count: billingOrdersCount },
          { id: 'sales', label: 'ยอดขาย', icon: <TrendingUp size={22} />, color: 'sage' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id as any); setIsTableManageMode(false); }}
            className={`flex flex-col items-center gap-1.5 px-4 py-2 rounded-2xl transition-all duration-500 relative group ${activeTab === tab.id ? 'bg-[#7C9070] text-white shadow-xl scale-110' : 'text-[#636E72] hover:text-[#7C9070]'}`}
          >
            {tab.icon}
            <span className={`text-[8px] font-black tracking-widest ${activeTab === tab.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>{tab.label}</span>
            {tab.count !== undefined && tab.count > 0 && (
              <span className={`absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black animate-pulse shadow-lg ${activeTab === tab.id ? 'bg-[#2D3436] text-white' : 'bg-red-500 text-white'}`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* QR CODE MODAL */}
      {
        showQrModal && (
          <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-300">
            <div className="bg-white w-full max-w-sm rounded-[3rem] overflow-hidden shadow-2xl animate-in zoom-in duration-300 print:shadow-none print:m-0 print:rounded-none">
              <style jsx global>{`
                @media print {
                  body * { visibility: hidden; }
                  .print-area, .print-area * { visibility: visible; }
                  .print-area { position: absolute; left: 0; top: 0; width: 100%; }
                }
              `}</style>
              <div className="print-area">
                <div className="bg-[#7C9070] p-6 text-white text-center print:bg-white print:text-black">
                  <h3 className="text-2xl font-black">QR Code สำหรับโต๊ะ {showQrModal}</h3>
                  <p className="text-[10px] font-bold opacity-80 uppercase tracking-widest mt-1">สแกนเพื่อสั่งอาหารทันที</p>
                </div>
                <div className="p-10 flex flex-col items-center gap-6">
                  <div className="p-4 bg-white rounded-3xl border-4 border-[#F0F4EF] shadow-inner print:border-0 print:shadow-none">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(typeof window !== 'undefined' ? window.location.origin : '')}?table=${showQrModal}`}
                      alt={`QR Table ${showQrModal}`}
                      className="w-48 h-48"
                    />
                  </div>
                  <p className="text-xs text-center text-gray-400 font-bold leading-relaxed px-4 print:text-black">
                    ให้ลูกค้านำมือถือมาสแกน QR Code นี้<br />เพื่อเข้าสู่หน้าร้านโต๊ะ {showQrModal} ได้ทันที
                  </p>
                </div>
              </div>
              <div className="p-10 pt-0 flex flex-col items-center gap-6 print:hidden">
                <button
                  onClick={() => window.print()}
                  className="w-full py-4 bg-[#7C9070] text-white rounded-2xl font-black text-sm active:scale-95 transition-transform flex items-center justify-center gap-2"
                >
                  <QrCode size={18} /> พิมพ์ QR Code
                </button>
                <button
                  onClick={() => setShowQrModal(null)}
                  className="w-full py-4 bg-gray-50 text-gray-400 rounded-2xl font-black text-sm active:scale-95 transition-transform"
                >
                  ปิดหน้าต่าง
                </button>
              </div>
            </div>
          </div>
        )
      }
    </div >
  );
}