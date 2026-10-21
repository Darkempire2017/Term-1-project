// ==============================================================================
// PROJECT ASTRIX - DATA CONTRACTS & TYPES
// University of Moratuwa
// ==============================================================================

export interface User {
  index_no: string;
  username: string;
  address?: string | null;
  email: string;
  password?: string;
  verification_code?: string | null;
  verification_expires?: string | null;
  is_verified: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Umbrella {
  slot: number; // 1, 2, 3, 4
  umbrella_id: string; // e.g. "04A1B2C3D4"
  availability: boolean;
  borrowed_user: string | null; // references users.index_no
  updated_at?: string;
}

export interface BorrowRecord {
  record_id: string; // UUID
  umbrella_id: string;
  index_no: string;
  borrowed_time: string;
  due_time: string;
  returned_time: string | null;
  status: 'ACTIVE' | 'RETURNED' | 'OVERDUE';
  created_at?: string;
}

// MQTT Unlock Command sent to hardware
export interface KioskUnlockCommand {
  action: 'BORROW_UNLOCK' | 'RETURN_UNLOCK';
  slot: number;
  duration_ms: number;
  index_no: string;
}

// Hardware Removal Event
export interface UmbrellaRemovedEvent {
  event: 'UMBRELLA_REMOVED';
  slot: number;
  umbrella_id: string;
  index_no: string;
}

// Hardware Returned Event
export interface UmbrellaReturnedEvent {
  event: 'UMBRELLA_RETURNED';
  slot: number;
  umbrella_id: string;
  microswitch: boolean;
  nfc_verified: boolean;
}

// Hardware Status Heartbeat
export interface KioskStatusEvent {
  station_id: string;
  online: boolean;
  timestamp: number;
}
