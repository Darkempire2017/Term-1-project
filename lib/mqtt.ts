import mqtt from 'mqtt';

// =====================================================================
// Astrix Umbrella Kiosk — Official Hardware MQTT Topics
// =====================================================================
// 1. Server ➔ ESP32 Command Topic
export const MQTT_TOPIC_COMMAND = 'astrix-umbrella/cabinet/command';

// 2. ESP32 ➔ Server Response Topic
export const MQTT_TOPIC_RESPONSE = 'astrix-umbrella/cabinet/response';

// 3. ESP32 ➔ Server: what is physically in each slot (retained, see lib/cabinet-sync.ts)
export const MQTT_TOPIC_SLOTS = 'astrix-umbrella/cabinet/slots';

export type CabinetAction = 'BORROW' | 'RETURN' | 'OPEN' | 'CLOSE';

export interface CabinetCommand {
  action: CabinetAction;
  slot: number;
}

export interface CabinetResponse {
  action: CabinetAction;
  slot: number;
  status: 'SUCCESS' | 'FAIL';
  reason?: 'NOT_TAKEN' | 'NO_UMBRELLA' | 'WRONG_UMBRELLA';
  message: string;
}

export type CabinetResult =
  | { ok: true; response: CabinetResponse }
  | { ok: false; error: 'CONNECT_FAILED' | 'TIMEOUT'; commandSent: boolean };

/**
 * Resolves the optimal broker URL for web and serverless environments.
 * Upgrades raw TCP (1883) to WebSockets SSL (8884) to pass through cloud firewalls.
 */
export function getEffectiveBrokerUrl(): string {
  const envUrl = process.env.HIVEMQ_BROKER_URL?.trim();
  if (!envUrl || envUrl.includes('broker.hivemq.com:1883')) {
    return 'wss://broker.hivemq.com:8884/mqtt';
  }
  return envUrl;
}

export function getBrokerOptions(clientPrefix: string): mqtt.IClientOptions {
  const options: mqtt.IClientOptions = {
    clientId: `${clientPrefix}-${Math.random().toString(16).substring(2, 8)}`,
    connectTimeout: 8000,
    clean: true,
    reconnectPeriod: 0,
  };
  if (process.env.HIVEMQ_USERNAME) options.username = process.env.HIVEMQ_USERNAME;
  if (process.env.HIVEMQ_PASSWORD) options.password = process.env.HIVEMQ_PASSWORD;
  return options;
}

/**
 * One connection attempt: subscribe to the response topic, send the command,
 * then wait for the cabinet's response for this action and slot.
 */
function attemptCabinetCommand(command: CabinetCommand, timeoutMs: number): Promise<CabinetResult> {
  return new Promise((resolve) => {
    const client = mqtt.connect(getEffectiveBrokerUrl(), getBrokerOptions('astrix-web'));
    let commandSent = false;
    let finished = false;

    const finish = (result: CabinetResult) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try {
        client.end(true);
      } catch {}
      resolve(result);
    };

    const timer = setTimeout(() => {
      finish({ ok: false, error: commandSent ? 'TIMEOUT' : 'CONNECT_FAILED', commandSent });
    }, timeoutMs);

    client.on('connect', () => {
      // Subscribe BEFORE publishing so a fast cabinet response is never missed
      client.subscribe(MQTT_TOPIC_RESPONSE, { qos: 0 }, (subErr) => {
        if (subErr) {
          console.warn('⚠️ [HiveMQ] Subscribe error:', subErr.message);
          finish({ ok: false, error: 'CONNECT_FAILED', commandSent: false });
          return;
        }

        console.log(`📡 [MQTT PUBLISH] ${MQTT_TOPIC_COMMAND}: ${JSON.stringify(command)}`);
        client.publish(MQTT_TOPIC_COMMAND, JSON.stringify(command), { qos: 0 }, (pubErr) => {
          if (pubErr) {
            console.warn('⚠️ [HiveMQ] Publish error:', pubErr.message);
            finish({ ok: false, error: 'CONNECT_FAILED', commandSent: false });
            return;
          }
          commandSent = true;
        });
      });
    });

    client.on('message', (_topic, message, packet) => {
      // A retained message was published earlier, not by the cabinet for this command.
      // Accepting it would let an old or fake response complete a borrow/return.
      if (packet.retain) return;
      try {
        const data = JSON.parse(message.toString()) as CabinetResponse;
        if (data.action === command.action && Number(data.slot) === command.slot) {
          console.log(`📨 [Cabinet Response] ${message.toString()}`);
          finish({ ok: true, response: data });
        }
      } catch {
        // Ignore anything that is not a cabinet JSON response
      }
    });

    client.on('error', (err) => {
      console.warn('⚠️ [HiveMQ] Connection error:', err.message);
      if (!commandSent) finish({ ok: false, error: 'CONNECT_FAILED', commandSent: false });
    });
  });
}

/**
 * Sends a BORROW/RETURN command to the cabinet and waits for its response
 * (astrix-umbrella/cabinet/response). A borrow/return cycle on the cabinet
 * takes up to ~20 s, so the default wait is 45 s.
 * Retries once only if the command never reached the broker.
 */
export async function runCabinetCommand(
  action: CabinetAction,
  slot: number,
  timeoutMs = 45000
): Promise<CabinetResult> {
  const command: CabinetCommand = { action, slot };

  const first = await attemptCabinetCommand(command, timeoutMs);
  if (first.ok || first.commandSent) return first;

  console.warn('⚠️ [HiveMQ] Command was not delivered. Retrying once...');
  await new Promise((r) => setTimeout(r, 400));
  return attemptCabinetCommand(command, timeoutMs);
}

/**
 * Student-facing message when the cabinet could not be reached or did not answer
 */
export function cabinetErrorMessage(error: 'CONNECT_FAILED' | 'TIMEOUT', action: CabinetAction): string {
  if (error === 'CONNECT_FAILED') {
    return 'Could not reach the umbrella cabinet. Please try again in a moment.';
  }
  if (action === 'OPEN') return 'The cabinet did not confirm lock opening in time.';
  if (action === 'CLOSE') return 'The cabinet did not confirm lock closing in time.';
  return action === 'BORROW'
    ? 'The cabinet did not respond in time. If the slot opened and you took the umbrella, please contact the station team.'
    : 'The cabinet did not respond in time. If you put the umbrella back, please contact the station team.';
}
