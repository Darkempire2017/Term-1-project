import mqtt from 'mqtt';

export const MQTT_TOPIC_UNLOCK = 'astrix/uom/kiosk-01/command/unlock';
export const MQTT_TOPIC_REMOVED = 'astrix/uom/kiosk-01/event/removed';
export const MQTT_TOPIC_RETURNED = 'astrix/uom/kiosk-01/event/returned';
export const MQTT_TOPIC_STATUS = 'astrix/uom/kiosk-01/status';

export interface UnlockPayload {
  action: 'BORROW_UNLOCK' | 'RETURN_UNLOCK';
  slot: number;
  duration_ms: number;
  index_no: string;
}

/**
 * Publish solenoid lock release command to HiveMQ Cloud
 */
export async function publishUnlockCommand(
  action: 'BORROW_UNLOCK' | 'RETURN_UNLOCK',
  slot: number,
  indexNo: string,
  durationMs: number = action === 'BORROW_UNLOCK' ? 5000 : 8000
): Promise<{ success: boolean; simulated?: boolean; error?: string }> {
  const brokerUrl = process.env.HIVEMQ_BROKER_URL;
  const username = process.env.HIVEMQ_USERNAME;
  const password = process.env.HIVEMQ_PASSWORD;

  const payload: UnlockPayload = {
    action,
    slot,
    duration_ms: durationMs,
    index_no: indexNo,
  };

  const payloadString = JSON.stringify(payload);

  console.log(`\n======================================================`);
  console.log(`📡 [MQTT PUBLISH] Topic: ${MQTT_TOPIC_UNLOCK}`);
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
        client?.publish(MQTT_TOPIC_UNLOCK, payloadString, { qos: 1 }, (err) => {
          clearTimeout(timeout);
          if (!resolved) {
            resolved = true;
            if (err) {
              console.warn('⚠️ [HiveMQ] Publish error:', err.message);
              resolve({ success: false, error: err.message });
            } else {
              console.log(' [HiveMQ] Solenoid unlock command delivered to broker.');
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
