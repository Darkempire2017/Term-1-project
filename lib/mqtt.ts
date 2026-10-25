import mqtt from 'mqtt';

// =====================================================================
// Astrix Umbrella Kiosk — Official Hardware MQTT Topics
// =====================================================================
// 1. Server ➔ ESP32 Command Topic
export const MQTT_TOPIC_COMMAND = 'astrix-umbrella/cabinet/command';

// 2. ESP32 ➔ Server Response Topic
export const MQTT_TOPIC_RESPONSE = 'astrix-umbrella/cabinet/response';

// Backwards compatibility aliases
export const MQTT_TOPIC_COMMAND_BORROW = MQTT_TOPIC_COMMAND;
export const MQTT_TOPIC_COMMAND_RETURN = MQTT_TOPIC_COMMAND;
export const MQTT_TOPIC_EVENT_BORROWED = MQTT_TOPIC_RESPONSE;
export const MQTT_TOPIC_EVENT_RETURNED = MQTT_TOPIC_RESPONSE;
export const MQTT_TOPIC_UNLOCK = MQTT_TOPIC_COMMAND;
export const MQTT_TOPIC_REMOVED = MQTT_TOPIC_RESPONSE;
export const MQTT_TOPIC_STATUS = 'astrix-umbrella/cabinet/status';

export interface CabinetCommand {
  action: 'BORROW' | 'RETURN';
  slot: number;
}

export interface CabinetResponse {
  action: 'BORROW' | 'RETURN';
  slot: number;
  status: 'SUCCESS' | 'FAIL';
  reason?: 'NOT_TAKEN' | 'NO_UMBRELLA' | 'WRONG_UMBRELLA';
  message: string;
}

/**
 * Universal MQTT Publisher to HiveMQ Cloud / Public Broker (QoS 0)
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
        // Hardware spec requires QoS 0
        client?.publish(topic, payloadString, { qos: 0 }, (err) => {
          clearTimeout(timeout);
          if (!resolved) {
            resolved = true;
            if (err) {
              console.warn('⚠️ [HiveMQ] Publish error:', err.message);
              resolve({ success: false, error: err.message });
            } else {
              console.log('✅ [HiveMQ] Command delivered to broker successfully (QoS 0).');
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
 * Publish Borrow Trigger Command to ESP32 Cabinet
 * Topic: astrix-umbrella/cabinet/command
 * Payload: {"action": "BORROW", "slot": slot}
 */
export async function publishBorrowCommand(slot: number, indexNo?: string) {
  const payload: CabinetCommand = {
    action: 'BORROW',
    slot,
  };
  return sendMqttMessage(MQTT_TOPIC_COMMAND, payload);
}

/**
 * Publish Return Trigger Command to ESP32 Cabinet
 * Topic: astrix-umbrella/cabinet/command
 * Payload: {"action": "RETURN", "slot": slot}
 */
export async function publishReturnCommand(slot: number, indexNo?: string) {
  const payload: CabinetCommand = {
    action: 'RETURN',
    slot,
  };
  return sendMqttMessage(MQTT_TOPIC_COMMAND, payload);
}

/**
 * Universal unlock command (backward compatibility)
 */
export async function publishUnlockCommand(
  action: 'BORROW' | 'RETURN' | string,
  slot: number,
  indexNo?: string
) {
  if (action === 'RETURN' || action === 'RETURN_UNLOCK') {
    return publishReturnCommand(slot, indexNo);
  }
  return publishBorrowCommand(slot, indexNo);
}
