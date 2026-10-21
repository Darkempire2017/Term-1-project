export interface User {
  id: string;
  indexNumber: string;
  name: string;
  email: string;
  role: 'STUDENT' | 'ADMIN';
}

export interface UmbrellaSlot {
  id: string;
  slot_number: number;
  tag_uid: string;
  umbrella_code: string | null;
  status: 'AVAILABLE' | 'BORROWED' | 'MAINTENANCE';
  is_locked: boolean;
  last_scanned_at: string | null;
}

export interface BorrowRecord {
  id: string;
  user_id: string;
  slot_id: string;
  borrowed_at: string;
  returned_at: string | null;
  status: 'ACTIVE' | 'RETURNED' | 'OVERDUE';
  umbrella_slots?: UmbrellaSlot;
}

export interface StationStatus {
  mqttConnected: boolean;
  broker: string;
  station: {
    isOnline: boolean;
    lastHeartbeat: string | null;
    stationId: string;
  };
}
