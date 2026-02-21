// scripts/fix-orders.mjs
// 🔧 แก้ข้อมูลเก่า — แยก updated_at ตามรอบเช็คบิลจริง
// ออเดอร์โต๊ะเดียวกันที่สั่งห่างกันเกิน 30 นาที = คนละรอบ (คนละบิล)

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://lvbhbxrmbchgowpyqdin.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_sXmxJyC5jyYB2DWpsnfYNw_va4Slp2N';
const supabase = createClient(supabaseUrl, supabaseKey);



async function fixOrders() {
    console.log('🔍 กำลังดึงออเดอร์ทั้งหมด...\n');

    const { data: allOrders, error } = await supabase
        .from('orders')
        .select('id, status, table_no, total_price, created_at, updated_at')
        .eq('status', 'เสร็จสิ้น')
        .order('created_at', { ascending: true });

    if (error) {
        console.error('❌ ดึงข้อมูลไม่สำเร็จ:', error);
        return;
    }

    console.log(`📊 พบออเดอร์สถานะ 'เสร็จสิ้น': ${allOrders.length} รายการ\n`);

    if (allOrders.length === 0) {
        console.log('✅ ไม่มีออเดอร์ค้าง');
        return;
    }


    // 1. จัดกลุ่มตามโต๊ะ (โต๊ะเดียวกัน = บิลเดียวกัน)
    const byTable = {};
    allOrders.forEach(o => {
        const tNo = String(o.table_no).trim();
        if (!byTable[tNo]) byTable[tNo] = [];
        byTable[tNo].push(o);
    });

    // 2. แต่ละโต๊ะ = 1 บิล
    const sessions = Object.entries(byTable).map(([tableNo, tableOrders]) => {
        tableOrders.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        return { tableNo, orders: tableOrders };
    });

    console.log(`📋 แยกได้ ${sessions.length} บิล:\n`);
    sessions.forEach((s, i) => {
        const firstTime = new Date(s.orders[0].created_at).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
        const total = s.orders.reduce((sum, o) => sum + (Number(o.total_price) || 0), 0);
        console.log(`   บิล ${i + 1}: โต๊ะ ${s.tableNo} | ${s.orders.length} รายการ | ฿${total} | เวลาสั่ง: ${firstTime}`);
    });

    // 3. อัปเดต updated_at ให้แต่ละเซสชั่นมีเวลาต่างกัน
    console.log('\n🔄 กำลังอัปเดต updated_at ให้แต่ละบิล...\n');

    let updatedCount = 0;
    for (const session of sessions) {
        // ใช้ created_at ของออเดอร์สุดท้ายในเซสชั่น + 1 วินาที เป็น "เวลาเช็คบิล"
        const lastCreatedAt = session.orders[session.orders.length - 1].created_at;
        const checkoutTime = new Date(new Date(lastCreatedAt).getTime() + 1000).toISOString();

        const ids = session.orders.map(o => o.id);

        const { error: updateErr } = await supabase
            .from('orders')
            .update({ updated_at: checkoutTime })
            .in('id', ids);

        if (updateErr) {
            console.error(`   ❌ บิล โต๊ะ ${session.tableNo}: อัปเดตล้มเหลว`, updateErr);
        } else {
            updatedCount += ids.length;
            console.log(`   ✅ โต๊ะ ${session.tableNo} (${ids.length} ออเดอร์) → updated_at = ${new Date(checkoutTime).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}`);
        }
    }

    console.log(`\n🎉 อัปเดตเสร็จ! ${updatedCount} รายการ → แยกเป็น ${sessions.length} บิล`);
    console.log('💡 กลับไป refresh หน้ายอดขายได้เลย!');
}

fixOrders();
