import { Request, Response } from 'express';
import crypto from 'crypto';
import { supabase, isSupabaseConfigured, inMemoryDb, UmbrellaSlotRecord, BorrowRecord } from '../services/supabase';
import { mqttService } from '../services/mqtt.service';
import { emailService } from '../services/email.service';
import { AuthRequest } from '../middleware/auth.middleware';

/**
 * Get all umbrella slots with their live statuses
 */
export const getSlots = async (req: Request, res: Response): Promise<void> => {
  try {
    let slots: UmbrellaSlotRecord[] = [];

    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('umbrella_slots')
        .select('*')
        .order('slot_number', { ascending: true });

      if (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch umbrella slots' });
        return;
      }
      slots = data as UmbrellaSlotRecord[];
    } else {
      slots = Array.from(inMemoryDb.slots.values()).sort((a, b) => a.slot_number - b.slot_number);
    }

    const availableCount = slots.filter((s) => s.status === 'AVAILABLE').length;
    const borrowedCount = slots.filter((s) => s.status === 'BORROWED').length;

    res.json({
      success: true,
      slots,
      meta: {
        total: slots.length,
        available: availableCount,
        borrowed: borrowedCount,
      },
      station: mqttService.getStatus(),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error retrieving slots' });
  }
};

/**
 * Get active borrow for logged-in student
 */
export const getMyActiveBorrow = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    let activeBorrow: any = null;

    if (isSupabaseConfigured && supabase) {
      const { data } = await supabase
        .from('borrow_records')
        .select('*, umbrella_slots(*)')
        .eq('user_id', req.user.id)
        .eq('status', 'ACTIVE')
        .maybeSingle();

      activeBorrow = data;
    } else {
      for (const record of inMemoryDb.borrows.values()) {
        if (record.user_id === req.user.id && record.status === 'ACTIVE') {
          const slot = inMemoryDb.slots.get(record.slot_id);
          activeBorrow = { ...record, umbrella_slots: slot };
          break;
        }
      }
    }

    res.json({
      success: true,
      hasActiveBorrow: Boolean(activeBorrow),
      borrow: activeBorrow,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Error retrieving active borrow' });
  }
};

/**
 * Trigger Borrow for an available slot (unlocks via HiveMQ)
 */
export const borrowUmbrella = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { slotNumber } = req.body;
    if (!slotNumber) {
      res.status(400).json({ success: false, message: 'slotNumber is required' });
      return;
    }

    // 1. Check if user already has an active borrow
    let existingActiveBorrow = false;
    if (isSupabaseConfigured && supabase) {
      const { data } = await supabase
        .from('borrow_records')
        .select('id')
        .eq('user_id', req.user.id)
        .eq('status', 'ACTIVE')
        .maybeSingle();
      if (data) existingActiveBorrow = true;
    } else {
      for (const record of inMemoryDb.borrows.values()) {
        if (record.user_id === req.user.id && record.status === 'ACTIVE') {
          existingActiveBorrow = true;
          break;
        }
      }
    }

    if (existingActiveBorrow) {
      res.status(400).json({
        success: false,
        message: 'You already have an active borrowed umbrella. Please return it before borrowing another.',
      });
      return;
    }

    // 2. Find the requested slot
    let slot: UmbrellaSlotRecord | null = null;
    if (isSupabaseConfigured && supabase) {
      const { data } = await supabase
        .from('umbrella_slots')
        .select('*')
        .eq('slot_number', slotNumber)
        .maybeSingle();
      if (data) slot = data as UmbrellaSlotRecord;
    } else {
      for (const s of inMemoryDb.slots.values()) {
        if (s.slot_number === slotNumber) {
          slot = s;
          break;
        }
      }
    }

    if (!slot) {
      res.status(404).json({ success: false, message: `Umbrella Slot #${slotNumber} not found` });
      return;
    }

    if (slot.status !== 'AVAILABLE') {
      res.status(400).json({ success: false, message: `Slot #${slotNumber} is not available for borrowing` });
      return;
    }

    // 3. Command ESP32 via HiveMQ to release lock
    const published = mqttService.publishUnlock(slot.slot_number, 5000);

    // 4. Update slot state and record borrow
    const borrowRecord: BorrowRecord = {
      id: crypto.randomUUID(),
      user_id: req.user.id,
      slot_id: slot.id,
      borrowed_at: new Date().toISOString(),
      returned_at: null,
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
    };

    if (isSupabaseConfigured && supabase) {
      await supabase.from('umbrella_slots').update({
        status: 'BORROWED',
        is_locked: false,
        last_scanned_at: new Date().toISOString(),
      }).eq('id', slot.id);

      await supabase.from('borrow_records').insert({
        id: borrowRecord.id,
        user_id: borrowRecord.user_id,
        slot_id: borrowRecord.slot_id,
        borrowed_at: borrowRecord.borrowed_at,
        status: 'ACTIVE',
      });
    } else {
      slot.status = 'BORROWED';
      slot.is_locked = false;
      slot.last_scanned_at = new Date().toISOString();
      inMemoryDb.slots.set(slot.id, slot);
      inMemoryDb.borrows.set(borrowRecord.id, borrowRecord);
    }

    // Send confirmation email receipt
    await emailService.sendBorrowReceipt(
      req.user.email,
      req.user.name,
      slot.slot_number,
      slot.umbrella_code || `UMB-0${slot.slot_number}`
    );

    res.json({
      success: true,
      message: `Lock for Slot #${slotNumber} released! Please retrieve your umbrella.`,
      mqttDispatched: published,
      slot: {
        slotNumber: slot.slot_number,
        umbrellaCode: slot.umbrella_code,
      },
    });
  } catch (err) {
    console.error('❌ Borrow error:', err);
    res.status(500).json({ success: false, message: 'Server error processing borrow request' });
  }
};

/**
 * Return an umbrella to a slot
 */
export const returnUmbrella = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { slotNumber } = req.body;
    if (!slotNumber) {
      res.status(400).json({ success: false, message: 'slotNumber is required' });
      return;
    }

    // 1. Find user's active borrow record
    let activeBorrow: any = null;
    if (isSupabaseConfigured && supabase) {
      const { data } = await supabase
        .from('borrow_records')
        .select('*')
        .eq('user_id', req.user.id)
        .eq('status', 'ACTIVE')
        .maybeSingle();
      activeBorrow = data;
    } else {
      for (const record of inMemoryDb.borrows.values()) {
        if (record.user_id === req.user.id && record.status === 'ACTIVE') {
          activeBorrow = record;
          break;
        }
      }
    }

    if (!activeBorrow) {
      res.status(400).json({ success: false, message: 'You do not have any active umbrella to return.' });
      return;
    }

    // 2. Unlock slot via HiveMQ to place umbrella back
    mqttService.publishUnlock(slotNumber, 5000);

    const returnedAt = new Date().toISOString();

    // 3. Mark return in database
    if (isSupabaseConfigured && supabase) {
      await supabase
        .from('borrow_records')
        .update({ status: 'RETURNED', returned_at: returnedAt })
        .eq('id', activeBorrow.id);

      await supabase
        .from('umbrella_slots')
        .update({ status: 'AVAILABLE', is_locked: true, last_scanned_at: returnedAt })
        .eq('slot_number', slotNumber);
    } else {
      activeBorrow.status = 'RETURNED';
      activeBorrow.returned_at = returnedAt;
      inMemoryDb.borrows.set(activeBorrow.id, activeBorrow);

      for (const s of inMemoryDb.slots.values()) {
        if (s.slot_number === slotNumber) {
          s.status = 'AVAILABLE';
          s.is_locked = true;
          s.last_scanned_at = returnedAt;
          inMemoryDb.slots.set(s.id, s);
          break;
        }
      }
    }

    res.json({
      success: true,
      message: `Umbrella returned successfully to Slot #${slotNumber}. Thank you!`,
    });
  } catch (err) {
    console.error('❌ Return error:', err);
    res.status(500).json({ success: false, message: 'Server error processing return' });
  }
};

/**
 * Manual Admin Unlock via HiveMQ
 */
export const adminUnlockSlot = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { slotNumber, durationMs } = req.body;
    if (!slotNumber) {
      res.status(400).json({ success: false, message: 'slotNumber is required' });
      return;
    }

    const duration = durationMs || 5000;
    const sent = mqttService.publishUnlock(Number(slotNumber), duration);

    res.json({
      success: true,
      message: `Admin command dispatched: Slot #${slotNumber} unlocked for ${duration / 1000}s via HiveMQ.`,
      mqttSent: sent,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to dispatch unlock' });
  }
};
