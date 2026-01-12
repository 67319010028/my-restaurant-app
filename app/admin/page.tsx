"use client";
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Utensils, ClipboardList, TrendingUp, Plus,
  Search, Edit3, Trash2, X, Image as ImageIcon,
  Check, UploadCloud, Clock, ChefHat, CheckCircle2,
  Loader2, Calendar, DollarSign, ListFilter, ListChecks,
  PlusCircle, Timer, BellRing, Wallet, Eye, EyeOff
} from 'lucide-react';

export default function AdminApp() {
  const [activeTab, setActiveTab] = useState<'menu' | 'order' | 'billing' | 'sales'>('menu');
  const [orderSubTab, setOrderSubTab] = useState('กำลังดำเนินการ');
  const [menus, setMenus] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('ทั้งหมด');
  const [isSaving, setIsSaving] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState<'DISCONNECTED' | 'CONNECTING' | 'SUBSCRIBED' | 'ERROR'>('DISCONNECTED');
  const [lastEventTime, setLastEventTime] = useState<string>('ยังไม่มีข้อมูล');
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

  // Notification sound function
  const playNotificationSound = () => {
    const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIGWi78OScTgwOUKzn77RgGwU7k9r0y3kpBSh+zPLaizsKElyx6OyrWBUIQ6Hn8r1nHwUqgc3y2Ik3CBlouvDknE4MDlCs5++0YBsFO5Pa9Mt5KQUofszy2os7ChJcsevsq1gVCEOh5/K9Zx8FKoHN8tiJNwgZaLrw5JxODA5QrOfvtGAbBTuT2vTLeSkFKH7M8tqLOwoSXLHo7KtYFQhDoe');
    audio.play().catch(e => console.log('Audio play failed:', e));
  };

  useEffect(() => {
    fetchMenus();
    fetchOrders();

    const channel = new BroadcastChannel('restaurant_demo_channel');
    channel.onmessage = (event) => {
      const { type, id, status, table_no, total_price, items } = event.data;
      if (type === 'ORDER_UPDATE') {
        setOrders(prev => {
          const exists = prev.find(o => o.id === id);
          if (exists) {
            return prev.map(o => o.id === id ? { ...o, status } : o);
          } else {
            // New order incoming - play notification sound
            playNotificationSound();
            const newOrder = {
              id,
              table_no,
              status,
              total_price: total_price || 0,
              created_at: new Date().toISOString(),
              items: items || []
            };
            return [newOrder, ...prev];
          }
        });
      }
    };

    const menuSub = supabase.channel('menu_change').on('postgres_changes', { event: '*', schema: 'public', table: 'menus' }, () => fetchMenus()).subscribe();

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

  const fetchOrders = async () => {
    try {
      // 1. Fetch from Real Database
      const { data, error } = await supabase.from('orders').select('*').order('created_at', { ascending: false });

      let baseOrders = data || [];

      if (typeof window !== 'undefined') {
        const savedOrdersStr = localStorage.getItem('demo_admin_orders');
        let savedOrders = savedOrdersStr ? JSON.parse(savedOrdersStr) : [];

        // ผสานข้อมูล: ใช้ข้อมูลจริงจาก Database เป็นหลัก
        // และเอาข้อมูลที่ระบบจำไว้ (เฉพาะที่เป็นของจริง) มารวม
        const combined = [...baseOrders];
        savedOrders.forEach((s: any) => {
          // กรองเอาเฉพาะข้อมูลจริง (ID > 1000 หรือ ID ที่ไม่มีใน Mock เดิม)
          // หรือเอาเฉพาะที่ไม่อยู่ใน MOCK_ORDERS ดั้งเดิม (ID 101-104)
          const isMock = s.id >= 101 && s.id <= 104;
          if (!isMock && !combined.some(c => c.id === s.id)) {
            combined.push(s);
          }
        });

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
        await supabase.from('orders').update({ status: newStatus }).eq('table_no', tableNo).neq('status', 'เสร็จสิ้น');
      } else {
        await supabase.from('orders').update({ status: newStatus }).eq('id', id);
      }
    } catch (e) {
      console.warn('Supabase update failed (Demo Mode active):', e);
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
  const getTimeAgo = (date: string) => {
    const minutes = Math.floor((new Date().getTime() - new Date(date).getTime()) / 60000);
    return minutes > 0 ? `${minutes} นาทีที่แล้ว` : 'เมื่อสักครู่';
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
      if (session) setIsLoggedIn(true);
    };
    checkUser();
  }, []);

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
    setIsLoggedIn(false);
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-[#FFF5F8] flex items-center justify-center p-6 bg-[radial-gradient(circle_at_20%_20%,#FFD1DC_0%,transparent_25%),radial-gradient(circle_at_80%_80%,#FFB7C5_0%,transparent_25%)]">
        <div className="bg-white/80 backdrop-blur-2xl w-full max-w-sm p-10 rounded-[3rem] shadow-[0_32px_64px_-16px_rgba(255,182,197,0.3)] border border-pink-100/50 text-center relative overflow-hidden">
          {/* ตกแต่งพื้นหลังเล็กน้อย */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-pink-50 rounded-full -mr-16 -mt-16 blur-3xl opacity-50"></div>

          <div className="relative mb-10">
            <div className="w-24 h-24 bg-gradient-to-br from-[#FFD1DC] to-[#FF9AA2] rounded-[2.5rem] flex items-center justify-center mx-auto mb-6 shadow-xl shadow-pink-100/50 transform rotate-6 hover:rotate-0 transition-transform duration-500">
              <span className="text-6xl drop-shadow-lg">🦐</span>
            </div>
            <h1 className="text-3xl font-black text-[#FF85A1] tracking-tight">Pa Kung Shop</h1>
            <p className="text-[10px] text-pink-300 font-black uppercase tracking-[0.2em] mt-2">Admin Dashboard Login</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4 relative">
            <div className="group">
              <input
                type="email"
                placeholder="อีเมลแอดมิน"
                className={`w-full bg-white p-5 rounded-[1.8rem] font-bold outline-none border-2 transition-all shadow-sm ${loginError ? 'border-red-400 bg-red-50 text-red-500' : 'border-pink-50 focus:border-[#FFB7B2] group-hover:border-pink-100'}`}
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                required
              />
            </div>
            <div className="group relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="รหัสผ่าน"
                className={`w-full bg-white p-5 rounded-[1.8rem] font-bold outline-none border-2 transition-all shadow-sm pr-14 ${loginError ? 'border-red-400 bg-red-50 text-red-500' : 'border-pink-50 focus:border-[#FFB7B2] group-hover:border-pink-100'}`}
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-6 top-1/2 -translate-y-1/2 text-pink-300 hover:text-pink-400 transition-colors"
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
              {loginError && (
                <p className="text-red-400 text-[10px] font-bold mt-3 flex items-center justify-center gap-1 animate-pulse">
                  <X size={12} /> อีเมลหรือรหัสผ่านไม่ถูกต้อง
                </p>
              )}
            </div>
            <button
              type="submit"
              disabled={isAuthenticating}
              className="w-full bg-gradient-to-r from-[#FF9AA2] to-[#FFB7B2] text-white py-5 rounded-[1.8rem] font-black text-lg shadow-lg shadow-pink-100/60 hover:scale-[1.02] active:scale-95 transition-all mt-4 disabled:opacity-50"
            >
              {isAuthenticating ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ ✨'}
            </button>
          </form>

          <p className="text-[9px] text-pink-300 mt-10 font-bold uppercase tracking-widest">© 2026 Admin Portal v2.0</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FB] text-[#1E293B] font-sans pb-32 relative">

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
      <div className="max-w-md mx-auto px-6 pt-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5 bg-white px-3 py-1 rounded-full border border-gray-100 shadow-sm">
              <div className={`w-2 h-2 rounded-full ${realtimeStatus === 'SUBSCRIBED' ? 'bg-green-500 animate-pulse' : realtimeStatus === 'CONNECTING' ? 'bg-yellow-400' : 'bg-red-400'}`} />
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">Realtime: {realtimeStatus}</span>
            </div>
            <p className="text-[8px] text-gray-400 ml-2 font-bold">อัปเดตล่าสุด: {lastEventTime}</p>
          </div>
          <button onClick={playNotificationSound} className="text-[10px] bg-blue-50 text-blue-500 px-3 py-1 rounded-full font-black border border-blue-100 flex items-center gap-1 active:scale-95 transition-transform">
            <BellRing size={12} /> ทดสอบเสียง
          </button>
        </div>
        <button
          onClick={handleLogout}
          className="text-red-400 font-black text-[10px] uppercase tracking-wider"
        >
          Logout
        </button>
      </div>

      {/* TAB: MENU */}
      {activeTab === 'menu' && (
        <main className="p-6 max-w-md mx-auto animate-in fade-in duration-500">
          <header className="mb-6">
            <h1 className="text-3xl font-black tracking-tight">จัดการเมนู</h1>
            <p className="text-gray-400 font-bold text-sm">{menus.length} รายการ</p>
          </header>

          <div className="flex gap-4 mb-8">
            <div className="bg-[#EFFFF6] p-5 rounded-[2rem] flex-1 border border-green-100 shadow-sm">
              <p className="text-[#10B981] text-[10px] font-black uppercase mb-1">พร้อมขาย</p>
              <p className="text-3xl font-black text-[#065F46]">{menus.filter(m => m.is_available).length}</p>
            </div>
            <div className="bg-[#FFF1F1] p-5 rounded-[2rem] flex-1 border border-red-100 shadow-sm">
              <p className="text-[#F43F5E] text-[10px] font-black uppercase mb-1">สินค้าหมด</p>
              <p className="text-3xl font-black text-[#991B1B]">{menus.filter(m => !m.is_available).length}</p>
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto no-scrollbar mb-6">
            {['ทั้งหมด', 'เมนูข้าว', 'เมนูเส้น', 'กับข้าว'].map(cat => (
              <button key={cat} onClick={() => setSelectedCategory(cat)} className={`px-6 py-2.5 rounded-full text-xs font-black transition-all whitespace-nowrap ${selectedCategory === cat ? 'bg-[#1E293B] text-white shadow-lg' : 'bg-white text-gray-400'}`}>{cat}</button>
            ))}
          </div>

          <div className="space-y-4">
            {menus.filter(m => selectedCategory === 'ทั้งหมด' || m.category === selectedCategory).map((item) => (
              <div key={item.id} className="bg-white p-4 rounded-[2rem] shadow-sm flex items-center gap-4 border border-gray-50">
                <div className={`w-20 h-20 rounded-[1.5rem] overflow-hidden bg-gray-100 flex-shrink-0 ${!item.is_available && 'grayscale opacity-50'}`}>
                  <img src={item.image_url || 'https://via.placeholder.com/150'} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className={`font-black text-md ${!item.is_available ? 'text-gray-400 line-through' : 'text-[#1E293B]'}`}>{item.name}</h3>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {item.noodle_options?.map((n: string) => (
                          <span key={n} className="bg-blue-50 text-blue-500 text-[8px] px-1.5 py-0.5 rounded-md font-black">#{n}</span>
                        ))}
                      </div>
                    </div>
                    <p className="text-lg font-black text-blue-600">฿{item.price}</p>
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
                      <button onClick={() => handleEditClick(item)} className="p-2 bg-blue-50 rounded-full text-blue-400"><Edit3 size={14} /></button>
                      <button onClick={() => deleteMenu(item.id)} className="p-2 bg-red-50 rounded-full text-red-400"><Trash2 size={14} /></button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </main >
      )
      }

      {/* TAB: ORDER */}
      {
        activeTab === 'order' && (
          <main className="p-6 max-w-md mx-auto animate-in slide-in-from-bottom duration-500 pb-40">
            <header className="mb-6">
              <h1 className="text-3xl font-black tracking-tight">ออเดอร์</h1>
            </header>

            <div className="flex bg-gray-100 p-1 rounded-2xl mb-6">
              {['กำลังดำเนินการ', 'เสร็จแล้ว', 'ยกเลิก'].map((tab) => (
                <button key={tab} onClick={() => setOrderSubTab(tab)} className={`flex-1 py-2.5 rounded-xl font-bold text-xs transition-all ${orderSubTab === tab ? 'bg-[#1E293B] text-white shadow-md' : 'text-gray-400'}`}>{tab}</button>
              ))}
            </div>

            <div className="space-y-6">
              {orders.filter(o => {
                if (orderSubTab === 'กำลังดำเนินการ') return ['รอ', 'กำลังเตรียม', 'กำลังทำ', 'เรียกเช็คบิล'].includes(o.status);
                if (orderSubTab === 'เสร็จแล้ว') return ['เสร็จแล้ว', 'เสร็จสิ้น'].includes(o.status);
                if (orderSubTab === 'ยกเลิก') return o.status === 'ออร์เดอร์ยกเลิก' || o.status === 'ยกเลิก';
                return true;
              }).map((order) => (
                <div key={order.id} className={`bg-white p-6 rounded-[2.5rem] shadow-sm border-2 transition-all ${order.status === 'เรียกเช็คบิล' ? 'border-red-500 ring-4 ring-red-50' : 'border-gray-50'}`}>
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl font-black text-white ${order.status === 'เรียกเช็คบิล' ? 'bg-red-500' : 'bg-blue-500'}`}>{order.table_no}</div>
                      <div>
                        <h3 className="font-black text-lg">โต๊ะ {order.table_no}</h3>
                        <p className="text-[10px] text-gray-400 font-bold">{getTimeAgo(order.created_at)}</p>
                      </div>
                    </div>
                    <button onClick={() => deleteOrder(order.id)} className="p-2 text-gray-300 hover:text-red-500 transition-colors"><Trash2 size={16} /></button>
                  </div>

                  <div className="space-y-3 mb-4 border-y border-dashed py-3 border-gray-100">
                    {order.items?.map((item: any, idx: number) => (
                      <div key={idx} className="flex justify-between font-bold text-sm">
                        <span className="flex-1"><span className="text-gray-400">{item.quantity}x</span> {item.name} <span className="text-blue-500 text-[10px]">{item.selectedNoodle}</span></span>
                        <span className="font-black">฿{item.price * item.quantity}</span>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    {order.status === 'เรียกเช็คบิล' ? (
                      <button onClick={() => setActiveTab('billing')} className="w-full bg-red-500 text-white py-4 rounded-3xl font-black text-sm flex items-center justify-center gap-2 animate-pulse"><Wallet size={18} /> ไปที่หน้าชำระเงิน</button>
                    ) : orderSubTab === 'กำลังดำเนินการ' ? (
                      <>
                        <button onClick={() => updateOrderStatus(order.id, 'ยกเลิก')} className="flex-1 bg-gray-50 text-gray-400 py-3.5 rounded-3xl font-black text-sm">ยกเลิก</button>
                        {order.status === 'รอ' ? (
                          <button
                            onClick={() => {
                              // แอดมินกดรับออเดอร์ → เปลี่ยนสถานะเป็น "กำลังเตรียม" เพื่อให้หน้าครัวเห็น
                              updateOrderStatus(order.id, 'กำลังเตรียม');
                            }}
                            className="flex-[2] bg-blue-600 text-white py-3.5 rounded-3xl font-black text-sm"
                          >
                            รับออเดอร์
                          </button>
                        ) : (
                          <div className="flex-[2] bg-green-50 text-green-600 py-3.5 rounded-3xl font-black text-sm flex items-center justify-center gap-2">
                            <CheckCircle2 size={18} /> ส่งไปครัวแล้ว
                          </div>
                        )}
                      </>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </main>
        )
      }

      {/* TAB: BILLING */}
      {
        activeTab === 'billing' && (
          <main className="p-6 max-w-md mx-auto animate-in slide-in-from-right duration-500 pb-40">
            <header className="mb-6 flex justify-between items-end">
              <div>
                <h1 className="text-3xl font-black tracking-tight">รายการเช็คบิล</h1>
                <p className="text-red-500 font-bold text-sm">รอดำเนินการ {billingOrdersCount} โต๊ะ</p>
              </div>
              <div onClick={() => fetchOrders()} className="bg-red-50 p-3 rounded-2xl text-red-500 cursor-pointer hover:bg-red-100 transition-colors">
                <ClipboardList size={24} strokeWidth={3} />
              </div>
            </header>

            <div className="space-y-6">
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
                      <div className="bg-[#41281A] p-4 text-white flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <div className="bg-orange-500 p-2 rounded-xl"><Utensils size={18} /></div>
                          <span className="font-black text-lg">โต๊ะ {tableNo}</span>
                        </div>
                        <div className="bg-white/10 px-3 py-1 rounded-full text-[10px] font-bold flex items-center gap-1.5 border border-white/20">
                          <Clock size={12} className="text-orange-300" /> เรียกเช็คบิลแล้ว
                        </div>
                      </div>

                      <div className="p-6">
                        <div className="space-y-4 mb-6">
                          {tableOrders.map((order, idx) => (
                            <div key={order.id} className="space-y-2 border-b border-gray-50 pb-4 last:border-0 last:pb-0">
                              {order.items?.map((item: any, i: number) => (
                                <div key={i} className="flex justify-between text-sm">
                                  <span className="text-gray-500 font-medium">{item.quantity}x {item.name} {item.isSpecial && '(พิเศษ)'}</span>
                                  <span className="font-bold">฿{(item.totalItemPrice || item.price) * item.quantity}</span>
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>

                        <div className="flex justify-between items-center pt-4 border-t border-gray-100 mb-6">
                          <span className="text-gray-400 font-medium">รวมยอดชำระทั้งสิ้น</span>
                          <span className="text-2xl font-black text-[#F97316]">฿{totalAmount}</span>
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
          <main className="p-6 max-w-md mx-auto animate-in fade-in duration-500 pb-40">
            <header className="mb-6">
              <h1 className="text-3xl font-black tracking-tight">รายงานยอดขาย</h1>
              <p className="text-gray-400 font-bold text-sm">ตรวจสอบรายได้ของคุณ</p>
            </header>

            <div className="flex bg-gray-100 p-1 rounded-2xl mb-6">
              <button
                onClick={() => setSalesViewMode('daily')}
                className={`flex-1 py-2.5 rounded-xl font-bold text-xs transition-all ${salesViewMode === 'daily' ? 'bg-white text-[#1E293B] shadow-sm' : 'text-gray-400'}`}
              >
                รายวัน
              </button>
            </div>

            <div className="flex justify-between items-center mb-4 px-2">
              <h2 className="text-xl font-black text-[#1E293B]">สรุปยอดขาย</h2>
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
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">เลือกช่วงเวลา</p>
                {salesViewMode === 'daily' ? (
                  <input
                    type="date"
                    className="w-full font-bold text-[#1E293B] outline-none bg-transparent"
                    value={selectedSalesDate}
                    onChange={(e) => setSelectedSalesDate(e.target.value)}
                  />
                ) : (
                  <input
                    type="month"
                    className="w-full font-bold text-[#1E293B] outline-none bg-transparent"
                    value={selectedSalesMonth}
                    onChange={(e) => setSelectedSalesMonth(e.target.value)}
                  />
                )}
              </div>
            </div>

            {(() => {
              // ✅ การกรองข้อมูลแบบใหม่ที่แม่นยำกว่าเดิม
              const filteredSales = orders.filter(o => {
                // ในหน้า "ยอดขาย" ให้นับเฉพาะที่ 'เสร็จสิ้น' (ชำระเงินแล้ว) เท่านั้น
                if (o.status !== 'เสร็จสิ้น') return false;

                const d = new Date(o.created_at);
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
                  <div className="grid grid-cols-2 gap-4 mb-8">
                    <div className="bg-white p-5 rounded-[2.5rem] border border-gray-50 shadow-sm">
                      <div className="bg-green-50 w-10 h-10 rounded-2xl flex items-center justify-center text-green-500 mb-3">
                        <TrendingUp size={20} />
                      </div>
                      <p className="text-2xl font-black text-[#1E293B]">฿{totalRevenue.toLocaleString()}</p>
                      <p className="text-[10px] font-bold text-gray-400 uppercase">รายได้รวม</p>
                    </div>
                    <div className="bg-white p-5 rounded-[2.5rem] border border-gray-50 shadow-sm">
                      <div className="bg-blue-50 w-10 h-10 rounded-2xl flex items-center justify-center text-blue-500 mb-3">
                        <ListChecks size={20} />
                      </div>
                      <p className="text-2xl font-black text-[#1E293B]">{totalOrders}</p>
                      <p className="text-[10px] font-bold text-gray-400 uppercase">ออเดอร์</p>
                    </div>
                    <div className="bg-white p-5 rounded-[2.5rem] border border-gray-50 shadow-sm">
                      <div className="bg-orange-50 w-10 h-10 rounded-2xl flex items-center justify-center text-orange-500 mb-3">
                        <DollarSign size={20} />
                      </div>
                      <p className="text-2xl font-black text-[#1E293B]">฿{avgTicket}</p>
                      <p className="text-[10px] font-bold text-gray-400 uppercase">เฉลี่ย/บิล</p>
                    </div>
                    <div className="bg-[#1E293B] p-5 rounded-[2.5rem] shadow-lg">
                      <div className="bg-white/10 w-10 h-10 rounded-2xl flex items-center justify-center text-white mb-3">
                        <Clock size={20} />
                      </div>
                      <p className="text-2xl font-black text-white">{totalOrders > 0 ? 'ปกติ' : '-'}</p>
                      <p className="text-[10px] font-bold text-gray-400 uppercase">สถานะ</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="font-black text-lg px-2 flex items-center gap-2">
                      <ListFilter size={18} /> ประวัติการขาย
                    </h3>
                    {filteredSales.length === 0 ? (
                      <div className="text-center py-10 text-gray-400 font-bold bg-white rounded-[2rem] border border-dashed border-gray-100">
                        ไม่มีรายการขายในช่วงเวลานี้
                      </div>
                    ) : (
                      filteredSales.map((order) => (
                        <div key={order.id} className="bg-white p-5 rounded-[2.2rem] border border-gray-50 flex justify-between items-center shadow-sm">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-gray-50 flex items-center justify-center text-[#1E293B] font-black border border-gray-100">
                              {order.table_no}
                            </div>
                            <div>
                              <p className="font-black text-sm">โต๊ะ {order.table_no}</p>
                              <p className="text-[10px] text-gray-400 font-bold">
                                {new Date(order.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-black text-[#10B981]">฿{order.total_price}</p>
                            <p className="text-[10px] text-gray-400 font-bold">{order.items?.length || 0} รายการ</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </>
              );
            })()}
          </main>
        )
      }

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
                <input type="text" placeholder="ชื่อเมนู" required className="w-full bg-gray-50 rounded-[1.5rem] p-5 font-bold outline-none" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
                <input type="number" placeholder="ราคา" required className="w-full bg-gray-50 rounded-[1.5rem] p-5 font-bold outline-none" value={formData.price} onChange={(e) => setFormData({ ...formData, price: e.target.value })} />

                <div>
                  <label className="text-[10px] font-black uppercase text-gray-400 ml-2 mb-2 block">หมวดหมู่</label>
                  <div className="flex gap-2 overflow-x-auto no-scrollbar">
                    {['เมนูข้าว', 'เมนูเส้น', 'กับข้าว'].map(cat => (
                      <button key={cat} type="button" onClick={() => setFormData({ ...formData, category: cat })} className={`px-5 py-2.5 rounded-full text-[10px] font-black whitespace-nowrap ${formData.category === cat ? 'bg-[#1E293B] text-white' : 'bg-gray-100 text-gray-400'}`}>{cat}</button>
                    ))}
                  </div>
                </div>

                <div className="bg-blue-50/50 p-6 rounded-[2.5rem] border border-blue-100 space-y-4">
                  <label className="text-[10px] font-black uppercase text-blue-500 flex items-center gap-2"><ListChecks size={14} /> ตัวเลือกเส้นสำหรับลูกค้า</label>
                  <div className="flex gap-2">
                    <input type="text" placeholder="เพิ่มเส้น..." className="flex-1 bg-white rounded-full px-4 py-2 text-xs font-bold outline-none" value={customNoodle} onChange={(e) => setCustomNoodle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddCustomNoodle())} />
                    <button type="button" onClick={handleAddCustomNoodle} className="bg-blue-500 text-white p-2 rounded-full"><PlusCircle size={20} /></button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {noodleTypes.map(noodle => (
                      <div key={noodle} className="relative group">
                        <button type="button" onClick={() => toggleNoodle(noodle)} className={`w-full py-3 rounded-xl text-[10px] font-black border-2 ${formData.noodle_options.includes(noodle) ? 'bg-blue-500 border-blue-500 text-white' : 'bg-white border-transparent text-gray-400'}`}>{noodle}</button>
                        <button type="button" onClick={(e) => { e.stopPropagation(); handleDeleteNoodleType(noodle); }} className="absolute -top-1 -right-1 bg-red-100 text-red-500 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"><X size={10} /></button>
                      </div>
                    ))}
                  </div>
                </div>

                <button type="submit" disabled={isSaving} className={`w-full py-5 rounded-[2rem] font-black text-lg text-white shadow-xl ${isSaving ? 'bg-gray-400' : 'bg-[#1E293B]'}`}>
                  {isSaving ? 'กำลังบันทึก...' : 'บันทึกเมนู'}
                </button>
              </form>
            </div>
          </div>
        )
      }

      {/* NAV BAR (คงเดิม) */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-xl border-t p-5 flex justify-around items-center z-50">
        <button onClick={() => setActiveTab('menu')} className={`flex flex-col items-center gap-1 ${activeTab === 'menu' ? 'text-[#1E293B]' : 'text-gray-300'}`}><Utensils size={24} /><span className="text-[9px] font-black">เมนู</span></button>
        <button onClick={() => setActiveTab('order')} className={`flex flex-col items-center gap-1 relative ${activeTab === 'order' ? 'text-[#1E293B]' : 'text-gray-300'}`}>
          <ClipboardList size={24} />
          <span className="text-[9px] font-black">ออเดอร์</span>
          {orders.filter(o => o.status === 'รอ').length > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center font-black">
              {orders.filter(o => o.status === 'รอ').length}
            </span>
          )}
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
        <button onClick={() => setActiveTab('sales')} className={`flex flex-col items-center gap-1 ${activeTab === 'sales' ? 'text-orange-500' : 'text-gray-300'}`}><TrendingUp size={24} /><span className="text-[9px] font-black">ยอดขาย</span></button>
      </nav>
    </div>
  );
}