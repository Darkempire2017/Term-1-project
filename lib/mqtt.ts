import mqtt from 'mqtt';

// =====================================================================
// Version 1 (V1) Official 2x2 MQTT Topics
// =====================================================================
// 1. Commands (Web App Publishes ➔ ESP32 Subscribes)
export const MQTT_TOPIC_COMMAND_BORROW = 'astrix/uom/kiosk-01/command/borrow';
export const MQTT_TOPIC_COMMAND_RETURN = 'astrix/uom/kiosk-01/command/return';

// 2. Events / Confirmations (ESP32 Publishes ➔ Web Worker Subscribes)
export const MQTT_TOPIC_EVENT_BORROWED = 'astrix/uom/kiosk-01/event/borrowed';
export const MQTT_TOPIC_EVENT_RETURNED = 'astrix/uom/kiosk-01/event/returned';

// 3. Station Online Heartbeat
export const MQTT_TOPIC_STATUS = 'astrix/uom/kiosk-01/status';

// Backwards compatibility aliases
export const MQTT_TOPIC_UNLOCK = MQTT_TOPIC_COMMAND_BORROW;
export const MQTT_TOPIC_REMOVED = MQTT_TOPIC_EVENT_BORROWED;

export interface KioskCommandPayload {
  action: 'BORROW' | 'RETURN';
  slot: number;
  duration_ms: number;
  index_no: string;
}

export interface UnlockPayload {
  action: 'BORROW_UNLOCK' | 'RETURN_UNLOCK' | 'BORROW' | 'RETURN';
  slot: number;
  duration_ms: number;
  index_no: string;
}

/**
 * Universal MQTT Publisher to HiveMQ Cloud / Public Broker
 */
async function sendMqttMessage(
  topic: string,
  payload: any
): Promise<{ success: boolean; simulated?: boolean; error?: string }> {
  const brokerUrl = process.env.HIVEMQ_BROKER_URL || 'mqtt://broker.hivemq.com:1883';
  const username = process.env.HIVEMQ_USERNAME;
  const password = process.env.HIVEMQ_PASSWORD;

  const payloadString = JSON.stringify(payload);

  console.log(`\n======================================================`);
  console.log(`📡 [MQTT PUBLISH] Topic: ${topic}`);
  console.log(`📦 Payload: ${payloadString}`);
  console.log(`======================================================\n`);

  // If broker URL is placeholder or not configured, simulate
  if (!brokerUrl || brokerUrl.includes('your-cluster-id')) {
    console.log('ℹ️ [HiveMQ] Local simulation mode active. Command logged successfully.');
    return { success: true, simulated: true };
  }

  return new Promise((resolve) => {
    let client: mqtt.MqttClient | null = null;
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        console.warn('⚠️ [HiveMQ] MQTT publish timed out after 3000ms. Continuing in simulation mode.');
        try {
          client?.end(true);
        } catch {}
        resolve({ success: true, simulated: true });
      }
    }, 3000);

    try {
      const options: mqtt.IClientOptions = {
        clientId: `astrix-web-${Math.random().toString(16).substring(2, 8)}`,
        connectTimeout: 2500,
      };

      if (username) options.username = username;
      if (password) options.password = password;

      client = mqtt.connect(brokerUrl, options);

      client.on('connect', () => {
        client?.publish(topic, payloadString, { qos: 1 }, (err) => {
          clearTimeout(timeout);
          if (!resolved) {
            resolved = true;
            if (err) {
              console.warn('⚠️ [HiveMQ] Publish error:', err.message);
              resolve({ success: false, error: err.message });
            } else {
              console.log('✅ [HiveMQ] Command delivered to broker successfully.');
              resolve({ success: true, simulated: false });
            }
            client?.end();
          }
        });
      });

      client.on('error', (err) => {
        clearTimeout(timeout);
        if (!resolved) {
          resolved = true;
          console.warn('⚠️ [HiveMQ] Connection error:', err.message);
          resolve({ success: true, simulated: true, error: err.message });
          client?.end(true);
        }
      });
    } catch (e: any) {
      clearTimeout(timeout);
      if (!resolved) {
        resolved = true;
        console.warn('⚠️ [HiveMQ] Exception:', e.message);
        resolve({ success: true, simulated: true, error: e.message });
      }
    }
  });
}

/**
 * Publish Borrow Unlock Command to ESP32 (V1: astrix/uom/kiosk-01/command/borrow)
 * Default Duration: 10,000ms (10 seconds)
 */
export async function publishBorrowCommand(
  slot: number,
  indexNo: string,
  durationMs: number = 10000
) {
  const payload: KioskCommandPayload = {
    action: 'BORROW',
    slot,
    duration_ms: durationMs,
    index_no: indexNo,
  };
  return sendMqttMessage(MQTT_TOPIC_COMMAND_BORROW, payload);
}

/**
 * Publish Return Unlock Command to ESP32 (V1: astrix/uom/kiosk-01/command/return)
 * Default Duration: 10,000ms (10 seconds)
 */
export async function publishReturnCommand(
  slot: number,
  indexNo: string,
  durationMs: number = 10000
) {
  const payload: KioskCommandPayload = {
    action: 'RETURN',
    slot,
    duration_ms: durationMs,
    index_no: indexNo,
  };
  return sendMqttMessage(MQTT_TOPIC_COMMAND_RETURN, payload);
}

/**
 * Universal unlock command (backward compatibility)
 */
export async function publishUnlockCommand(
  action: 'BORROW_UNLOCK' | 'RETURN_UNLOCK' | 'BORROW' | 'RETURN',
  slot: number,
  indexNo: string,
  durationMs: number = 10000
) {
  if (action === 'RETURN_UNLOCK' || action === 'RETURN') {
    return publishReturnCommand(slot, indexNo, durationMs);
  }
  return publishBorrowCommand(slot, indexNo, durationMs);
}
