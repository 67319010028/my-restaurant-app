import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// GET /api/admin/cleanup-billing
// ล้างออเดอร์ 'เรียกเช็คบิล' ที่ค้างนานกว่า 30 นาที
export async function GET() {
    try {
        // หาออเดอร์ที่ค้างเรียกเช็คบิลนานกว่า 30 นาที
        const cutoffTime = new Date(Date.now() - 30 * 60 * 1000).toISOString();

        const { data: staleOrders, error: fetchError } = await supabase
            .from('orders')
            .select('id, table_no, updated_at')
            .eq('status', 'เรียกเช็คบิล')
            .lt('updated_at', cutoffTime);

        if (fetchError) {
            return NextResponse.json({ error: fetchError.message }, { status: 500 });
        }

        if (!staleOrders || staleOrders.length === 0) {
            return NextResponse.json({ message: 'ไม่มีบิลค้างที่ต้องล้าง', cleared: 0 });
        }

        const staleIds = staleOrders.map(o => o.id);

        // อัปเดตเป็น 'เสิร์ฟแล้ว' เพื่อเอาออกจาก billing view
        const { error: updateError } = await supabase
            .from('orders')
            .update({ status: 'เสร็จสิ้น' })
            .in('id', staleIds);

        if (updateError) {
            return NextResponse.json({ error: updateError.message }, { status: 500 });
        }

        // Reset tables ที่เกี่ยวข้องให้เป็น available ถ้าไม่มีออเดอร์ที่ active อีกแล้ว
        const affectedTables = [...new Set(staleOrders.map(o => o.table_no))];
        for (const tableNo of affectedTables) {
            // ตรวจสอบว่าโต๊ะนี้ยังมีออเดอร์ active อยู่หรือไม่
            const { data: activeForTable } = await supabase
                .from('orders')
                .select('id')
                .eq('table_no', tableNo)
                .not('status', 'in', '("เสร็จสิ้น","ยกเลิก","ออร์เดอร์ยกเลิก")')
                .limit(1);

            if (!activeForTable || activeForTable.length === 0) {
                await supabase.from('tables').update({ status: 'available' }).eq('table_number', tableNo);
            }
        }

        return NextResponse.json({
            message: `✅ ล้างบิลค้างสำเร็จ`,
            cleared: staleIds.length,
            affectedTables,
            clearedIds: staleIds
        });

    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

// POST /api/admin/cleanup-billing?mode=all — ล้างทั้งหมด (ไม่สนเวลา)
export async function POST(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const mode = searchParams.get('mode');

        let query = supabase.from('orders').update({ status: 'เสร็จสิ้น' }).eq('status', 'เรียกเช็คบิล');

        if (mode !== 'all') {
            const cutoffTime = new Date(Date.now() - 30 * 60 * 1000).toISOString();
            query = supabase
                .from('orders')
                .update({ status: 'เสร็จสิ้น' })
                .eq('status', 'เรียกเช็คบิล')
                .lt('updated_at', cutoffTime);
        }

        const { error } = await query;

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ message: '✅ ล้างบิลค้างทั้งหมดสำเร็จ' });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
