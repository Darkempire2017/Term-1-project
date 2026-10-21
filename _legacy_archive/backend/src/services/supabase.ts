import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config';

export interface UserRecord {
  id: string;
  index_number: string;
  name: string;
  email: string;
  password_hash: string;
  is_verified: boolean;
  verification_code: string | null;
  verification_expires: string | null;
  role: 'STUDENT' | 'ADMIN';
  created_at: string;
  updated_at: string;
}

export interface UmbrellaSlotRecord {
  id: string;
  slot_number: number;
  tag_uid: string;
  umbrella_code: string | null;
  status: 'AVAILABLE' | 'BORROWED' | 'MAINTENANCE';
  is_locked: boolean;
  last_scanned_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface BorrowRecord {
  id: string;
  user_id: string;
  slot_id: string;
  borrowed_at: string;
  returned_at: string | null;
  status: 'ACTIVE' | 'RETURNED' | 'OVERDUE';
  notes?: string;
  created_at: string;
}

// In-memory fallback store when Supabase credentials are not yet configured in .env
class InMemoryStore {
  users: Map<string, UserRecord> = new Map();
  slots: Map<string, UmbrellaSlotRecord> = new Map();
  borrows: Map<string, BorrowRecord> = new Map();

  constructor() {
    // Seed initial umbrella slots
    const initialSlots: UmbrellaSlotRecord[] = [
      { id: 'slot-1', slot_number: 1, tag_uid: '04A1B2C3D4', umbrella_code: 'UMB-01', status: 'AVAILABLE', is_locked: true, last_scanned_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: 'slot-2', slot_number: 2, tag_uid: '04B2C3D4E5', umbrella_code: 'UMB-02', status: 'AVAILABLE', is_locked: true, last_scanned_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: 'slot-3', slot_number: 3, tag_uid: '04C3D4E5F6', umbrella_code: 'UMB-03', status: 'AVAILABLE', is_locked: true, last_scanned_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: 'slot-4', slot_number: 4, tag_uid: '04D4E5F6A7', umbrella_code: 'UMB-04', status: 'AVAILABLE', is_locked: true, last_scanned_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    ];
    for (const slot of initialSlots) {
      this.slots.set(slot.id, slot);
    }
  }
}

export const inMemoryDb = new InMemoryStore();

export const isSupabaseConfigured = Boolean(
  config.supabase.url &&
  config.supabase.serviceRoleKey &&
  !config.supabase.url.includes('your-project-ref')
);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(config.supabase.url, config.supabase.serviceRoleKey)
  : null;

if (isSupabaseConfigured) {
  console.log(' [Database] Connected to Supabase at:', config.supabase.url);
} else {
  console.log('ℹ️ [Database] Supabase URL not set in .env. Running in Mock In-Memory Store Mode (add credentials to .env to connect live Supabase).');
}
