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
        <div className="min-h-screen bg-[#FFF7ED] flex items-center justify-center p-6 bg-[radial-gradient(circle_at_20%_20%,#FFEDD5_0%,transparent_25%),radial-gradient(circle_at_80%_80%,#FFDBBB_0%,transparent_25%)]">
            <div className="bg-white/80 backdrop-blur-2xl w-full max-w-sm p-10 rounded-[3rem] shadow-[0_32px_64px_-16px_rgba(255,77,0,0.3)] border border-orange-100/50 text-center relative overflow-hidden">
                {/* ตกแต่งพื้นหลังเล็กน้อย */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-orange-50 rounded-full -mr-16 -mt-16 blur-3xl opacity-50"></div>

                <div className="relative mb-10">
                    <div className="w-24 h-24 bg-gradient-to-br from-[#FF4D00] to-[#FF7800] rounded-[2.5rem] flex items-center justify-center mx-auto mb-6 shadow-xl shadow-orange-100/50 transform rotate-6 hover:rotate-0 transition-transform duration-500">
                        <Users size={48} className="text-white drop-shadow-lg" />
                    </div>
                    <h1 className="text-3xl font-black text-[#FF4D00] tracking-tight">Pa Kung Shop</h1>
                    <p className="text-[10px] text-[#FF4D00] font-black uppercase tracking-[0.2em] mt-2 leading-relaxed">
                        Staff Login Portal
                    </p>
                </div>

                <form onSubmit={handleLogin} className="space-y-4 relative">
                    <div className="group">
                        <input
                            type="email"
                            placeholder="Username"
                            className={`w-full bg-white p-5 rounded-[1.8rem] font-bold outline-none border-2 transition-all shadow-sm text-[#411E24] ${error ? 'border-red-400 bg-red-50 text-red-500' : 'border-orange-50 focus:border-[#FFCC80] group-hover:border-orange-100'}`}
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>
                    <div className="group relative">
                        <input
                            type={showPassword ? "text" : "password"}
                            placeholder="Password"
                            className={`w-full bg-white p-5 rounded-[1.8rem] font-bold outline-none border-2 transition-all shadow-sm pr-14 text-[#411E24] ${error ? 'border-red-400 bg-red-50 text-red-500' : 'border-orange-50 focus:border-[#FFCC80] group-hover:border-orange-100'}`}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-6 top-1/2 -translate-y-1/2 text-[#FF4D00] hover:text-orange-400 transition-colors"
                        >
                            {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                        </button>
                    </div>

                    {error && (
                        <div className="bg-red-50 text-red-500 p-4 rounded-2xl flex items-center gap-2 text-[10px] font-bold animate-in fade-in slide-in-from-top-2 duration-300">
                            <X size={14} className="shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={isAuthenticating}
                        className="w-full bg-gradient-to-r from-[#FF7800] to-[#FFCC80] text-white py-5 rounded-[1.8rem] font-black text-lg shadow-lg shadow-orange-100/60 hover:scale-[1.02] active:scale-95 transition-all mt-4 disabled:opacity-50"
                    >
                        {isAuthenticating ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ ✨'}
                    </button>
                </form>

                <p className="text-[9px] text-[#FF4D00] mt-10 font-bold uppercase tracking-widest">© 2026 Management Portal v1.0</p>
            </div>
        </div>
    );
}
