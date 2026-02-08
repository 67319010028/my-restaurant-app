"use client";
import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, X, Lock, Users } from 'lucide-react';

export default function StaffLoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isAuthenticating, setIsAuthenticating] = useState(false);

    useEffect(() => {
        // ตรวจสอบ session หากเข้าสู่ระบบไว้แล้วให้ redirect ไปหน้าที่ถูกต้อง
        const checkSession = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user?.id) { // Changed from email to id
                handleRedirection(session.user.id);
            }
        };
        checkSession();
    }, []);

    const handleRedirection = async (userId: string) => {
        try {
            const { data: profile, error: profileError } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', userId)
                .single();

            if (profileError || !profile) {
                setError('ไม่พบข้อมูลพนักงานในระบบ กรุณาติดต่อแอดมิน');
                await supabase.auth.signOut();
                return;
            }

            const userRole = profile.role?.toLowerCase();
            if (userRole === 'admin') {
                router.push('/admin');
            } else if (userRole === 'kitchen' || userRole === 'ห้องครัว') {
                router.push('/kitchen');
            } else {
                setError('คุณไม่มีสิทธิ์เข้าถึงระบบนี้');
                await supabase.auth.signOut();
            }
        } catch (err) {
            setError('เกิดข้อผิดพลาดในการตรวจสอบสิทธิ์');
            await supabase.auth.signOut();
        }
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsAuthenticating(true);
        setError(null);

        try {
            const { data, error: loginError } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (loginError) {
                setError('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
            } else if (data?.user?.id) {
                handleRedirection(data.user.id);
            }
        } catch (err) {
            setError('เกิดข้อผิดพลาดในการเชื่อมต่อ');
        } finally {
            setIsAuthenticating(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
            <div className="bg-white w-full max-w-sm p-8 rounded-2xl shadow-sm border border-slate-200 text-center relative">
                <div className="mb-8">
                    <div className="w-20 h-20 bg-[#FF4D00]/5 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-[#FF4D00]/10">
                        <Users size={40} className="text-[#FF4D00]" />
                    </div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Pa Kung Shop</h1>
                    <p className="text-xs text-slate-500 font-medium mt-1 uppercase tracking-wider">
                        ระบบจัดการร้าน
                    </p>
                </div>

                <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                        <input
                            type="email"
                            placeholder="อีเมล"
                            className="w-full bg-white px-4 py-3 rounded-xl font-medium outline-none border border-slate-200 focus:border-[#FF4D00] focus:ring-2 focus:ring-[#FF4D00]/10 transition-all text-slate-900"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>
                    <div className="relative">
                        <input
                            type={showPassword ? "text" : "password"}
                            placeholder="รหัสผ่าน"
                            className="w-full bg-white px-4 py-3 rounded-xl font-medium outline-none border border-slate-200 focus:border-[#FF4D00] focus:ring-2 focus:ring-[#FF4D00]/10 transition-all pr-12 text-slate-900"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                        >
                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                    </div>

                    {error && (
                        <div className="bg-red-50 text-red-600 p-3 rounded-xl flex items-center gap-2 text-xs font-semibold">
                            <X size={14} className="shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={isAuthenticating}
                        className="w-full bg-[#FF4D00] text-white py-3.5 rounded-xl font-bold text-base shadow-sm hover:bg-[#E64500] active:scale-[0.98] transition-all mt-2 disabled:opacity-50"
                    >
                        {isAuthenticating ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
                    </button>
                </form>

                <p className="text-[10px] text-slate-400 mt-8 font-medium uppercase tracking-widest">© 2026 Management System</p>
            </div>
        </div>
    );
}
