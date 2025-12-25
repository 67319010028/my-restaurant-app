// lib/supabase.js
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://lvbhbxrmbchgowpyqdin.supabase.co' 
const supabaseKey = 'sb_publishable_sXmxJyC5jyYB2DWpsnfYNw_va4Slp2N'

export const supabase = createClient(supabaseUrl, supabaseKey)