import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://lvbhbxrmbchgowpyqdin.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_sXmxJyC5jyYB2DWpsnfYNw_va4Slp2N';
const supabase = createClient(supabaseUrl, supabaseKey);

const SESSION_GAP_MS = 30 * 60 * 1000; // 30 นาที — ห่างเกินนี้ = คนละรอบเช็คบิล

export async function GET() {
    try {
        // 1. ดึงออเดอร์ที่เสร็จสิ้นทั้งหมด
        const { data: allOrders, error } = await supabase
            .from('orders')
            .select('id, status, table_no, total_price, created_at, updated_at')
            .eq('status', 'เสร็จสิ้น')
            .order('created_at', { ascending: true });

        if (error) return NextResponse.json({ error: 'ดึงข้อมูลไม่สำเร็จ', detail: error }, { status: 500 });
        if (!allOrders || allOrders.length === 0) return NextResponse.json({ message: 'ไม่มีออเดอร์ค้าง' });

        // 2. จัดกลุ่มตามโต๊ะ
        const byTable: Record<string, any[]> = {};
        allOrders.forEach(o => {
            const tNo = String(o.table_no).trim();
            if (!byTable[tNo]) byTable[tNo] = [];
            byTable[tNo].push(o);
        });

        // 3. แยกเซสชั่นภายในแต่ละโต๊ะ
        const sessions: any[] = [];
        for (const [tableNo, tableOrders] of Object.entries(byTable)) {
            (tableOrders as any[]).sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

            let currentSession = [tableOrders[0]];
            for (let i = 1; i < tableOrders.length; i++) {
                const prevTime = new Date(currentSession[currentSession.length - 1].created_at).getTime();
                const currTime = new Date(tableOrders[i].created_at).getTime();

                if (currTime - prevTime > SESSION_GAP_MS) {
                    sessions.push({ tableNo, orders: currentSession });
                    currentSession = [tableOrders[i]];
                } else {
                    currentSession.push(tableOrders[i]);
                }
            }
            sessions.push({ tableNo, orders: currentSession });
        }

        // 4. อัปเดต updated_at ให้แต่ละเซสชั่นมีเวลาต่างกัน
        const results: any[] = [];
        for (const session of sessions) {
            const lastCreatedAt = session.orders[session.orders.length - 1].created_at;
            const checkoutTime = new Date(new Date(lastCreatedAt).getTime() + 1000).toISOString();
            const ids = session.orders.map((o: any) => o.id);
            const total = session.orders.reduce((sum: number, o: any) => sum + (Number(o.total_price) || 0), 0);

            const { error: updateErr } = await supabase
                .from('orders')
                .update({ updated_at: checkoutTime })
                .in('id', ids);

            results.push({
                tableNo: session.tableNo,
                orderCount: ids.length,
                total: total,
                checkoutTime,
                success: !updateErr,
            });
        }

        return NextResponse.json({
            message: `แก้ไขเสร็จ! แยกได้ ${sessions.length} บิล`,
            totalOrders: allOrders.length,
            bills: results,
        });
    } catch (e) {
        return NextResponse.json({ error: String(e) }, { status: 500 });
    }
}
