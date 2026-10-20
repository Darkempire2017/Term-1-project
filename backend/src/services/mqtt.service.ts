import mqtt, { MqttClient } from 'mqtt';
import { config } from '../config';
import { supabase, isSupabaseConfigured, inMemoryDb, UmbrellaSlotRecord } from './supabase';
import { emailService } from './email.service';

export interface ScanPayload {
  tagUid: string;
  slotNumber?: number;
  stationId?: string;
  timestamp?: number;
}

export interface FeedbackPayload {
  slotNumber: number;
  event: 'LOCK_RELEASED' | 'LOCK_ENGAGED' | 'UMBRELLA_REMOVED' | 'UMBRELLA_RETURNED';
  stationId?: string;
}

class MqttService {
  private client: MqttClient | null = null;
  private isConnected = false;
  private stationStatus: { isOnline: boolean; lastHeartbeat: Date | null; stationId: string } = {
    isOnline: false,
    lastHeartbeat: null,
    stationId: 'esp32-station-01',
  };

  constructor() {
    this.connect();
  }

  public connect() {
    console.log(`🔌 [HiveMQ MQTT] Connecting to broker: ${config.mqtt.brokerUrl}...`);

    const options: mqtt.IClientOptions = {
      clientId: config.mqtt.clientId,
      clean: true,
      connectTimeout: 5000,
      reconnectPeriod: 3000,
    };

    if (config.mqtt.username) {
      options.username = config.mqtt.username;
      options.password = config.mqtt.password;
    }

    try {
      this.client = mqtt.connect(config.mqtt.brokerUrl, options);

      this.client.on('connect', () => {
        this.isConnected = true;
        console.log(` [HiveMQ MQTT] Connected successfully to ${config.mqtt.brokerUrl}`);

        // Subscribe to relevant ESP32 topics
        const topics = [
          config.mqtt.topics.scan,
          config.mqtt.topics.status,
          config.mqtt.topics.feedback,
        ];

        this.client?.subscribe(topics, (err) => {
          if (err) {
            console.error('❌ [HiveMQ MQTT] Subscription error:', err);
          } else {
            console.log(` [HiveMQ MQTT] Subscribed to topics:`, topics);
          }
        });
      });

      this.client.on('message', async (topic, message) => {
        try {
          const payloadStr = message.toString();
          const data = JSON.parse(payloadStr);

          if (topic === config.mqtt.topics.scan) {
            await this.handleNfcScan(data as ScanPayload);
          } else if (topic === config.mqtt.topics.status) {
            this.handleStationStatus(data);
          } else if (topic === config.mqtt.topics.feedback) {
            this.handleLockFeedback(data as FeedbackPayload);
          }
        } catch (error) {
          console.error(`❌ [HiveMQ MQTT] Error parsing message on topic "${topic}":`, error);
        }
      });

      this.client.on('error', (err) => {
        console.error('❌ [HiveMQ MQTT] Connection error:', err.message);
      });

      this.client.on('offline', () => {
        this.isConnected = false;
        console.warn('⚠️ [HiveMQ MQTT] Client is offline.');
      });
    } catch (err) {
      console.error('❌ [HiveMQ MQTT] Failed to initialize MQTT client:', err);
    }
  }

  /**
   * Handle NFC tag scan event published by ESP32
   */
  private async handleNfcScan(payload: ScanPayload) {
    const { tagUid, slotNumber } = payload;
    console.log(`\n🏷️ [NFC SCAN DETECTED] Tag UID: "${tagUid}", Reported Slot: ${slotNumber || 'auto-detect'}`);

    // 1. Locate the slot matching this tag UID or slotNumber
    let matchedSlot: UmbrellaSlotRecord | null = null;

    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('umbrella_slots')
        .select('*')
        .or(`tag_uid.eq.${tagUid},slot_number.eq.${slotNumber || 0}`)
        .maybeSingle();

      if (!error && data) {
        matchedSlot = data as UmbrellaSlotRecord;
      }
    } else {
      for (const slot of inMemoryDb.slots.values()) {
        if (slot.tag_uid === tagUid || (slotNumber && slot.slot_number === slotNumber)) {
          matchedSlot = slot;
          break;
        }
      }
    }

    if (!matchedSlot) {
      console.warn(`⚠️ [NFC SCAN] No umbrella slot found matching Tag UID "${tagUid}".`);
      return;
    }

    console.log(`🎯 [NFC SCAN] Matched Slot #${matchedSlot.slot_number} (Code: ${matchedSlot.umbrella_code}, Status: ${matchedSlot.status})`);

    // 2. Process Borrow vs Return
    if (matchedSlot.status === 'AVAILABLE') {
      // Slot is available -> Release lock so umbrella can be taken
      console.log(`🔓 [Action] Umbrella is AVAILABLE. Triggering unlock on Slot #${matchedSlot.slot_number}...`);
      this.publishUnlock(matchedSlot.slot_number, 5000);

      // Update slot state to BORROWED
      await this.updateSlotState(matchedSlot.id, {
        status: 'BORROWED',
        is_locked: false,
        last_scanned_at: new Date().toISOString(),
      });
    } else if (matchedSlot.status === 'BORROWED') {
      // Umbrella is returning! Unlock briefly to accept umbrella, then lock
      console.log(`↩️ [Action] Umbrella RETURN detected for Slot #${matchedSlot.slot_number}. Triggering unlock to accept umbrella...`);
      this.publishUnlock(matchedSlot.slot_number, 5000);

      // Update slot state to AVAILABLE
      await this.updateSlotState(matchedSlot.id, {
        status: 'AVAILABLE',
        is_locked: true,
        last_scanned_at: new Date().toISOString(),
      });
    }
  }

  /**
   * Publish unlock command to ESP32 over HiveMQ
   */
  public publishUnlock(slotNumber: number, durationMs = 5000): boolean {
    if (!this.client || !this.isConnected) {
      console.warn('⚠️ [HiveMQ MQTT] Cannot publish unlock: MQTT client is disconnected.');
      return false;
    }

    const command = {
      slotNumber,
      action: 'UNLOCK',
      durationMs,
      timestamp: Date.now(),
    };

    this.client.publish(config.mqtt.topics.unlock, JSON.stringify(command), { qos: 1 }, (err) => {
      if (err) {
        console.error(`❌ [HiveMQ MQTT] Failed to publish unlock command to Slot #${slotNumber}:`, err);
      } else {
        console.log(`📤 [HiveMQ MQTT] Published UNLOCK command to "${config.mqtt.topics.unlock}" for Slot #${slotNumber}`);
      }
    });

    return true;
  }

  private handleStationStatus(payload: any) {
    this.stationStatus = {
      isOnline: true,
      lastHeartbeat: new Date(),
      stationId: payload.stationId || 'esp32-station-01',
    };
    console.log(`💓 [Heartbeat] Received heartbeat from station: ${this.stationStatus.stationId}`);
  }

  private handleLockFeedback(payload: FeedbackPayload) {
    console.log(`📥 [ESP32 Feedback] Slot #${payload.slotNumber} -> Event: ${payload.event}`);
  }

  public getStatus() {
    return {
      mqttConnected: this.isConnected,
      broker: config.mqtt.brokerUrl,
      station: this.stationStatus,
    };
  }

  private async updateSlotState(slotId: string, updates: Partial<UmbrellaSlotRecord>) {
    if (isSupabaseConfigured && supabase) {
      await supabase.from('umbrella_slots').update(updates).eq('id', slotId);
    } else {
      const existing = inMemoryDb.slots.get(slotId);
      if (existing) {
        inMemoryDb.slots.set(slotId, { ...existing, ...updates, updated_at: new Date().toISOString() });
      }
    }
  }
}

export const mqttService = new MqttService();
