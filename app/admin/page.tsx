"use client";
import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import {
  Utensils, ClipboardList, TrendingUp, Plus,
  Search, Edit3, Trash2, X, Image as ImageIcon,
  Check, UploadCloud, Clock, ChefHat, CheckCircle2,
  Loader2, Calendar, DollarSign, ListFilter, ListChecks,
  PlusCircle, Timer, BellRing, Wallet, Eye, EyeOff, LayoutGrid, QrCode
} from 'lucide-react';

export default function AdminApp() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'menu' | 'billing' | 'sales' | 'floor'>('floor');
  const [isTableManageMode, setIsTableManageMode] = useState(false);
  const [orderSubTab, setOrderSubTab] = useState('กำลังทำ');
  const [menus, setMenus] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [tables, setTables] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('ทั้งหมด');
  const [isSaving, setIsSaving] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState<'DISCONNECTED' | 'CONNECTING' | 'SUBSCRIBED' | 'ERROR'>('DISCONNECTED');
  const [lastEventTime, setLastEventTime] = useState<string>('ยังไม่มีข้อมูล');
  const [isAudioUnlocked, setIsAudioUnlocked] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ✅ จัดการเรื่องวันที่ให้เป็นปัจจุบันตามเวลาไทย
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const [salesViewMode, setSalesViewMode] = useState<'daily' | 'monthly'>('daily');
  const [selectedSalesDate, setSelectedSalesDate] = useState(todayStr);
  const [selectedSalesMonth, setSelectedSalesMonth] = useState(monthStr);

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
    fetchPayments();

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
      const { type, id, status } = event.data;
      if (type === 'ORDER_UPDATE') {
        // Only update status of existing orders, don't add new ones
        // (Supabase realtime will handle new orders via fetchOrders)
        setOrders(prev => {
          const exists = prev.find(o => o.id === id);
          if (exists) {
            return prev.map(o => o.id === id ? { ...o, status } : o);
          }
          // Don't add new orders here - let Supabase realtime handle it
          return prev;
        });
      }
    };

    const menuSub = supabase.channel('menu_change').on('postgres_changes', { event: '*', schema: 'public', table: 'menus' }, () => fetchMenus()).subscribe();

    const tableSub = supabase.channel('table_change').on('postgres_changes', { event: '*', schema: 'public', table: 'tables' }, () => fetchTables()).subscribe();

    const paymentSub = supabase.channel('payment_change').on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => fetchPayments()).subscribe();

    const orderSub = supabase.channel('order_change').on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'orders'
    }, (payload: any) => {
      console.log('Real-time order change received:', payload);
      setLastEventTime(new Date().toLocaleTimeString('th-TH'));

      // 1. Play sound on NEW order or BILL request
      if (payload.eventType === 'INSERT') {
        playNotificationSound();
      } else if (payload.eventType === 'UPDATE') {
        // ให้เด้งเสียงถ้าสถานะใหม่เป็น 'เรียกเช็คบิล'
        if (payload.new.status === 'เรียกเช็คบิล') {
          playNotificationSound();
        }
      }
      // 2. Refresh orders after any DB change
      fetchOrders();
    }).subscribe((status) => {
      console.log('Real-time Status:', status);
      if (status === 'SUBSCRIBED') setRealtimeStatus('SUBSCRIBED');
      else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') setRealtimeStatus('ERROR');
      else setRealtimeStatus('CONNECTING');
    });

    return () => {
      supabase.removeChannel(menuSub);
      supabase.removeChannel(tableSub);
      supabase.removeChannel(paymentSub);
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

  const fetchPayments = async () => {
    try {
      const { data, error } = await supabase.from('payments').select('*').order('created_at', { ascending: false });
      if (!error) setPayments(data || []);
    } catch (e) {
      console.warn("Fetch Payments Exception", e);
    }
  };

  const fetchOrders = async () => {
    try {
      // 1. Fetch from Real Database
      const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false });

      let baseOrders = data || [];

      if (typeof window !== 'undefined') {
        const savedOrdersStr = localStorage.getItem('demo_admin_orders');
        let savedOrders = savedOrdersStr ? JSON.parse(savedOrdersStr) : [];

        // ✅ Only merge localStorage if DB fetch returned nothing 
        // to prevent "shadow" duplicate orders when using real Supabase.
        const combined = baseOrders.length > 0 ? baseOrders : savedOrders;

        setOrders(combined);
        localStorage.setItem('demo_admin_orders', JSON.stringify(combined));
      } else {
        setOrders(baseOrders);
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
    let updatedOrders;
    if (newStatus === 'เสร็จสิ้น' && tableNo) {
      // ✅ If paying, close ALL orders for that table
      updatedOrders = orders.map(o => o.table_no === tableNo ? { ...o, status: newStatus } : o);
    } else {
      updatedOrders = orders.map(o => o.id === id ? { ...o, status: newStatus } : o);
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
        // Calculate Total Amount for Payment Record
        const tableOrders = orders.filter(o => o.table_no === tableNo && o.status !== 'เสร็จสิ้น');
        const totalAmount = tableOrders.reduce((sum, o) => sum + (Number(o.total_price) || 0), 0);

        // 4.1 Update all orders for this table to 'เสร็จสิ้น'
        await supabase.from('orders').update({ status: newStatus }).eq('table_no', tableNo).neq('status', 'เสร็จสิ้น');

        // 4.2 Record Payment
        if (totalAmount > 0) {
          await supabase.from('payments').insert([{
            order_id: id, // Record one of the IDs as reference
            amount: totalAmount,
            payment_method: 'cash' // Default for demo, can be expanded
          }]);
        }

        // 4.3 Reset Table Status to 'available'
        await supabase.from('tables').update({ status: 'available' }).eq('table_number', tableNo);
        fetchTables(); // Refresh floor plan
      } else {
        await supabase.from('orders').update({ status: newStatus }).eq('id', id);

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

  const billingOrdersCount = orders.filter(o => o.status === 'เรียกเช็คบิล').length;

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
      <div className="min-h-screen bg-[#FFF5F8] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-pink-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FFF5F8] text-[#411E24] font-sans pb-32 relative">

      {/* แจ้งเตือนเช็คบิล */}
      {billingOrdersCount > 0 && (
        <div onClick={() => setActiveTab('billing')} className="fixed top-4 left-4 right-4 z-[110] bg-red-600 text-white p-4 rounded-3xl shadow-2xl flex items-center justify-between animate-bounce cursor-pointer border-2 border-white">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-2 rounded-full"><BellRing size={20} className="animate-pulse" /></div>
            <div>
              <p className="font-black text-sm">เรียกเช็คบิล! ({billingOrdersCount} โต๊ะ)</p>
            </div>
          </div>
          <button className="bg-white text-red-600 px-4 py-1 rounded-full text-[10px] font-black uppercase">ไปที่หน้าเช็คบิล</button>
        </div>
      )}

      {/* Global Realtime Monitor & Test Sound */}
      {/* Global Audio Unlock Overlay */}
      {!isAudioUnlocked && (
        <div className="fixed inset-0 z-[999] bg-white flex items-center justify-center p-6 sm:p-10">
          <div className="w-full max-w-sm text-center">
            <div className="w-24 h-24 bg-pink-100 rounded-[2.5rem] flex items-center justify-center mx-auto mb-8 shadow-inner">
              <BellRing size={48} className={`text-[#FF85A1] ${isUnlocking ? 'animate-spin' : 'animate-bounce'}`} />
            </div>
            <h2 className="text-3xl font-black text-[#411E24] mb-4">เปิดเสียงแจ้งเตือน</h2>
            <p className="text-gray-500 font-bold mb-10 leading-relaxed px-4">
              คลิกปุ่มด้านล่างเพื่อเริ่มระบบเสียงแจ้งเตือน<br />
              ออเดอร์ใหม่และลูกค้าเรียกเช็คบิล<br />
              (เพื่อให้ทำงานได้บนมือถือ)
            </p>
            <button
              onClick={unlockAudio}
              disabled={isUnlocking}
              className={`w-full py-6 rounded-[2rem] font-black text-xl shadow-2xl transition-all flex items-center justify-center gap-3 active:scale-95 ${isUnlocking ? 'bg-gray-200 text-gray-400' : 'bg-[#FF85A1] text-white shadow-pink-200 hover:scale-[1.02]'}`}
            >
              {isUnlocking ? 'กำลังเปิดเสียง...' : 'ตกลง เปิดเสียง ✨'}
            </button>
          </div>
        </div>
      )}

      <div className="max-w-4xl mx-auto px-6 pt-4 space-y-2 text-center sm:text-left">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="flex flex-col gap-1 items-center sm:items-start">
              <div className="flex items-center gap-1.5 bg-white px-3 py-1 rounded-full border border-gray-100 shadow-sm">
                <div className={`w-2 h-2 rounded-full ${realtimeStatus === 'SUBSCRIBED' ? 'bg-green-500 animate-pulse' : realtimeStatus === 'CONNECTING' ? 'bg-yellow-400' : 'bg-red-400'}`} />
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">Realtime: {realtimeStatus}</span>
              </div>
              <p className="text-[8px] text-gray-400 ml-2 font-bold font-sans">อัปเดตล่าสุด: {lastEventTime}</p>
            </div>
            <button onClick={playNotificationSound} className={`text-[10px] px-3 py-1 rounded-full font-black border flex items-center gap-1 active:scale-95 transition-transform ${isAudioUnlocked ? 'bg-blue-50 text-blue-500 border-blue-100' : 'bg-gray-50 text-gray-400 border-gray-100'}`}>
              <BellRing size={12} /> ทดสอบเสียง
            </button>
          </div>
          <button
            onClick={handleLogout}
            className="text-red-400 font-black text-[10px] uppercase tracking-wider bg-red-50/50 px-4 py-1.5 rounded-full"
          >
            Logout
          </button>
        </div>
      </div>

      {/* TAB: FLOOR PLAN */}
      {activeTab === 'floor' && (
        <main className="p-6 max-w-4xl mx-auto animate-in fade-in duration-500 pb-40">
          <header className="mb-8 flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="text-center md:text-left">
              <h1 className="text-3xl font-black tracking-tight">แผนผังร้าน (Floor Plan)</h1>
              <p className="text-gray-400 font-bold text-sm">ตรวจสอบสถานะโต๊ะแบบ Real-time</p>
            </div>
            <button
              onClick={() => setIsTableManageMode(!isTableManageMode)}
              className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-black text-sm transition-all shadow-lg ${isTableManageMode ? 'bg-[#411E24] text-white shadow-gray-200' : 'bg-white text-[#FF85A1] border-2 border-pink-50 shadow-pink-50'}`}
            >
              {isTableManageMode ? <LayoutGrid size={18} /> : <PlusCircle size={18} />}
              {isTableManageMode ? 'ดูแผนผังโต๊ะ' : 'จัดการโต๊ะ'}
            </button>
          </header>

          {isTableManageMode ? (
            <div className="animate-in slide-in-from-top duration-500">
              <form onSubmit={handleAddTable} className="bg-white p-6 rounded-[2.5rem] border border-gray-100 shadow-sm mb-8 flex flex-col md:flex-row gap-4">
                <div className="flex-1">
                  <label className="text-[10px] font-black uppercase text-gray-400 ml-2 mb-2 block">เลขโต๊ะ (Table No.)</label>
                  <input
                    type="text"
                    placeholder="เช่น 5, 6, A1"
                    required
                    className="w-full bg-gray-50 rounded-2xl px-5 py-3 font-bold outline-none border border-transparent focus:border-pink-200"
                    value={newTableNo}
                    onChange={(e) => setNewTableNo(e.target.value)}
                  />
                </div>
                <div className="md:w-40">
                  <label className="text-[10px] font-black uppercase text-gray-400 ml-2 mb-2 block">ที่นั่ง (Capacity)</label>
                  <select
                    className="w-full bg-gray-50 rounded-2xl px-5 py-3 font-bold outline-none border border-transparent focus:border-pink-200"
                    value={newTableCapacity}
                    onChange={(e) => setNewTableCapacity(e.target.value)}
                  >
                    {[2, 4, 6, 8, 10, 12].map(num => <option key={num} value={num}>{num} ที่นั่ง</option>)}
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={isAddingTable}
                  className="md:mt-6 bg-[#FF85A1] text-white px-8 py-3 rounded-2xl font-black text-sm shadow-lg shadow-pink-100 disabled:bg-gray-200"
                >
                  {isAddingTable ? 'กำลังเพิ่ม...' : <div className="flex items-center gap-2"><PlusCircle size={18} /> เพิ่มโต๊ะ</div>}
                </button>
              </form>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {tables.map((table) => (
                  <div key={table.id} className="bg-white p-5 rounded-[2.5rem] border border-gray-50 flex justify-between items-center shadow-sm">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-2xl bg-pink-50 flex items-center justify-center text-2xl font-black text-[#FF85A1]">
                        {table.table_number}
                      </div>
                      <div>
                        <h4 className="font-black text-lg">โต๊ะ {table.table_number}</h4>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{table.capacity} ที่นั่ง • {table.status === 'available' ? 'ว่าง' : 'ไม่ว่าง'}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowQrModal(table.table_number)}
                        className="p-3 bg-blue-50 text-blue-500 rounded-2xl hover:scale-110 transition-transform"
                        title="แสดง QR Code"
                      >
                        <QrCode size={20} />
                      </button>
                      <button
                        onClick={() => handleDeleteTable(table.id)}
                        className="p-3 bg-red-50 text-red-500 rounded-2xl hover:scale-110 transition-transform"
                        title="ลบโต๊ะ"
                      >
                        <Trash2 size={20} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="animate-in fade-in duration-500">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                {tables.length === 0 ? (
                  <div className="col-span-full py-20 text-center bg-white rounded-3xl border-2 border-dashed border-pink-100 text-pink-300 font-bold">
                    ยังไม่มีข้อมูลโต๊ะในระบบ<br />
                    (กรุณากดเพิ่มข้อมูลในฐานข้อมูล)
                  </div>
                ) : (
                  tables.map((table) => {
                    const isOccupied = table.status === 'occupied' || orders.some(o => o.table_no === table.table_number && (o.status === 'กำลังเตรียม' || o.status === 'กำลังทำ' || o.status === 'เสร็จแล้ว'));
                    const isBilling = table.status === 'billing' || table.status === 'เรียกเช็คบิล' || orders.some(o => o.table_no === table.table_number && o.status === 'เรียกเช็คบิล');

                    let statusColor = 'bg-white border-pink-100 text-pink-400';
                    let statusText = 'ว่าง';

                    if (isBilling) {
                      statusColor = 'bg-yellow-400 border-yellow-500 text-white animate-pulse';
                      statusText = 'เรียกเช็คบิล';
                    } else if (isOccupied) {
                      statusColor = 'bg-[#FF85A1] border-pink-400 text-white';
                      statusText = 'มีลูกค้า';
                    }

                    return (
                      <button
                        key={table.id}
                        onClick={() => setSelectedTableDetail(table)}
                        className={`${statusColor} p-6 rounded-[2.5rem] border-2 shadow-sm transition-all hover:scale-105 active:scale-95 flex flex-col items-center justify-center gap-2 group relative overflow-hidden`}
                      >
                        <div className="absolute top-2 right-4 opacity-10 group-hover:opacity-20 transition-opacity">
                          <LayoutGrid size={40} />
                        </div>
                        <span className="text-4xl font-black">{table.table_number}</span>
                        <span className="text-xs font-black uppercase tracking-widest">{statusText}</span>
                        <p className="text-[10px] opacity-60 font-bold mt-1 inline-flex items-center gap-1">
                          <Utensils size={10} /> {table.capacity} ที่นั่ง
                        </p>
                        {isOccupied && (
                          <div className="mt-2 text-[8px] bg-white/20 px-2 py-0.5 rounded-full font-black uppercase tracking-tighter">
                            คลิกดูออเดอร์
                          </div>
                        )}
                      </button>
                    );
                  })
                )}
              </div>

              <div className="mt-12 flex flex-wrap gap-4 justify-center md:justify-start">
                <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-full border border-pink-50 shadow-sm">
                  <div className="w-3 h-3 bg-white border-2 border-pink-100 rounded-full"></div>
                  <span className="text-[10px] font-black text-gray-400">โต๊ะว่าง</span>
                </div>
                <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-full border border-pink-50 shadow-sm">
                  <div className="w-3 h-3 bg-[#FF85A1] rounded-full"></div>
                  <span className="text-[10px] font-black text-gray-400">มีลูกค้า</span>
                </div>
                <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-full border border-pink-50 shadow-sm">
                  <div className="w-3 h-3 bg-yellow-400 rounded-full animate-pulse"></div>
                  <span className="text-[10px] font-black text-gray-400">เรียกเช็คบิล</span>
                </div>
              </div>
            </div>
          )}
        </main>
      )}

      {/* TAB: MENU */}
      {activeTab === 'menu' && (
        <main className="p-6 max-w-4xl mx-auto animate-in fade-in duration-500 pb-40">
          <header className="mb-6 flex justify-between items-end">
            <div>
              <h1 className="text-3xl font-black tracking-tight">จัดการเมนู</h1>
              <p className="text-gray-400 font-bold text-sm">{menus.length} รายการ</p>
            </div>
            <button
              onClick={() => {
                setEditingId(null);
                setFormData({ name: '', price: '', category: 'เมนูข้าว', image_url: '', imageFile: null, noodle_options: [] });
                setIsModalOpen(true);
              }}
              className="bg-[#FF85A1] text-white px-6 py-3 rounded-2xl font-black text-sm flex items-center gap-2 shadow-lg shadow-pink-100 hover:scale-[1.02] active:scale-95 transition-all"
            >
              <Plus size={18} strokeWidth={3} /> เพิ่มเมนูใหม่
            </button>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            <div className="bg-[#EFFFF6] p-5 rounded-[2rem] flex-1 border border-green-100 shadow-sm">
              <p className="text-[#10B981] text-[10px] font-black uppercase mb-1">พร้อมขาย</p>
              <p className="text-3xl font-black text-black">{menus.filter(m => m.is_available).length}</p>
            </div>
            <div className="bg-[#FFF1F1] p-5 rounded-[2rem] flex-1 border border-red-100 shadow-sm">
              <p className="text-[#F43F5E] text-[10px] font-black uppercase mb-1">สินค้าหมด</p>
              <p className="text-3xl font-black text-black">{menus.filter(m => !m.is_available).length}</p>
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto no-scrollbar mb-6">
            {['ทั้งหมด', 'เมนูข้าว', 'เมนูเส้น', 'กับข้าว'].map(cat => (
              <button key={cat} onClick={() => setSelectedCategory(cat)} className={`px-6 py-2.5 rounded-full text-sm font-black transition-all whitespace-nowrap ${selectedCategory === cat ? 'bg-[#FF85A1] text-white shadow-lg' : 'bg-white text-[#FF85A1]'}`}>{cat}</button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {menus.filter(m => selectedCategory === 'ทั้งหมด' || m.category === selectedCategory).map((item) => (
              <div key={item.id} className="bg-white p-4 rounded-[2rem] shadow-sm flex items-center gap-4 border border-pink-50">
                <div className={`w-20 h-20 rounded-[1.5rem] overflow-hidden bg-gray-100 flex-shrink-0 ${!item.is_available && 'grayscale opacity-50'}`}>
                  <img src={item.image_url || 'https://via.placeholder.com/150'} className="w-full h-full object-cover" alt={item.name} />
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className={`font-black text-md ${!item.is_available ? 'text-pink-200 line-through' : 'text-[#FF85A1]'}`}>{item.name}</h3>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {item.noodle_options?.map((n: string) => (
                          <span key={n} className="bg-blue-50 text-blue-500 text-[8px] px-1.5 py-0.5 rounded-md font-black">#{n}</span>
                        ))}
                      </div>
                    </div>
                    <p className="text-lg font-black text-black">฿{item.price}</p>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleMenuAvailability(item.id, item.is_available)}
                        className={`w-10 h-5 rounded-full relative transition-all ${item.is_available ? 'bg-[#34D399]' : 'bg-gray-300'}`}
                      >
                        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${item.is_available ? 'right-0.5' : 'left-0.5'}`} />
                      </button>
                      <span className="text-[9px] font-black text-gray-400 uppercase">{item.is_available ? 'พร้อมขาย' : 'ของหมด'}</span>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleEditClick(item)} className="p-2 bg-pink-50 rounded-full text-pink-400" title="แก้ไข"><Edit3 size={14} /></button>
                      <button onClick={() => deleteMenu(item.id)} className="p-2 bg-red-50 rounded-full text-red-400" title="ลบ"><Trash2 size={14} /></button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </main>
      )}

      {/* TAB: BILLING */}
      {
        activeTab === 'billing' && (
          <main className="p-6 max-w-4xl mx-auto animate-in slide-in-from-right duration-500 pb-40">
            <header className="mb-6 flex justify-between items-end">
              <div>
                <h1 className="text-3xl font-black tracking-tight">รายการเช็คบิล</h1>
                <p className="text-red-500 font-bold text-sm">รอดำเนินการ {billingOrdersCount} โต๊ะ</p>
              </div>
              <div onClick={() => fetchOrders()} className="bg-red-50 p-3 rounded-2xl text-red-500 cursor-pointer hover:bg-red-100 transition-colors">
                <ClipboardList size={24} strokeWidth={3} />
              </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* --- Aggregated Billing View: Group by Table --- */}
              {Array.from(new Set(orders.filter(o => o.status === 'เรียกเช็คบิล').map(o => o.table_no))).length === 0 ? (
                <div className="p-12 text-center text-gray-400 bg-white rounded-3xl border-2 border-dashed border-gray-100 italic">
                  ยังไม่มีโต๊ะเรียกเช็คบิลในขณะนี้
                </div>
              ) : (
                Array.from(new Set(orders.filter(o => o.status === 'เรียกเช็คบิล').map(o => o.table_no))).map((tableNo) => {
                  const tableOrders = orders.filter(o => o.table_no === tableNo && o.status === 'เรียกเช็คบิล');
                  const totalAmount = tableOrders.reduce((sum, o) => sum + (Number(o.total_price) || 0), 0);

                  return (
                    <div key={tableNo} className="bg-white rounded-3xl overflow-hidden shadow-sm border border-gray-100 animate-in fade-in slide-in-from-bottom-2">
                      <div className="bg-[#FF85A1] p-4 text-white flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <div className="bg-orange-500 p-2 rounded-xl"><Utensils size={18} /></div>
                          <span className="font-black text-lg">โต๊ะ {tableNo}</span>
                        </div>
                        <div className="bg-white/10 px-3 py-1 rounded-full text-[10px] font-bold flex items-center gap-1.5 border border-white/20">
                          <Clock size={12} className="text-orange-300" /> เรียกเช็คบิลเมื่อ {formatOrderTime(tableOrders[0]?.updated_at || tableOrders[0]?.created_at)}
                        </div>
                      </div>

                      <div className="p-6">
                        {/* ✅ Unserved Items Warning */}
                        {(() => {
                          const allTableOrders = orders.filter(o => o.table_no === tableNo && o.status !== 'เสร็จสิ้น');
                          const unservedOrders = allTableOrders.filter(o => o.status === 'รอ' || o.status === 'กำลังเตรียม' || o.status === 'กำลังทำ');

                          if (unservedOrders.length > 0) {
                            return (
                              <div className="mb-6 bg-red-50 border-2 border-red-500 rounded-3xl p-5 animate-pulse">
                                <p className="text-red-600 font-black text-sm flex items-center gap-2 mb-3">
                                  <BellRing size={18} /> ⚠️ แจ้งเตือน: มีรายการที่ยังไม่เสร็จสิ้น!
                                </p>
                                <div className="space-y-2">
                                  {unservedOrders.map(o => (
                                    <div key={o.id} className="bg-white/60 p-3 rounded-2xl">
                                      {o.items?.map((item: any, i: number) => (
                                        <div key={i} className="flex justify-between text-[11px] font-bold text-red-400">
                                          <span>• {item.quantity}x {item.name} {item.selectedNoodle && `(${item.selectedNoodle})`}</span>
                                          <span className="bg-red-100 px-2 py-0.5 rounded-full uppercase text-[8px]">{o.status}</span>
                                        </div>
                                      ))}
                                    </div>
                                  ))}
                                </div>
                                <p className="text-[10px] text-red-400 mt-3 font-bold">* กรุณาแจ้งครัวหรือตรวจสอบก่อนรับเงิน</p>
                              </div>
                            );
                          }
                          return null;
                        })()}

                        <div className="space-y-4 mb-6">
                          {tableOrders.map((order, idx) => (
                            <div key={order.id} className="space-y-2 border-b border-gray-50 pb-4 last:border-0 last:pb-0">
                              <div className="flex justify-between items-center mb-1">
                                <span className="text-[9px] font-bold text-[#8B5E3C]/30 uppercase tracking-wider">สั่งเมื่อ {formatOrderTime(order.created_at)}</span>
                              </div>
                              {order.items?.map((item: any, i: number) => (
                                <div key={i} className="flex justify-between text-sm">
                                  <span className="text-black font-medium">{item.quantity}x {item.name} {item.isSpecial && '(พิเศษ)'}</span>
                                  <span className="font-black text-black">฿{(item.totalItemPrice || item.price) * item.quantity}</span>
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>

                        <div className="flex justify-between items-center pt-4 border-t border-gray-100 mb-6">
                          <span className="text-gray-400 font-medium">รวมยอดชำระทั้งสิ้น</span>
                          <span className="text-2xl font-black text-black">฿{totalAmount}</span>
                        </div>

                        <div className="flex gap-3">
                          <button
                            onClick={() => updateOrderStatus(tableOrders[0].id, 'กำลังเตรียม')}
                            className="flex-1 py-3 border-2 border-gray-100 rounded-2xl text-gray-400 font-bold text-sm active:scale-95 transition-transform"
                          >
                            ย้อนกลับ
                          </button>
                          <button
                            onClick={() => updateOrderStatus(0, 'เสร็จสิ้น', tableNo as string)}
                            className="flex-[2] py-3 bg-green-500 text-white rounded-2xl font-black shadow-lg shadow-green-100 active:scale-95 transition-transform flex items-center justify-center gap-2"
                          >
                            <CheckCircle2 size={18} /> ยืนยันรับเงิน
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </main>
        )
      }

      {/* ✅ TAB: SALES (แก้ไขตรรกะให้ยอดขึ้น 100%) */}
      {
        activeTab === 'sales' && (
          <main className="p-6 max-w-4xl mx-auto animate-in fade-in duration-500 pb-40">
            <header className="mb-6">
              <h1 className="text-3xl font-black tracking-tight">รายงานยอดขาย</h1>
              <p className="text-gray-400 font-bold text-sm">ตรวจสอบรายได้ของคุณ</p>
            </header>

            <div className="flex bg-gray-100 p-1 rounded-2xl mb-6">
              <button
                onClick={() => setSalesViewMode('daily')}
                className={`flex-1 py-2.5 rounded-xl font-bold text-xs transition-all ${salesViewMode === 'daily' ? 'bg-white text-[#FF85A1] shadow-sm' : 'text-[#FF85A1]'}`}
              >
                รายวัน
              </button>
              <button
                onClick={() => setSalesViewMode('monthly')}
                className={`flex-1 py-2.5 rounded-xl font-bold text-xs transition-all ${salesViewMode === 'monthly' ? 'bg-white text-[#FF85A1] shadow-sm' : 'text-[#FF85A1]'}`}
              >
                รายเดือน
              </button>
            </div>

            <div className="flex justify-between items-center mb-4 px-2">
              <h2 className="text-xl font-black text-[#FF85A1]">สรุปยอดขาย</h2>
              <button
                onClick={() => {
                  if (confirm("ต้องการรีเซ็ตข้อมูลทดสอบกลับไปค่าเริ่มต้นใช่หรือไม่? (ข้อมูลที่บันทึกในเครื่องจะถูกล้าง)")) {
                    localStorage.removeItem('demo_admin_orders');
                    fetchOrders();
                  }
                }}
                className="text-[10px] font-bold text-pink-400 border border-pink-100 px-3 py-1 rounded-full bg-pink-50/30 hover:bg-pink-50 transition-colors"
              >
                รีเซ็ตข้อมูลทดสอบ
              </button>
            </div>

            <div className="bg-white p-4 rounded-[2rem] shadow-sm border border-gray-50 mb-6 flex items-center gap-4">
              <div className="bg-blue-50 p-3 rounded-2xl text-blue-500">
                <Calendar size={20} />
              </div>
              <div className="flex-1">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-1">
                  {salesViewMode === 'daily' ? 'เลือกวันที่' : 'เลือกเดือน'}
                </p>
                {salesViewMode === 'daily' ? (
                  <div>
                    <input
                      type="date"
                      className="w-full font-bold text-[#411E24] outline-none bg-transparent"
                      value={selectedSalesDate}
                      onChange={(e) => setSelectedSalesDate(e.target.value)}
                    />
                    <p className="text-[9px] text-gray-400 mt-1">
                      {new Date(selectedSalesDate).toLocaleDateString('th-TH', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        timeZone: 'Asia/Bangkok'
                      })}
                    </p>
                  </div>
                ) : (
                  <div>
                    <input
                      type="month"
                      className="w-full font-bold text-[#411E24] outline-none bg-transparent"
                      value={selectedSalesMonth}
                      onChange={(e) => setSelectedSalesMonth(e.target.value)}
                    />
                    <p className="text-[9px] text-gray-400 mt-1">
                      {new Date(selectedSalesMonth + '-01').toLocaleDateString('th-TH', {
                        year: 'numeric',
                        month: 'long',
                        timeZone: 'Asia/Bangkok'
                      })}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {(() => {
              // ✅ การกรองข้อมูลแบบใหม่ที่แม่นยำกว่าเดิม
              const filteredSales = orders.filter(o => {
                // ในหน้า "ยอดขาย" ให้นับเฉพาะที่ 'เสร็จสิ้น' (ชำระเงินแล้ว) เท่านั้น
                if (o.status !== 'เสร็จสิ้น') return false;
                // ถ้าไม่มีวันที่ (NULL) ให้ตีว่าเป็นวันที่ปัจจุบันเพื่อให้แสดงผลในรายงานได้ทันที
                const d = o.created_at ? new Date(o.created_at) : new Date();

                if (isNaN(d.getTime())) return false; // ข้ามถ้าเป็นวันที่ที่ผิดพลาด

                // ใช้ ToDateString เพื่อความแน่นอนในการเปรียบเทียบวัน
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');

                const orderDateStr = `${year}-${month}-${day}`;
                const orderMonthStr = `${year}-${month}`;

                // เปรียบเทียบกับวันที่ข้างนอก
                if (salesViewMode === 'daily') {
                  return orderDateStr === selectedSalesDate;
                } else {
                  return orderMonthStr === selectedSalesMonth;
                }
              });

              const totalRevenue = filteredSales.reduce((sum, o) => {
                const price = Number(o.total_price);
                return sum + (isNaN(price) ? 0 : price);
              }, 0);
              const totalOrders = filteredSales.length;
              const avgTicket = totalOrders > 0 ? (totalRevenue / totalOrders).toFixed(0) : 0;

              return (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    <div className="bg-white p-5 rounded-[2.5rem] border border-gray-50 shadow-sm">
                      <div className="bg-green-50 w-10 h-10 rounded-2xl flex items-center justify-center text-green-500 mb-3">
                        <TrendingUp size={20} />
                      </div>
                      <p className="text-2xl font-black text-black">฿{totalRevenue.toLocaleString()}</p>
                      <p className="text-[10px] font-bold text-gray-400 uppercase">รายได้รวม</p>
                    </div>
                    <div className="bg-white p-5 rounded-[2.5rem] border border-gray-50 shadow-sm">
                      <div className="bg-blue-50 w-10 h-10 rounded-2xl flex items-center justify-center text-blue-500 mb-3">
                        <ListChecks size={20} />
                      </div>
                      <p className="text-2xl font-black text-black">{totalOrders}</p>
                      <p className="text-[10px] font-bold text-gray-400 uppercase">ออเดอร์</p>
                    </div>
                    <div className="bg-white p-5 rounded-[2.5rem] border border-gray-50 shadow-sm">
                      <div className="bg-orange-50 w-10 h-10 rounded-2xl flex items-center justify-center text-orange-500 mb-3">
                        <DollarSign size={20} />
                      </div>
                      <p className="text-2xl font-black text-black">฿{avgTicket}</p>
                      <p className="text-[10px] font-bold text-gray-400 uppercase">เฉลี่ย/บิล</p>
                    </div>
                    <div className="bg-[#FF85A1] p-5 rounded-[2.5rem] shadow-lg">
                      <div className="bg-white/10 w-10 h-10 rounded-2xl flex items-center justify-center text-white mb-3">
                        <Clock size={20} />
                      </div>
                      <p className="text-2xl font-black text-white">{totalOrders > 0 ? 'ปกติ' : '-'}</p>
                      <p className="text-[10px] font-bold text-gray-400 uppercase">สถานะ</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filteredSales.length === 0 ? (
                      <div className="col-span-full text-center py-10 text-gray-400 font-bold bg-white rounded-[2rem] border border-dashed border-gray-100">
                        ไม่มีรายการขายในช่วงเวลานี้
                      </div>
                    ) : (
                      filteredSales.map((order) => (
                        <div key={order.id} className="bg-white p-5 rounded-[2.2rem] border border-gray-50 flex justify-between items-center shadow-sm">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-pink-100 flex items-center justify-center text-black font-black border border-pink-200">
                              {order.table_no}
                            </div>
                            <div>
                              <p className="font-black text-sm">โต๊ะ {order.table_no}</p>
                              <p className="text-[10px] text-gray-400 font-bold">
                                {formatOrderTime(order.created_at)}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-black text-black">฿{order.total_price}</p>
                            <p className="text-[10px] text-black font-bold">{order.items?.length || 0} รายการ</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  {/* ✅ Collapsible Payment History Section */}
                  <div className="mt-12">
                    <button
                      onClick={() => setShowPaymentHistory(!showPaymentHistory)}
                      className="w-full bg-white p-6 rounded-[2.5rem] border border-gray-100 shadow-sm flex items-center justify-between hover:bg-gray-50 transition-colors active:scale-[0.98]"
                    >
                      <div className="flex items-center gap-4">
                        <div className="bg-pink-50 p-3 rounded-2xl text-[#FF85A1]">
                          <Wallet size={24} />
                        </div>
                        <div className="text-left">
                          <h2 className="text-lg font-black text-[#FF85A1]">รายละเอียดการชำระเงิน (Payments)</h2>
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{payments.length} รายการในระบบ</p>
                        </div>
                      </div>
                      <div className={`p-2 bg-gray-50 rounded-full text-gray-400 transition-transform duration-300 ${showPaymentHistory ? 'rotate-180' : ''}`}>
                        <Timer size={20} className={showPaymentHistory ? '' : 'rotate-90'} />
                      </div>
                    </button>

                    {showPaymentHistory && (
                      <div className="mt-6 space-y-3 animate-in slide-in-from-top-4 duration-500">
                        {payments.length === 0 ? (
                          <div className="text-center py-10 text-gray-300 italic bg-white rounded-3xl border border-dashed border-gray-100">
                            ยังไม่มีประวัติการชำระเงิน
                          </div>
                        ) : (
                          payments.map((payment) => (
                            <div key={payment.id} className="bg-white p-5 rounded-[2rem] border border-gray-50 flex justify-between items-center shadow-sm hover:border-pink-100 transition-colors">
                              <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-green-50 flex items-center justify-center text-green-500">
                                  <Wallet size={24} />
                                </div>
                                <div>
                                  <p className="font-black text-sm">เลขที่ออเดอร์ #{payment.id}</p>
                                  <p className="text-[10px] text-gray-400 font-bold flex items-center gap-1">
                                    <Clock size={10} /> {formatOrderTime(payment.created_at)} • {payment.payment_method === 'cash' ? 'เงินสด' : 'โอนเงิน'}
                                  </p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-lg font-black text-green-600">+ ฿{payment.amount.toLocaleString()}</p>
                                <span className="text-[8px] font-black uppercase tracking-tighter text-gray-300">Transaction Verified</span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </>
              );
            })()}
          </main>
        )
      }

      {/* ✅ MODAL: TABLE DETAIL (Interactive Floor Plan) */}
      {selectedTableDetail && (
        <div className="fixed inset-0 z-[150] bg-black/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-2xl rounded-[3rem] overflow-hidden shadow-2xl animate-in zoom-in duration-300 max-h-[90vh] flex flex-col">
            <div className="bg-[#FF85A1] p-8 text-white flex justify-between items-start">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <div className="bg-white/20 p-3 rounded-2xl"><LayoutGrid size={32} /></div>
                  <h3 className="text-4xl font-black">โต๊ะ {selectedTableDetail.table_number}</h3>
                </div>
                <div className="flex gap-2">
                  <span className="bg-white/20 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider">
                    {selectedTableDetail.capacity} ที่นั่ง
                  </span>
                  <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${selectedTableDetail.status === 'available' ? 'bg-green-400' : selectedTableDetail.status === 'billing' ? 'bg-yellow-400' : 'bg-pink-400'}`}>
                    {selectedTableDetail.status === 'available' ? 'ว่าง' : selectedTableDetail.status === 'billing' ? 'ลูกค้ารอเช็คบิล' : 'มีลูกค้า'}
                  </span>
                </div>
              </div>
              <button onClick={() => setSelectedTableDetail(null)} className="bg-white/10 hover:bg-white/20 transition-colors p-3 rounded-full">
                <X size={28} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8">
              <div className="space-y-6">
                <h4 className="text-xl font-black flex items-center gap-2">
                  <ClipboardList className="text-[#FF85A1]" /> รายการออเดอร์ทั้งหมด
                </h4>

                {orders.filter(o => o.table_no === selectedTableDetail.table_number && o.status !== 'เสร็จสิ้น').length === 0 ? (
                  <div className="py-20 text-center bg-gray-50 rounded-[2.5rem] border-2 border-dashed border-gray-100">
                    <p className="text-gray-400 font-bold uppercase tracking-widest text-sm">ยังไม่มีรายการสั่งอาหาร</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {orders.filter(o => o.table_no === selectedTableDetail.table_number && o.status !== 'เสร็จสิ้น').map((order) => (
                      <div key={order.id} className="bg-white border-2 border-pink-50 rounded-[2rem] p-6 shadow-sm">
                        <div className="flex justify-between items-center mb-4">
                          <div className="flex items-center gap-2">
                            <span className="bg-pink-50 text-[#FF85A1] text-[10px] px-3 py-1 rounded-full font-black uppercase tracking-widest">
                              {order.status}
                            </span>
                            <span className="text-[10px] text-gray-400 font-bold">
                              {formatOrderTime(order.created_at)}
                            </span>
                          </div>
                          <div className="flex gap-2">
                            {['รอ', 'กำลังเตรียม', 'กำลังทำ', 'เสร็จแล้ว'].includes(order.status) && (
                              <button
                                onClick={() => updateOrderStatus(order.id, 'เสร็จแล้ว')}
                                className="bg-green-50 text-green-600 p-2 rounded-xl hover:bg-green-100 transition-colors"
                                title="เสร็จแล้ว"
                              >
                                <CheckCircle2 size={18} />
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="space-y-2">
                          {order.items?.map((item: any, idx: number) => (
                            <div key={idx} className="flex justify-between items-center text-sm font-bold">
                              <div className="flex items-center gap-2">
                                <span className="text-gray-400">{item.quantity}x</span>
                                <span>{item.name} {item.selectedNoodle && `(${item.selectedNoodle})`}</span>
                              </div>
                              <span className="text-[#FF85A1]">฿{item.price * item.quantity}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="p-8 bg-gray-50 border-t flex gap-4">
              {selectedTableDetail.status === 'billing' ? (
                <button
                  onClick={() => { setActiveTab('billing'); setSelectedTableDetail(null); }}
                  className="flex-1 bg-red-500 text-white py-5 rounded-[2rem] font-black text-lg shadow-xl shadow-red-100 flex items-center justify-center gap-2 animate-pulse"
                >
                  <Wallet /> ไปที่คิวเช็คบิล
                </button>
              ) : (
                <button
                  onClick={() => setSelectedTableDetail(null)}
                  className="flex-1 bg-white border-2 border-gray-200 text-gray-400 py-5 rounded-[2rem] font-black text-lg hover:bg-gray-100 transition-colors"
                >
                  ปิดหน้าต่าง
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL เพิ่ม/แก้ไขเมนู (คงเดิมทุกอย่าง) */}
      {
        isModalOpen && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200] flex justify-end">
            <div className="bg-white w-full max-w-md h-full p-8 overflow-y-auto">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl font-black">{editingId ? 'แก้ไขเมนู' : 'เพิ่มเมนูใหม่'}</h2>
                <button onClick={() => setIsModalOpen(false)} className="p-2 bg-gray-100 rounded-full"><X size={24} /></button>
              </div>
              <form onSubmit={handleSaveMenu} className="space-y-6 pb-20">
                <div onClick={() => !isSaving && fileInputRef.current?.click()} className="w-full h-40 bg-gray-50 rounded-[2rem] border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden cursor-pointer">
                  {formData.image_url ? <img src={formData.image_url} className="w-full h-full object-cover" /> : <ImageIcon size={30} className="text-gray-300" />}
                  <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleFileChange} />
                </div>
                <input type="text" placeholder="ชื่อเมนู" required className="w-full bg-gray-50 rounded-[1.5rem] p-5 font-bold outline-none text-[#411E24]" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
                <input type="number" placeholder="ราคา" required className="w-full bg-gray-50 rounded-[1.5rem] p-5 font-bold outline-none text-[#411E24]" value={formData.price} onChange={(e) => setFormData({ ...formData, price: e.target.value })} />

                <div>
                  <label className="text-[10px] font-black uppercase text-gray-400 ml-2 mb-2 block">หมวดหมู่</label>
                  <div className="flex gap-2 overflow-x-auto no-scrollbar">
                    {['เมนูข้าว', 'เมนูเส้น', 'กับข้าว'].map(cat => (
                      <button key={cat} type="button" onClick={() => setFormData({ ...formData, category: cat })} className={`px-5 py-2.5 rounded-full text-[10px] font-black whitespace-nowrap ${formData.category === cat ? 'bg-[#FF85A1] text-white' : 'bg-pink-100 text-[#FF85A1]'}`}>{cat}</button>
                    ))}
                  </div>
                </div>

                <div className="bg-pink-50 p-6 rounded-[2.5rem] border border-pink-100 space-y-4">
                  <label className="text-[10px] font-black uppercase text-pink-500 flex items-center gap-2"><ListChecks size={14} /> ตัวเลือกเส้นสำหรับลูกค้า</label>
                  <div className="flex gap-2">
                    <input type="text" placeholder="เพิ่มเส้น..." className="flex-1 bg-white rounded-full px-4 py-2 text-xs font-bold outline-none text-[#411E24]" value={customNoodle} onChange={(e) => setCustomNoodle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddCustomNoodle())} />
                    <button type="button" onClick={handleAddCustomNoodle} className="bg-pink-500 text-white p-2 rounded-full"><PlusCircle size={20} /></button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {noodleTypes.map(noodle => (
                      <div key={noodle} className="relative group">
                        <button type="button" onClick={() => toggleNoodle(noodle)} className={`w-full py-3 rounded-xl text-[10px] font-black border-2 ${formData.noodle_options.includes(noodle) ? 'bg-pink-500 border-pink-500 text-white' : 'bg-white border-transparent text-[#FF85A1]'}`}>{noodle}</button>
                        <button type="button" onClick={(e) => { e.stopPropagation(); handleDeleteNoodleType(noodle); }} className="absolute -top-1 -right-1 bg-red-100 text-red-500 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"><X size={10} /></button>
                      </div>
                    ))}
                  </div>
                </div>

                <button type="submit" disabled={isSaving} className={`w-full py-5 rounded-[2rem] font-black text-lg text-white shadow-xl ${isSaving ? 'bg-pink-200' : 'bg-[#FF85A1]'}`}>
                  {isSaving ? 'กำลังบันทึก...' : 'บันทึกเมนู'}
                </button>
              </form>
            </div>
          </div>
        )
      }

      {/* NAV BAR (คงเดิม) */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-xl border-t p-5 flex justify-around items-center z-50">
        <button onClick={() => { setActiveTab('floor'); setIsTableManageMode(false); }} className={`flex flex-col items-center gap-1 ${activeTab === 'floor' ? 'text-[#FF85A1]' : 'text-pink-200'}`}>
          <LayoutGrid size={24} />
          <span className="text-[9px] font-black">แผนผังโต๊ะ</span>
        </button>
        <button onClick={() => setActiveTab('menu')} className={`flex flex-col items-center gap-1 ${activeTab === 'menu' ? 'text-[#FF85A1]' : 'text-pink-200'}`}>
          <Utensils size={24} />
          <span className="text-[9px] font-black">เมนู</span>
        </button>
        <button onClick={() => setActiveTab('billing')} className={`flex flex-col items-center gap-1 relative ${activeTab === 'billing' ? 'text-red-500' : 'text-gray-300'}`}>
          <Wallet size={24} />
          <span className="text-[9px] font-black">เช็คบิล</span>
          {billingOrdersCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center font-black animate-pulse">
              {billingOrdersCount}
            </span>
          )}
        </button>
        <button onClick={() => setActiveTab('sales')} className={`flex flex-col items-center gap-1 ${activeTab === 'sales' ? 'text-[#FF69B4]' : 'text-pink-200'}`}>
          <TrendingUp size={24} />
          <span className="text-[9px] font-black">ยอดขาย</span>
        </button>
      </nav>

      {/* QR CODE MODAL */}
      {
        showQrModal && (
          <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-300">
            <div className="bg-white w-full max-w-sm rounded-[3rem] overflow-hidden shadow-2xl animate-in zoom-in duration-300">
              <div className="bg-[#FF85A1] p-6 text-white text-center">
                <h3 className="text-2xl font-black">QR Code สำหรับโต๊ะ {showQrModal}</h3>
                <p className="text-[10px] font-bold opacity-80 uppercase tracking-widest mt-1">สแกนเพื่อสั่งอาหารทันที</p>
              </div>
              <div className="p-10 flex flex-col items-center gap-6">
                <div className="p-4 bg-white rounded-3xl border-4 border-pink-50 shadow-inner">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(typeof window !== 'undefined' ? window.location.origin : '')}?table=${showQrModal}`}
                    alt={`QR Table ${showQrModal}`}
                    className="w-48 h-48"
                  />
                </div>
                <p className="text-xs text-center text-gray-400 font-bold leading-relaxed px-4">
                  ให้ลูกค้านำมือถือมาสแกน QR Code นี้<br />เพื่อเข้าสู่หน้าร้านโต๊ะ {showQrModal} ได้ทันที
                </p>
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