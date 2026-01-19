"use client";
import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import {
  ShoppingCart, ClipboardList, Receipt, Plus, Minus,
  Trash2, ArrowLeft, Utensils, CheckCircle2, FileText, Clock, ChevronRight
} from 'lucide-react';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

// --- Interfaces ---
interface Category { id: number; name: string; }
interface Product {
  id: number;
  name: string;
  price: number;
  image_url: string;
  category: string;
  description: string;
  is_available: boolean;
  has_noodle?: boolean;
  noodle_options?: string[];
}

interface CartItem extends Product {
  quantity: number;
  note?: string;
  selectedNoodle?: string;
  isSpecial?: boolean;
  totalItemPrice: number;
}
interface Order { id: number; total_price: number; status: string; table_no: string; created_at: string; items: any[]; }

// แยกคอมโพเนนต์หลักออกมาเพื่อใช้ Suspense หุ้ม
function RestaurantAppContent() {
  const searchParams = useSearchParams();
  // Derive tableNo directly to prevent "Table 5" flash
  const tableNo = searchParams.get('table') || searchParams.get('t') || '5';

  // --- States ---
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [view, setView] = useState<'menu' | 'cart' | 'orders' | 'bill'>('menu');
  const [orderSuccess, setOrderSuccess] = useState(false);

  const [activeProduct, setActiveProduct] = useState<Product | null>(null);
  const [tempQty, setTempQty] = useState(1);
  const [tempNote, setTempNote] = useState('');

  const [selectedNoodle, setSelectedNoodle] = useState<string>('');
  const [isSpecial, setIsSpecial] = useState<boolean>(false);

  // --- Derived State ---
  const totalCartPrice = cart.reduce((sum, item) => sum + (item.totalItemPrice * item.quantity), 0);
  const totalBillAmount = orders.reduce((sum, order) => sum + (Number(order.total_price) || 0), 0);
  const totalItemsCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const isCurrentlyBilling = orders.some(o => o.status === 'เรียกเช็คบิล');
  const preparingCount = orders.filter(o => o.status === 'กำลังเตรียม' || o.status === 'กำลังทำ').length;
  const servedCount = orders.filter(o => o.status === 'เสร็จแล้ว').length;
  const filteredProducts = selectedCat ? products.filter(p => p.category === selectedCat) : products;

  // --- Effects ---
  useEffect(() => {
    fetchData();
    fetchOrders();

    // BroadcastChannel for Demo Realtime Sync
    const channel = new BroadcastChannel('restaurant_demo_channel');
    channel.onmessage = (event) => {
      const { type, status, table_no, action, item, id } = event.data;

      // Order Status Update (e.g. Payment Completed) - Check matching table
      if (type === 'ORDER_UPDATE' && table_no === tableNo) {
        if (status === 'เสร็จสิ้น') {
          // Payment Completed -> Reset App
          alert("ขอบคุณที่ใช้บริการ! การชำระเงินเสร็จสิ้น");

          // Persist "Paid" state so refreshing doesn't bring back mock orders
          if (typeof window !== 'undefined') localStorage.setItem(`demo_session_clear_${tableNo}`, 'true');

          setOrders([]);
          setCart([]);
          setView('menu');
        } else {
          fetchOrders();
        }
      }

      // Menu Update (Add/Edit/Delete/Toggle)
      if (type === 'MENU_UPDATE') {
        if (action === 'UPSERT' && item) {
          setProducts(prev => {
            const exists = prev.find(p => p.id === item.id);
            if (exists) return prev.map(p => p.id === item.id ? { ...p, ...item } : p);
            return [item as Product, ...prev];
          });
        }
        if (action === 'DELETE' && id) {
          setProducts(prev => prev.filter(p => p.id !== id));
        }
      }
    };

    const orderChannel = supabase
      .channel('customer_realtime_status')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `table_no=eq.${tableNo}` },
        (payload) => {
          fetchOrders();

          // หากแอดมินกดรับเงินเรียบร้อย (เสร็จสิ้น) ให้รีเซ็ตหน้าจอทุกเครื่องในโต๊ะนี้
          if (payload.new && (payload.new as any).status === 'เสร็จสิ้น') {
            alert("ขอบคุณที่ใช้บริการ! การชำระเงินเสร็จสิ้นแล้วค่ะ");
            setOrders([]);
            setCart([]);
            setView('menu');

            if (typeof window !== 'undefined') {
              localStorage.removeItem(`table_billing_${tableNo}`);
              localStorage.setItem(`demo_session_clear_${tableNo}`, 'true');
            }
          }
        }
      )
      .subscribe();

    const menuChannel = supabase
      .channel('menu_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'menus' },
        () => {
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(orderChannel);
      supabase.removeChannel(menuChannel);
      channel.close();
    };
  }, [tableNo]);

  /* --- Mock Data --- */
  const MOCK_CATEGORIES: Category[] = [
    { id: 1, name: "เมนูข้าว" },
    { id: 2, name: "เมนูเส้น" },
    { id: 3, name: "กับข้าว" }
  ];

  const MOCK_PRODUCTS: Product[] = [
    {
      id: 1,
      name: "ข้าวผัดปู",
      price: 80,
      image_url: "https://images.unsplash.com/photo-1563379926898-05f4575a45d8?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80",
      category: "เมนูข้าว",
      description: "ข้าวผัดปูหอมกลิ่นกระทะ ใส่เนื้อปูสดใหม่",
      is_available: true
    },
    {
      id: 2,
      name: "ก๋วยเตี๋ยวต้มยำกุ้งน้ำข้น",
      price: 120,
      image_url: "https://images.unsplash.com/photo-1555126634-323283e090fa?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80",
      category: "เมนูเส้น",
      description: "ก๋วยเตี๋ยวต้มยำกุ้งรสจัดจ้าน เครื่องแน่น",
      is_available: true,
      has_noodle: true,
      noodle_options: ["เส้นเล็ก", "เส้นใหญ่", "บะหมี่", "หมี่ขาว", "วุ้นเส้น"]
    },
    {
      id: 3,
      name: "ผัดกะเพราหมูสับ",
      price: 60,
      image_url: "https://images.unsplash.com/photo-1599305090598-fe179d501227?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80",
      category: "เมนูข้าว",
      description: "ผัดกะเพราหมูสับรสเด็ด เผ็ดกำลังดี",
      is_available: true
    },
    {
      id: 4,
      name: "ต้มยำกุ้ง",
      price: 150,
      image_url: "https://images.unsplash.com/photo-1548943487-a2e4e43b485c?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80",
      category: "กับข้าว",
      description: "ต้มยำกุ้งน้ำข้น รสชาติไทยแท้",
      is_available: true
    },
    {
      id: 5,
      name: "ข้าวขาหมู",
      price: 70,
      image_url: "https://images.unsplash.com/photo-1432139555190-58524dae6a55?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80",
      category: "เมนูข้าว",
      description: "ข้าวขาหมูเนื้อนุ่ม น้ำราดกลมกล่อม",
      is_available: false
    }
  ];

  /* --- Fetching Logic (Demo Mode) --- */
  const fetchData = async () => {
    try {
      // Fetch Categories
      const { data: catData, error: catError } = await supabase.from('categories').select('*');
      if (catError) {
        setCategories(MOCK_CATEGORIES);
      } else if (catData) {
        setCategories(catData);
      } else {
        setCategories(MOCK_CATEGORIES);
      }

      // Fetch Products (Check Persistence First)
      if (typeof window !== 'undefined') {
        const savedMenus = localStorage.getItem('demo_menus');
        if (savedMenus) {
          setProducts(JSON.parse(savedMenus));
          return;
        }
      }

      const { data: prodData, error: prodError } = await supabase
        .from('menus')
        .select('*')
        .order('id', { ascending: false });

      if (!prodError) {
        // ถ้า query สำเร็จ ให้ใช้ข้อมูลจาก DB เสมอ (แม้จะไม่มีเมนู)
        setProducts(prodData as Product[] || []);
      } else {
        // กรณี Error จริงๆ
        setProducts(MOCK_PRODUCTS);
      }
    } catch (e) {
      console.warn('Unexpected error in fetchData, using fallback:', e);
      setCategories(MOCK_CATEGORIES);
      setProducts(MOCK_PRODUCTS);
    }
  };

  /* --- Mock Data for Customer Orders (Demo Mode) --- */
  /* --- Mock Data for Customer Orders (Demo Mode) --- */
  const MOCK_CUSTOMER_ORDERS: Order[] = [
    {
      id: 101,
      total_price: 150,
      status: 'เสร็จแล้ว',
      table_no: tableNo,
      created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
      items: [
        { name: "ต้มยำกุ้ง", quantity: 1, price: 150, totalItemPrice: 150, image_url: "https://images.unsplash.com/photo-1548943487-a2e4e43b485c?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80" }
      ]
    }
  ];

  const fetchOrders = async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('table_no', tableNo)
        .neq('status', 'เสร็จสิ้น')
        .order('created_at', { ascending: false });

      if (!error) {
        // ถ้า query สำเร็จ ให้ใช้ข้อมูลจริงเสมอ 
        const activeOrders = data || [];
        setOrders(activeOrders);

        // ตรวจสอบว่าโต๊ะนี้กำลังเช็คบิลอยู่หรือไม่
        const isCurrentlyBilling = activeOrders.some(o => o.status === 'เรียกเช็คบิล');
        if (isCurrentlyBilling) {
          // ถ้ากำลังเช็คบิล ให้เซฟไว้ในเครื่องด้วยเพื่อช่วยคุม UI
          if (typeof window !== 'undefined') localStorage.setItem(`table_billing_${tableNo}`, 'true');
        } else {
          if (typeof window !== 'undefined') localStorage.removeItem(`table_billing_${tableNo}`);
        }
      } else {
        // กรณี Error
        if (typeof window !== 'undefined' && localStorage.getItem(`demo_session_clear_${tableNo}`) === 'true') {
          setOrders([]);
        } else {
          setOrders(MOCK_CUSTOMER_ORDERS);
        }
      }
    } catch (e) {
      if (typeof window !== 'undefined' && localStorage.getItem(`demo_session_clear_${tableNo}`) === 'true') {
        setOrders([]);
      } else {
        setOrders(MOCK_CUSTOMER_ORDERS);
      }
    }
  };

  const formatTime = (date: string) => {
    if (!date) return '(เพิ่งสั่ง)';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '(เพิ่งสั่ง)';
    return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.';
  };

  const openProductDetail = (product: Product) => {
    if (!product.is_available) return;
    setActiveProduct(product);
    setTempQty(1);
    setTempNote('');
    setSelectedNoodle('');
    setIsSpecial(false);
  };

  const confirmAddToCart = () => {
    if (!activeProduct) return;

    const priceWithOption = activeProduct.price + (isSpecial ? 10 : 0);

    setCart(prev => {
      const existing = prev.find(item =>
        item.id === activeProduct.id &&
        item.selectedNoodle === selectedNoodle &&
        item.isSpecial === isSpecial &&
        item.note === tempNote
      );

      if (existing) {
        return prev.map(item => (
          item.id === activeProduct.id &&
          item.selectedNoodle === selectedNoodle &&
          item.isSpecial === isSpecial &&
          item.note === tempNote
        ) ? { ...item, quantity: item.quantity + tempQty } : item);
      }

      return [...prev, {
        ...activeProduct,
        quantity: tempQty,
        note: tempNote,
        selectedNoodle: selectedNoodle,
        isSpecial: isSpecial,
        totalItemPrice: priceWithOption
      }];
    });
    setActiveProduct(null);
  };

  const updateQuantity = (id: number, delta: number, note?: string, noodle?: string, special?: boolean) => {
    setCart(prev => prev.map(item =>
      (item.id === id && item.note === note && item.selectedNoodle === noodle && item.isSpecial === special)
        ? { ...item, quantity: Math.max(1, item.quantity + delta) } : item
    ));
  };

  const removeFromCart = (id: number, note?: string, noodle?: string, special?: boolean) => {
    setCart(prev => prev.filter(item =>
      !(item.id === id && item.note === note && item.selectedNoodle === noodle && item.isSpecial === special)
    ));
  };

  const submitOrder = async () => {
    if (isCurrentlyBilling) {
      alert("ไม่สามารถสั่งอาหารเพิ่มได้ในขณะนี้ เนื่องจากคุณได้เรียกเช็คบิลไปแล้วค่ะ");
      return;
    }
    const totalPrice = cart.reduce((sum, item) => sum + (item.totalItemPrice * item.quantity), 0);

    // Demo Mode Logic
    console.log("Submitting order (Demo Mode)...", cart);

    setOrderSuccess(true);

    // Clear the "Session Cleared" flag because user is starting a NEW fresh order session
    if (typeof window !== 'undefined') localStorage.removeItem(`demo_session_clear_${tableNo}`);

    // Mock adding order to local state so user feels it works
    const newOrder: Order = {
      id: Math.floor(Math.random() * 10000),
      total_price: totalPrice,
      status: 'กำลังเตรียม',
      table_no: tableNo,
      created_at: new Date().toISOString(),
      items: cart
    };

    // Optimistic update
    setOrders(prev => [newOrder, ...prev]);

    // ✅ Removed redundant optimistic local storage update to prevent duplication
    // We rely on Supabase Realtime to update Admin/Kitchen pages.

    // Try real submit
    try {
      const { error } = await supabase.from('orders').insert([{
        items: cart,
        total_price: totalPrice,
        status: 'กำลังเตรียม',
        table_no: tableNo,
        created_at: new Date().toISOString()
      }]);
      if (error) console.warn("Supabase submit failed (Demo Mode Active)", error);
    } catch (e) { console.warn("Submit Exception", e); }

    setCart([]);

    setTimeout(() => {
      setOrderSuccess(false);
      setView('orders');
    }, 2000);
  };
  const callForBill = async () => {
    // Allow bill request regardless of unfinished orders as per user request

    if (orders.length === 0) {
      alert("ไม่พบรายการอาหารที่สั่งค่ะ");
      return;
    }

    // 1. Calculate Summary for the total bill
    const billPrice = orders.reduce((sum, o) => sum + (Number(o.total_price) || 0), 0);
    const billItems = orders.flatMap(o => o.items || []);

    // 2. Optimistic Update for Demo Mode
    setOrders(prev => prev.map(o => o.table_no === tableNo ? { ...o, status: 'เรียกเช็คบิล' } : o));

    // 3. Broadcast to Admin (Send FULL data to ensure admin sees it even if refreshed)
    const channel = new BroadcastChannel('restaurant_demo_channel');
    const firstOrder = orders.find(o => o.table_no === tableNo && o.status !== 'เสร็จสิ้น');

    channel.postMessage({
      type: 'ORDER_UPDATE',
      id: firstOrder?.id || Date.now(),
      status: 'เรียกเช็คบิล',
      table_no: tableNo,
      total_price: billPrice,
      items: billItems
    });

    try {
      console.log('Sending callForBill for table:', tableNo);
      const { data, error, count } = await supabase
        .from('orders')
        .update({ status: 'เรียกเช็คบิล' })
        .eq('table_no', tableNo)
        .neq('status', 'เสร็จสิ้น');

      console.log('CallForBill Supabase Response:', { data, error, count });

      if (error) {
        console.warn("Supabase call bill failed", error);
        alert("ขออภัย! ระบบส่งสัญญาณเช็คบิลไม่ได้: " + (error.message || "Unknown error"));
      } else {
        alert('แจ้งพนักงานเรียบร้อยค่ะ กำลังเตรียมใบเสร็จให้คุณลูกค้า');
        setView('orders');
      }
    } catch (e) {
      console.warn("Supabase exception in call bill:", e);
    }
  };

  // --- Render Views ---
  if (view === 'cart') {
    return (
      <div className="w-full max-w-md md:max-w-2xl mx-auto bg-[#FFFBF5] min-h-screen pb-40 relative">
        <header className="bg-gradient-to-r from-[#FF85A1] to-[#FF69B4] text-black p-6 pt-10 flex items-center gap-4 rounded-b-[30px] shadow-sm">
          <button onClick={() => setView('menu')} className="bg-black/5 p-2 rounded-full backdrop-blur-sm transition-colors hover:bg-black/10 text-black"><ArrowLeft size={24} /></button>
          <div>
            <h1 className="text-xl font-black text-black">ตะกร้าสินค้า</h1>
            <p className="text-[10px] text-black/60 font-bold uppercase tracking-wider">โต๊ะ {tableNo} • {cart.length} รายการ</p>
          </div>
        </header>
        <main className="p-4 space-y-4">
          {orderSuccess ? (
            <div className="py-20 text-center space-y-4 animate-in zoom-in">
              <div className="flex justify-center"><CheckCircle2 size={80} className="text-green-500" /></div>
              <h2 className="text-2xl font-bold">สั่งอาหารเรียบร้อย!</h2>
            </div>
          ) : cart.length === 0 ? (
            <div className="text-center py-20 text-gray-400">ไม่มีสินค้าในตะกร้า</div>
          ) : (
            cart.map((item, idx) => (
              <div key={idx} className="bg-white p-3 rounded-2xl shadow-sm flex gap-4 relative border border-pink-50/50">
                <div className="w-20 h-20 bg-gray-100 rounded-xl overflow-hidden shrink-0"><img src={item.image_url} className="w-full h-full object-cover" /></div>
                <div className="flex-1 pr-8">
                  <h3 className="font-black text-[15px]">{item.name} {item.isSpecial && <span className="text-[#FF85A1]">(พิเศษ)</span>}</h3>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {item.selectedNoodle && <span className="text-[9px] bg-[#FFF5F8] text-[#FF85A1] px-2 py-0.5 rounded-full font-black border border-pink-100">{item.selectedNoodle}</span>}
                    {item.note && <span className="text-[9px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">*{item.note}</span>}
                  </div>
                  <p className="text-black font-black text-xl mt-1">฿{item.totalItemPrice}</p>
                </div>
                <button onClick={() => removeFromCart(item.id, item.note, item.selectedNoodle, item.isSpecial)} className="absolute top-3 right-3 text-red-300"><Trash2 size={18} /></button>
                <div className="absolute bottom-3 right-3 flex items-center gap-3 bg-white rounded-full p-1 border border-pink-100">
                  <button onClick={() => updateQuantity(item.id, -1, item.note, item.selectedNoodle, item.isSpecial)} className="bg-[#FF85A1] text-black rounded-full p-1 shadow-sm"><Minus size={14} /></button>
                  <span className="font-black text-sm text-black">{item.quantity}</span>
                  <button onClick={() => updateQuantity(item.id, 1, item.note, item.selectedNoodle, item.isSpecial)} className="bg-[#FF85A1] text-black rounded-full p-1 shadow-sm"><Plus size={14} /></button>
                </div>
              </div>
            ))
          )}
        </main>
        {cart.length > 0 && !orderSuccess && (
          <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md md:max-w-2xl bg-white p-6 rounded-t-[40px] shadow-2xl z-30">
            <div className="flex justify-between items-center mb-4 px-2">
              <span className="text-gray-500 font-bold">รวมทั้งหมด</span>
              <span className="text-3xl font-black text-black">฿{totalCartPrice}</span>
            </div>
            <button
              onClick={submitOrder}
              disabled={isCurrentlyBilling}
              className={`w-full py-4 rounded-2xl font-black text-lg shadow-md transition-all active:scale-95 ${isCurrentlyBilling ? 'bg-gray-200 text-gray-400' : 'bg-[#FF85A1] text-black'}`}
            >
              {isCurrentlyBilling ? 'งดสั่งอาหาร (กำลังเช็คบิล)' : `สั่งอาหาร (${totalItemsCount} รายการ)`}
            </button>
          </div>
        )}
      </div>
    );
  }

  if (view === 'orders') {
    return (
      <div className="w-full max-w-md md:max-w-2xl mx-auto bg-[#FFFBF5] min-h-screen pb-40 relative">
        <header className="bg-gradient-to-r from-[#FF85A1] to-[#FF69B4] text-black p-6 pt-10 flex items-center gap-4 rounded-b-[30px] shadow-sm">
          <button onClick={() => setView('menu')} className="bg-black/5 p-2 rounded-full backdrop-blur-sm transition-colors hover:bg-black/10 text-black"><ArrowLeft size={24} /></button>
          <div><h1 className="text-xl font-black text-black">รายการที่สั่ง</h1><p className="text-[10px] text-black/60 font-bold uppercase tracking-wider">โต๊ะ {tableNo} • {orders.length} ออเดอร์</p></div>
        </header>
        <main className="p-4 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className={`bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center transition-all ${preparingCount > 0 ? 'ring-2 ring-[#FF85A1]' : 'opacity-50'}`}>
              <div className="flex items-center gap-2 mb-1"><Utensils size={18} className="text-[#FF85A1]" /><span className="font-black text-lg text-black">{preparingCount}</span></div>
              <span className="text-[10px] text-gray-400 uppercase font-bold">กำลังเตรียม</span>
            </div>
            <div className={`bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center transition-all ${servedCount > 0 ? 'ring-2 ring-green-500' : 'opacity-50'}`}>
              <div className="flex items-center gap-2 mb-1"><CheckCircle2 size={18} className="text-green-500" /><span className="font-black text-lg text-black">{servedCount}</span></div>
              <span className="text-[10px] text-gray-400 uppercase font-bold">เสิร์ฟแล้ว</span>
            </div>
          </div>
          <div>
            <h2 className="flex items-center gap-2 font-black text-[#FF85A1] mb-4"><ClipboardList size={18} /> ติดตามสถานะอาหาร</h2>
            <div className="space-y-3">
              {orders.length === 0 ? (
                <p className="text-center py-10 text-gray-400 italic">ยังไม่มีรายการที่สั่ง</p>
              ) : (
                orders.map((order) => order.items?.map((item: any, idx: number) => (
                  <div key={`${order.id}-${idx}`} className="bg-white p-3 rounded-[24px] shadow-sm flex gap-4 items-center border border-gray-50 relative overflow-hidden transition-all">
                    <div className="w-16 h-16 bg-gray-100 rounded-2xl overflow-hidden shrink-0"><img src={item.image_url} className="w-full h-full object-cover" /></div>
                    <div className="flex-1">
                      <h3 className="font-black text-[15px] mb-0.5">{item.name} {item.isSpecial && <span className="text-[#FF85A1] text-[10px]">(พิเศษ)</span>}</h3>
                      <p className="text-[10px] text-gray-400 font-medium">
                        {item.selectedNoodle && `${item.selectedNoodle} • `}จำนวน x{item.quantity} • {formatTime(order.created_at)}
                      </p>
                    </div>
                    <div className={`px-3 py-1.5 rounded-full flex items-center gap-1.5 border transition-colors ${order.status === 'เสร็จแล้ว' ? 'bg-green-50 border-green-100 text-green-600' : 'bg-[#FFF5F8] border-pink-100 text-[#FF85A1]'
                      }`}>
                      {order.status === 'เสร็จแล้ว' ? <CheckCircle2 size={12} /> : <Clock size={12} />}
                      <span className="text-[10px] font-black">{order.status === 'กำลังเตรียม' ? 'กำลังเตรียม' : order.status}</span>
                    </div>
                    <div className={`absolute left-0 top-0 bottom-0 w-1 transition-colors ${order.status === 'เสร็จแล้ว' ? 'bg-green-500' : 'bg-[#FF85A1]'}`}></div>
                  </div>
                )))
              )}
            </div>
          </div>
        </main>
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md md:max-w-2xl bg-white p-6 rounded-t-[40px] shadow-2xl border-t border-gray-50 z-30">
          <div className="flex justify-between items-center mb-5 px-2">
            <span className="text-gray-500 font-bold">ยอดรวมทั้งหมด</span>
            <span className="text-3xl font-black text-black">฿{totalBillAmount}</span>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => !isCurrentlyBilling && setView('menu')}
              className={`flex-1 border-2 py-4 rounded-2xl font-black transition-all active:scale-95 ${isCurrentlyBilling ? 'border-gray-100 text-gray-300' : 'border-[#FF85A1] text-black bg-[#FFF5F8]'}`}
            >
              สั่งเพิ่ม
            </button>
            <button onClick={() => setView('bill')} className="flex-1 bg-[#FF85A1] text-black py-4 rounded-2xl font-black shadow-md transition-all active:scale-95">ดูบิล</button>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'bill') {
    return (
      <div className="w-full max-w-md md:max-w-2xl mx-auto bg-[#FFFBF5] min-h-screen pb-10 relative font-sans text-black">
        <header className="bg-gradient-to-r from-[#FF85A1] to-[#FF69B4] text-black p-6 pt-10 flex items-center gap-4 rounded-b-[30px] shadow-sm">
          <button onClick={() => setView('orders')} className="bg-black/5 p-2 rounded-full backdrop-blur-sm transition-colors hover:bg-black/10 text-black"><ArrowLeft size={24} /></button>
          <div><h1 className="text-xl font-black text-black">เช็คบิล</h1><p className="text-[10px] text-black/60 font-bold uppercase tracking-wider">โต๊ะ {tableNo} • ร้านป้ากุ้ง</p></div>
        </header>
        <main className="p-6">
          <div className="bg-white rounded-[32px] overflow-hidden shadow-sm border border-gray-100">
            <div className="bg-[#FF85A1] p-4 text-white flex justify-center items-center gap-2"><Receipt size={20} /><span className="font-bold">ใบเสร็จชั่วคราว</span></div>
            <div className="p-8 text-center border-b border-dashed border-gray-200">
              <h2 className="text-2xl font-black mb-1 text-black">ร้านป้ากุ้ง</h2>
              <p className="text-xs text-gray-400">โต๊ะ {tableNo}</p>
            </div>
            <div className="p-6 space-y-4">
              {orders.length === 0 ? (
                <p className="text-center text-gray-400 text-sm">ยังไม่มีรายการอาหาร</p>
              ) : (
                orders.map((order) => order.items?.map((item: any, idx: number) => (
                  <div key={`${order.id}-${idx}`} className="flex justify-between items-start text-sm">
                    <div className="flex gap-3">
                      <span className="text-gray-400">{item.quantity}x</span>
                      <div className="flex flex-col">
                        <span className="font-black text-black">{item.name} {item.isSpecial && '(พิเศษ)'}</span>
                        {item.selectedNoodle && <span className="text-[10px] text-gray-400">{item.selectedNoodle}</span>}
                      </div>
                    </div>
                    <span className="font-black text-black">฿{(item.totalItemPrice || item.price) * item.quantity}</span>
                  </div>
                )))
              )}
              <div className="pt-6 mt-6 border-t border-gray-100 flex justify-between items-center">
                <span className="text-gray-500 font-bold">รวมทั้งหมด</span>
                <span className="text-3xl font-black text-black">฿{totalBillAmount}</span>
              </div>
            </div>
          </div>
          <div className="mt-10 space-y-6">
            <button onClick={callForBill} className="w-full bg-[#FF85A1] text-black py-5 rounded-[24px] font-black text-lg shadow-md flex items-center justify-center gap-3 active:scale-95 transition-transform">
              <div className="bg-white/40 p-1 rounded-lg"><Clock size={20} /></div>เรียกพนักงานเช็คบิล
            </button>
            <button onClick={() => setView('menu')} className="w-full text-center font-black text-pink-400">กลับไปหน้าเมนู</button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md md:max-w-2xl mx-auto bg-[#FFFBF5] min-h-screen pb-24 font-sans text-black">
      <header className="bg-gradient-to-br from-[#FF85A1] to-[#FF69B4] text-black p-6 pt-10 rounded-b-[40px] shadow-md">
        <div className="flex justify-between items-start mb-6">
          <div><p className="text-[10px] text-black/60 font-black uppercase tracking-widest">โต๊ะ {tableNo}</p><h1 className="text-3xl font-black">ร้านป้ากุ้ง</h1></div>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
          <button onClick={() => setSelectedCat(null)} className={`px-6 py-3 rounded-full text-sm font-black transition-all whitespace-nowrap ${!selectedCat ? 'bg-white text-[#FF85A1] shadow-md ring-2 ring-[#FF85A1]/20' : 'bg-white/20 text-white'}`}>ทั้งหมด</button>
          {['เมนูข้าว', 'เมนูเส้น', 'กับข้าว'].map((cat) => (
            <button key={cat} onClick={() => setSelectedCat(cat)} className={`px-6 py-3 rounded-full text-sm font-black transition-all whitespace-nowrap ${selectedCat === cat ? 'bg-white text-[#FF85A1] shadow-md ring-2 ring-[#FF85A1]/20' : 'bg-white/20 text-white'}`}>{cat}</button>
          ))}
        </div>
      </header>

      <main className="p-4 space-y-4">
        {/* Banner: แจ้งเตือนเมื่อกำลังเช็คบิล */}
        {orders.some(o => o.status === 'เรียกเช็คบิล') && (
          <div className="bg-red-50 border-2 border-red-100 p-4 rounded-3xl flex items-center gap-3 animate-pulse">
            <div className="bg-red-500 text-white p-2 rounded-xl">
              <Clock size={20} />
            </div>
            <div>
              <p className="font-black text-red-600 text-sm">กำลังอยู่ในขั้นตอนเช็คบิล</p>
              <p className="text-[10px] text-red-400 font-bold uppercase tracking-wider">งดสั่งอาหารเพิ่มชั่วคราว</p>
            </div>
          </div>
        )}

        {filteredProducts.map((item) => (
          <div
            key={item.id}
            onClick={() => {
              if (orders.some(o => o.status === 'เรียกเช็คบิล')) return;
              openProductDetail(item);
            }}
            className={`bg-white p-3 rounded-2xl shadow-sm flex items-center gap-4 border border-orange-50/50 cursor-pointer relative ${(!item.is_available || orders.some(o => o.status === 'เรียกเช็คบิล')) ? 'opacity-60' : ''}`}
          >
            <div className="w-24 h-24 bg-gray-100 rounded-2xl overflow-hidden shrink-0 relative">
              <img src={item.image_url} className="w-full h-full object-cover" />
              {!item.is_available && (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                  <span className="text-white font-bold text-xs bg-red-500 px-2 py-1 rounded">หมด</span>
                </div>
              )}
            </div>
            <div className="flex-1">
              <h3 className="font-black text-[15px]">{item.name}</h3>
              <p className="text-[10px] text-gray-500 font-medium line-clamp-2 mt-0.5">{item.description}</p>
              <p className="text-black font-black mt-2 text-2xl">฿{item.price}</p>
            </div>
            <div className={`${!item.is_available ? 'bg-gray-300' : 'bg-[#FF85A1]'} text-black p-2.5 rounded-xl shadow-sm transition-all hover:scale-110 active:scale-95`}>
              <Plus size={20} />
            </div>
          </div>
        ))}
      </main>

      {activeProduct && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end">
          <div className="bg-white w-full max-w-md mx-auto rounded-t-[40px] p-6 animate-in slide-in-from-bottom duration-300 max-h-[90vh] overflow-y-auto">
            <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-6"></div>
            <div className="rounded-[32px] overflow-hidden mb-4 h-48 shadow-sm"><img src={activeProduct?.image_url} className="w-full h-full object-cover" /></div>

            <div className="flex justify-between items-start mb-2">
              <h2 className="text-2xl font-black text-black">{activeProduct?.name}</h2>
              <p className="text-3xl font-black text-black">฿{activeProduct?.price}</p>
            </div>
            <p className="text-sm text-gray-400 mb-6">{activeProduct?.description}</p>

            {/* --- ส่วนที่แก้ไข: โชว์เฉพาะเส้นที่คุณเลือกใน Admin --- */}
            {activeProduct?.has_noodle && activeProduct?.noodle_options && activeProduct?.noodle_options.length > 0 && (
              <div className="mb-6">
                <p className="text-sm font-black mb-3 flex items-center gap-2 text-black"><Utensils size={16} className="text-[#FF85A1]" /> เลือกเส้น</p>
                <div className="grid grid-cols-2 gap-2">
                  {/* เปลี่ยนจาก Array คงที่ เป็น activeProduct.noodle_options */}
                  {activeProduct?.noodle_options.map((noodle: string) => (
                    <button
                      key={noodle}
                      onClick={() => setSelectedNoodle(noodle)}
                      className={`py-3 px-4 rounded-2xl text-xs font-black border-2 transition-all ${selectedNoodle === noodle ? 'border-[#FF85A1] bg-[#FFF5F8] text-black' : 'border-gray-50 text-gray-300'
                        }`}
                    >
                      {noodle}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mb-6">
              <p className="text-sm font-black text-black mb-3">ตัวเลือกเพิ่มเติม</p>
              <button
                onClick={() => setIsSpecial(!isSpecial)}
                className={`w-full flex justify-between items-center p-4 rounded-2xl border-2 transition-all ${isSpecial ? 'border-[#FF85A1] bg-[#FFF5F8]' : 'border-gray-100'
                  }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center ${isSpecial ? 'border-[#FF85A1] bg-[#FF85A1]' : 'border-gray-300'}`}>
                    {isSpecial && <CheckCircle2 size={14} className="text-black" />}
                  </div>
                  <span className={`font-black text-sm ${isSpecial ? 'text-black' : 'text-gray-600'}`}>สั่งพิเศษ (ปริมาณเพิ่มขึ้น)</span>
                </div>
                <span className="font-bold text-sm text-black">+ ฿10</span>
              </button>
            </div>

            <div className="bg-[#FFFBF5] border border-pink-100 rounded-2xl p-4 mb-6 flex items-start gap-3">
              <FileText className="text-[#FF85A1] shrink-0" size={20} />
              <input type="text" placeholder="ระบุรายละเอียดอื่น ๆ..." className="bg-transparent w-full text-sm outline-none text-black" value={tempNote} onChange={(e) => setTempNote(e.target.value)} />
            </div>

            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-6 bg-gray-50 rounded-full p-2">
                <button onClick={() => setTempQty(prev => Math.max(1, prev - 1))} className="bg-white text-gray-600 rounded-full p-2 border border-pink-100 shadow-sm transition-all active:scale-90"><Minus size={20} /></button>
                <span className="font-black text-xl w-6 text-center text-black">{tempQty}</span>
                <button onClick={() => setTempQty(prev => prev + 1)} className="bg-[#FF85A1] text-black rounded-full p-2 shadow-sm transition-all active:scale-90"><Plus size={20} /></button>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-gray-400 font-bold uppercase">ราคารวม</p>
                <p className="text-3xl font-black text-black">฿{((activeProduct?.price || 0) + (isSpecial ? 10 : 0)) * tempQty}</p>
              </div>
            </div>

            <div className="flex gap-4">
              <button onClick={() => setActiveProduct(null)} className="flex-1 py-4 font-bold text-gray-400">ยกเลิก</button>
              <button
                onClick={confirmAddToCart}
                disabled={activeProduct?.has_noodle && !selectedNoodle}
                className={`flex-[2] py-4 rounded-2xl font-black text-lg shadow-md transition-all active:scale-95 ${(activeProduct?.has_noodle && !selectedNoodle)
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-[#FF85A1] text-black'
                  }`}
              >
                {activeProduct?.has_noodle && !selectedNoodle ? 'กรุณาเลือกเส้น' : 'เพิ่มลงตะกร้า'}
              </button>
            </div>
          </div>
        </div>
      )}

      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md md:max-w-2xl bg-white p-4 flex justify-around rounded-t-[32px] shadow-2xl border-t border-gray-50 z-30">
        <button onClick={() => setView('cart')} className="flex flex-col items-center text-pink-300 relative">
          <div className="p-2 rounded-xl transition-colors"><ShoppingCart size={24} /></div>
          <span className="text-[10px] font-black mt-1">ตะกร้า</span>
          {totalItemsCount > 0 && (
            <span className="absolute top-0 right-0 bg-red-500 text-white text-[8px] w-5 h-5 rounded-full flex items-center justify-center font-bold border-2 border-white">
              {totalItemsCount}
            </span>
          )}
        </button>
        <button onClick={() => setView('orders')} className="flex flex-col items-center text-black/30 transition-all hover:text-[#FF85A1]">
          <div className="p-2 rounded-xl transition-colors"><ClipboardList size={24} strokeWidth={2.5} /></div>
          <span className="text-[10px] font-black mt-1">ที่สั่งแล้ว</span>
        </button>
        <button onClick={() => setView('bill')} className="flex flex-col items-center text-black/30 transition-all hover:text-[#FF85A1]">
          <div className="p-2 rounded-xl transition-colors"><Receipt size={24} strokeWidth={2.5} /></div>
          <span className="text-[10px] font-black mt-1">เช็คบิล</span>
        </button>
      </nav>
    </div>
  );
}

export default function RestaurantApp() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#FFFBF5]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#FF85A1] mx-auto mb-4"></div>
          <p className="text-[#FF85A1] font-black">กำลังโหลดร้านกุ้ง...</p>
        </div>
      </div>
    }>
      <RestaurantAppContent />
    </Suspense>
  );
}