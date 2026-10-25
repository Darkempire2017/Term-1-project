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
 * Resolves the optimal broker URL for web and serverless environments.
 * Upgrades raw TCP (1883) to WebSockets SSL (8884) to pass through cloud firewalls.
 */
function getEffectiveBrokerUrl(): string {
  const envUrl = process.env.HIVEMQ_BROKER_URL?.trim();
  if (!envUrl || envUrl === 'mqtt://broker.hivemq.com:1883' || envUrl.includes('broker.hivemq.com:1883')) {
    return 'wss://broker.hivemq.com:8884/mqtt';
  }
  return envUrl;
}

/**
 * Universal MQTT Publisher to HiveMQ Cloud / Public Broker (QoS 0)
 * Uses WebSockets SSL on port 8884 to ensure 100% cloud & Vercel delivery.
 * Includes automatic 2-attempt retry with socket flushing.
 */
async function sendMqttMessage(
  topic: string,
  payload: any
): Promise<{ success: boolean; simulated?: boolean; error?: string }> {
  const brokerUrl = getEffectiveBrokerUrl();
  const username = process.env.HIVEMQ_USERNAME;
  const password = process.env.HIVEMQ_PASSWORD;

  const payloadString = JSON.stringify(payload);

  console.log(`\n======================================================`);
  console.log(`📡 [MQTT PUBLISH] Topic: ${topic}`);
  console.log(`🔌 Broker: ${brokerUrl}`);
  console.log(`📦 Payload: ${payloadString}`);
  console.log(`======================================================\n`);

  // If broker URL is placeholder or not configured, simulate
  if (!brokerUrl || brokerUrl.includes('your-cluster-id')) {
    console.log('ℹ️ [HiveMQ] Local simulation mode active. Command logged successfully.');
    return { success: true, simulated: true };
  }

  // Attempt up to 2 times for rock-solid reliability across transient network hiccups
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const result = await new Promise<{ success: boolean; error?: string }>((resolve) => {
        let client: mqtt.MqttClient | null = null;
        let resolved = false;

        const timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            console.warn(`⚠️ [HiveMQ] Attempt ${attempt}: Connection timed out after 9000ms.`);
            try { client?.end(true); } catch {}
            resolve({ success: false, error: 'Connection to HiveMQ timed out.' });
          }
        }, 9000);

        try {
          const options: mqtt.IClientOptions = {
            clientId: `astrix-web-${Math.random().toString(16).substring(2, 8)}`,
            connectTimeout: 8000,
            clean: true,
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
                  console.warn(`⚠️ [HiveMQ] Attempt ${attempt} publish error:`, err.message);
                  try { client?.end(true); } catch {}
                  resolve({ success: false, error: err.message });
                } else {
                  console.log('✅ [HiveMQ] Command queued to broker. Flushing socket...');
                  setTimeout(() => {
                    try {
                      client?.end(false, () => {
                        console.log('✅ [HiveMQ] Socket flushed and closed cleanly.');
                      });
                    } catch {}
                  }, 200);
                  resolve({ success: true });
                }
              }
            });
          });

          client.on('error', (err) => {
            clearTimeout(timeout);
            if (!resolved) {
              resolved = true;
              console.warn(`⚠️ [HiveMQ] Attempt ${attempt} connection error:`, err.message);
              try { client?.end(true); } catch {}
              resolve({ success: false, error: err.message });
            }
          });
        } catch (e: any) {
          clearTimeout(timeout);
          if (!resolved) {
            resolved = true;
            console.warn(`⚠️ [HiveMQ] Attempt ${attempt} exception:`, e.message);
            resolve({ success: false, error: e.message });
          }
        }
      });

      if (result.success) {
        return { success: true, simulated: false };
      }

      console.warn(`⚠️ [HiveMQ] Attempt ${attempt} did not succeed (${result.error}). Retrying...`);
      if (attempt === 1) {
        await new Promise((r) => setTimeout(r, 400));
      }
    } catch (e: any) {
      console.warn(`⚠️ [HiveMQ] Outer attempt ${attempt} error:`, e.message);
    }
  }

  return {
    success: false,
    error: 'Failed to transmit MQTT command to HiveMQ broker after 2 attempts.',
  };
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
