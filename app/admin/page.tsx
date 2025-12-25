"use client";
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Utensils, ClipboardList, TrendingUp, Plus, 
  Search, Edit3, Trash2, X, Image as ImageIcon,
  Check, UploadCloud, Clock, ChefHat, CheckCircle2,
  Loader2, Calendar, DollarSign, ListFilter, ListChecks,
  PlusCircle, Timer, BellRing, Wallet 
} from 'lucide-react';

export default function AdminApp() {
  const [activeTab, setActiveTab] = useState<'menu' | 'order' | 'billing' | 'sales'>('menu');
  const [orderSubTab, setOrderSubTab] = useState('กำลังดำเนินการ');
  const [menus, setMenus] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('ทั้งหมด');
  const [isSaving, setIsSaving] = useState(false);
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

  useEffect(() => {
    fetchMenus();
    fetchOrders();
    
    const menuSub = supabase.channel('menu_change').on('postgres_changes', { event: '*', schema: 'public', table: 'menus' }, () => fetchMenus()).subscribe();
    const orderSub = supabase.channel('order_change').on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => fetchOrders()).subscribe();

    return () => { 
      supabase.removeChannel(menuSub); 
      supabase.removeChannel(orderSub);
    };
  }, []);

  const fetchMenus = async () => {
    const { data } = await supabase.from('menus').select('*').order('id', { ascending: false });
    if (data) setMenus(data);
  };

  const fetchOrders = async () => {
    const { data } = await supabase.from('orders').select('*').order('created_at', { ascending: false });
    if (data) setOrders(data);
  };

  const updateOrderStatus = async (id: number, newStatus: string) => {
    const { error } = await supabase.from('orders').update({ status: newStatus }).eq('id', id);
    if (error) alert("อัปเดตไม่สำเร็จ: " + error.message);
    else fetchOrders();
  };

  const deleteOrder = async (id: number) => {
    if(confirm("ต้องการลบข้อมูลออเดอร์นี้ออกจากระบบใช่หรือไม่?")) {
      const { error } = await supabase.from('orders').delete().eq('id', id);
      if (error) alert("ไม่สามารถลบได้: " + error.message);
      else fetchOrders();
    }
  };

  const deleteMenu = async (id: number) => {
    if(confirm("ยืนยันการลบเมนูนี้?")) {
      const { error } = await supabase.from('menus').delete().eq('id', id);
      if (error) alert("ลบไม่สำเร็จ: " + error.message);
      else fetchMenus();
    }
  };

  const toggleMenuAvailability = async (id: number, currentStatus: boolean) => {
    await supabase.from('menus').update({ is_available: !currentStatus }).eq('id', id);
    fetchMenus();
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

  const handleAddCustomNoodle = () => {
    const trimmed = customNoodle.trim();
    if (trimmed !== '' && !noodleTypes.includes(trimmed)) {
      setNoodleTypes([...noodleTypes, trimmed]);
      setFormData(prev => ({ ...prev, noodle_options: [...prev.noodle_options, trimmed] }));
      setCustomNoodle('');
    }
  };

  const handleDeleteNoodleType = (noodleToDelete: string) => {
    if(confirm(`ต้องการลบตัวเลือก "${noodleToDelete}" ?`)) {
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
    try {
      if (formData.imageFile) {
        const fileName = `${Date.now()}-${formData.imageFile.name}`;
        await supabase.storage.from('menu-images').upload(fileName, formData.imageFile);
        const { data: publicUrlData } = supabase.storage.from('menu-images').getPublicUrl(fileName);
        finalImageUrl = publicUrlData.publicUrl;
      }
      const menuData = {
        name: formData.name, price: Number(formData.price), category: formData.category,
        image_url: finalImageUrl, noodle_options: formData.noodle_options,
        has_noodle: (formData.noodle_options && formData.noodle_options.length > 0) 
      };
      if (editingId) await supabase.from('menus').update(menuData).eq('id', editingId);
      else await supabase.from('menus').insert([{ ...menuData, is_available: true }]);
      
      setIsModalOpen(false);
      setEditingId(null);
      setFormData({ name: '', price: '', category: 'เมนูข้าว', image_url: '', imageFile: null, noodle_options: [] });
      fetchMenus();
    } catch (err: any) { alert(err.message); } finally { setIsSaving(false); }
  };

  const getTimeAgo = (date: string) => {
    const minutes = Math.floor((new Date().getTime() - new Date(date).getTime()) / 60000);
    return minutes > 0 ? `${minutes} นาทีที่แล้ว` : 'เมื่อสักครู่';
  };

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
          <button onClick={() => { setEditingId(null); setFormData({name:'', price:'', category:'เมนูข้าว', image_url:'', imageFile:null, noodle_options: []}); setIsModalOpen(true); }} className="fixed bottom-32 right-6 bg-[#1E293B] text-white px-6 py-4 rounded-full font-black flex items-center gap-2 shadow-2xl z-20"><Plus size={20} strokeWidth={4} />เพิ่มเมนู</button>
        </main>
      )}

      {/* TAB: ORDER */}
      {activeTab === 'order' && (
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
                      <button onClick={() => updateOrderStatus(order.id, order.status === 'รอ' ? 'กำลังทำ' : 'เสร็จแล้ว')} className={`flex-[1.5] text-white py-3.5 rounded-3xl font-black text-sm ${order.status === 'รอ' ? 'bg-blue-600' : 'bg-[#10B981]'}`}>{order.status === 'รอ' ? 'รับออเดอร์' : 'เสร็จแล้ว'}</button>
                    </>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </main>
      )}

      {/* TAB: BILLING */}
      {activeTab === 'billing' && (
        <main className="p-6 max-w-md mx-auto animate-in slide-in-from-right duration-500 pb-40">
          <header className="mb-6 flex justify-between items-end">
            <div>
              <h1 className="text-3xl font-black tracking-tight">รายการเช็คบิล</h1>
              <p className="text-red-500 font-bold text-sm">รอดำเนินการ {billingOrdersCount} โต๊ะ</p>
            </div>
            <div className="bg-red-50 p-3 rounded-2xl text-red-500">
                <Wallet size={24} strokeWidth={3} />
            </div>
          </header>

          <div className="space-y-6">
            {orders.filter(o => o.status === 'เรียกเช็คบิล').length === 0 ? (
                <div className="text-center py-20 bg-white rounded-[3rem] border-2 border-dashed border-gray-100">
                    <div className="bg-gray-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CheckCircle2 size={40} className="text-gray-200" />
                    </div>
                    <p className="text-gray-400 font-black">ไม่มีรายการเรียกเช็คบิล</p>
                </div>
            ) : (
                orders.filter(o => o.status === 'เรียกเช็คบิล').map((order) => (
                    <div key={order.id} className="bg-white p-6 rounded-[2.5rem] shadow-xl border-2 border-red-500 ring-8 ring-red-50 animate-in zoom-in">
                        <div className="flex justify-between items-center mb-6">
                            <div className="flex items-center gap-4">
                                <div className="w-14 h-14 rounded-2xl bg-red-500 flex items-center justify-center text-2xl font-black text-white shadow-lg shadow-red-200">{order.table_no}</div>
                                <div>
                                    <h3 className="font-black text-xl">โต๊ะ {order.table_no}</h3>
                                    <p className="text-xs text-red-400 font-bold uppercase tracking-widest">กำลังรอชำระเงิน</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] text-gray-400 font-bold">{getTimeAgo(order.created_at)}</p>
                            </div>
                        </div>

                        <div className="bg-gray-50 rounded-3xl p-5 mb-6 space-y-3">
                            {order.items?.map((item: any, idx: number) => (
                                <div key={idx} className="flex justify-between font-bold text-sm">
                                    <span className="text-[#1E293B]">{item.quantity}x {item.name}</span>
                                    <span className="font-black">฿{item.price * item.quantity}</span>
                                </div>
                            ))}
                            <div className="border-t border-dashed border-gray-300 pt-3 flex justify-between items-center">
                                <span className="text-gray-400 font-black uppercase text-xs">ยอดรวมทั้งสิ้น</span>
                                <span className="text-2xl font-black text-red-600">฿{order.total_price}</span>
                            </div>
                        </div>

                        <button 
                            onClick={() => updateOrderStatus(order.id, 'เสร็จสิ้น')} 
                            className="w-full bg-[#10B981] hover:bg-[#059669] text-white py-5 rounded-[2rem] font-black text-lg flex items-center justify-center gap-3 shadow-lg shadow-green-100 transition-all active:scale-95"
                        >
                            <CheckCircle2 size={24} /> ยืนยันรับเงินแล้ว
                        </button>
                    </div>
                ))
            )}
          </div>
        </main>
      )}

      {/* ✅ TAB: SALES (แก้ไขตรรกะให้ยอดขึ้น 100%) */}
      {activeTab === 'sales' && (
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
            <button 
              onClick={() => setSalesViewMode('monthly')}
              className={`flex-1 py-2.5 rounded-xl font-bold text-xs transition-all ${salesViewMode === 'monthly' ? 'bg-white text-[#1E293B] shadow-sm' : 'text-gray-400'}`}
            >
              รายเดือน
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
              // นับเฉพาะออเดอร์ที่ 'เสร็จสิ้น' (ชำระเงินแล้ว) หรือ 'เสร็จแล้ว'
              if (o.status !== 'เสร็จสิ้น' && o.status !== 'เสร็จแล้ว') return false;
              
              const d = new Date(o.created_at);
              const year = d.getFullYear();
              const month = String(d.getMonth() + 1).padStart(2, '0');
              const day = String(d.getDate()).padStart(2, '0');
              
              const orderDateStr = `${year}-${month}-${day}`;
              const orderMonthStr = `${year}-${month}`;
              
              return salesViewMode === 'daily' 
                ? orderDateStr === selectedSalesDate
                : orderMonthStr === selectedSalesMonth;
            });

            const totalRevenue = filteredSales.reduce((sum, o) => sum + (Number(o.total_price) || 0), 0);
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
      )}

      {/* MODAL เพิ่ม/แก้ไขเมนู (คงเดิมทุกอย่าง) */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200] flex justify-end">
          <div className="bg-white w-full max-w-md h-full p-8 overflow-y-auto">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-black">{editingId ? 'แก้ไขเมนู' : 'เพิ่มเมนูใหม่'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="p-2 bg-gray-100 rounded-full"><X size={24}/></button>
            </div>
            <form onSubmit={handleSaveMenu} className="space-y-6 pb-20">
              <div onClick={() => !isSaving && fileInputRef.current?.click()} className="w-full h-40 bg-gray-50 rounded-[2rem] border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden cursor-pointer">
                {formData.image_url ? <img src={formData.image_url} className="w-full h-full object-cover" /> : <ImageIcon size={30} className="text-gray-300" />}
                <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleFileChange} />
              </div>
              <input type="text" placeholder="ชื่อเมนู" required className="w-full bg-gray-50 rounded-[1.5rem] p-5 font-bold outline-none" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} />
              <input type="number" placeholder="ราคา" required className="w-full bg-gray-50 rounded-[1.5rem] p-5 font-bold outline-none" value={formData.price} onChange={(e) => setFormData({...formData, price: e.target.value})} />
              
              <div>
                <label className="text-[10px] font-black uppercase text-gray-400 ml-2 mb-2 block">หมวดหมู่</label>
                <div className="flex gap-2 overflow-x-auto no-scrollbar">
                  {['เมนูข้าว', 'เมนูเส้น', 'กับข้าว'].map(cat => (
                    <button key={cat} type="button" onClick={() => setFormData({...formData, category: cat})} className={`px-5 py-2.5 rounded-full text-[10px] font-black whitespace-nowrap ${formData.category === cat ? 'bg-[#1E293B] text-white' : 'bg-gray-100 text-gray-400'}`}>{cat}</button>
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
      )}

      {/* NAV BAR (คงเดิม) */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-xl border-t p-5 flex justify-around items-center z-50">
        <button onClick={() => setActiveTab('menu')} className={`flex flex-col items-center gap-1 ${activeTab === 'menu' ? 'text-[#1E293B]' : 'text-gray-300'}`}><Utensils size={24} /><span className="text-[9px] font-black">เมนู</span></button>
        <button onClick={() => setActiveTab('order')} className={`flex flex-col items-center gap-1 relative ${activeTab === 'order' ? 'text-[#1E293B]' : 'text-gray-300'}`}><ClipboardList size={24} /><span className="text-[9px] font-black">ออเดอร์</span></button>
        <button onClick={() => setActiveTab('billing')} className={`flex flex-col items-center gap-1 relative ${activeTab === 'billing' ? 'text-red-500' : 'text-gray-300'}`}><Wallet size={24} /><span className="text-[9px] font-black">เช็คบิล</span></button>
        <button onClick={() => setActiveTab('sales')} className={`flex flex-col items-center gap-1 ${activeTab === 'sales' ? 'text-orange-500' : 'text-gray-300'}`}><TrendingUp size={24} /><span className="text-[9px] font-black">ยอดขาย</span></button>
      </nav>
    </div>
  );
}