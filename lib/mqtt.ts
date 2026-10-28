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

// 4. ESP32 ➔ Server: "got it" the moment a command arrives
//    {"action":"BORROW","slot":1,"accepted":true} (accepted=false + reason "BUSY" if the slot is busy)
export const MQTT_TOPIC_ACK = 'astrix-umbrella/cabinet/ack';

// 5. ESP32 ➔ Server: online/offline (retained). {"online":true,"ack":true} when the cabinet
//    connects; {"online":false} is its MQTT last will, published by the broker if it drops off.
//    Newer firmware adds the WiFi in use: "wifi":1-4, "networks":[4 names], "wifi_failed":1-4.
//    It sends {"online":false,"switching":true} just before moving to another WiFi.
export const MQTT_TOPIC_STATUS = 'astrix-umbrella/cabinet/status';

const STATUS_WAIT_MS = 1500; // how long to wait for the retained status before sending
const ACK_WAIT_MS = 6000;    // no "got it" within this -> the cabinet is offline

export interface CabinetStatus {
  online: boolean;
  ack: boolean; // firmware sends "got it" replies (older firmware doesn't)
}

// The cabinet's WiFi: the network in use (1-4), the names of all 4, and the last one it couldn't join
export interface CabinetWifi {
  current: number;
  networks: string[];
  failed: number | null;
}

// Last cabinet status seen by this server instance (from commands and the slot sync)
let lastStatus: { status: CabinetStatus; seenAt: number } | null = null;
let lastWifi: CabinetWifi | null = null;

export function rememberCabinetStatus(raw: string) {
  try {
    const data = JSON.parse(raw);
    if (typeof data.online === 'boolean') {
      lastStatus = { status: { online: data.online, ack: Boolean(data.ack) }, seenAt: Date.now() };
    }
    if (typeof data.wifi === 'number' && Array.isArray(data.networks)) {
      lastWifi = {
        current: data.wifi,
        networks: data.networks.map((n: unknown) => String(n ?? '')),
        failed: typeof data.wifi_failed === 'number' ? data.wifi_failed : null,
      };
    }
  } catch {}
}

/**
 * The WiFi the cabinet last reported (kept while it is offline), or null with older firmware
 */
export function getCachedCabinetWifi(): CabinetWifi | null {
  return lastWifi;
}

/**
 * true/false if this instance saw the cabinet's status in the last 45 s, otherwise null (unknown)
 */
export function getCachedCabinetOnline(): boolean | null {
  if (!lastStatus || Date.now() - lastStatus.seenAt > 45000) return null;
  return lastStatus.status.online;
}

// WIFI uses "slot" for the WiFi number 1-4; DIAG (RFID reader check) uses slot 0
export type CabinetAction = 'BORROW' | 'RETURN' | 'OPEN' | 'CLOSE' | 'WIFI' | 'DIAG';

// One RFID reader from the cabinet's reader check (DIAG)
export interface CabinetReaderReport {
  reader: number;
  chip: number; // version register: 0 or 255 means the reader isn't answering
  antenna: boolean;
  gain_db: number;
  errors: number;
  button: boolean; // umbrella button pressed
  replies: number; // tag replies out of "tries"
  tag: string;
  fix: 'none' | 'reset' | 'hardware reset' | 'failed';
}

export interface CabinetCommand {
  action: CabinetAction;
  slot: number;
}

export interface CabinetResponse {
  action: CabinetAction;
  slot: number;
  status: 'SUCCESS' | 'FAIL';
  reason?: 'NOT_TAKEN' | 'NO_UMBRELLA' | 'WRONG_UMBRELLA' | 'NO_NETWORK' | 'SLOTS_BUSY';
  message: string;
  tries?: number; // DIAG only
  readers?: CabinetReaderReport[]; // DIAG only
}

// OFFLINE: the cabinet is offline or never said "got it" (it did not receive the command)
// BUSY:    the cabinet said the slot is busy and did not start
// TIMEOUT: the cabinet got the command but its result never arrived
export type CabinetError = 'CONNECT_FAILED' | 'TIMEOUT' | 'OFFLINE' | 'BUSY';

export type CabinetResult =
  | { ok: true; response: CabinetResponse }
  | { ok: false; error: CabinetError; commandSent: boolean };

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
 * One connection attempt:
 *   1. subscribe to the response, "got it" and status topics
 *   2. wait briefly for the cabinet's retained status; if it says offline, stop here
 *   3. send the command; if the firmware sends "got it" replies, expect one within 6 s
 *   4. wait for the cabinet's response for this action and slot
 * With older firmware (no status message) steps 2-3 are skipped, as before.
 */
function attemptCabinetCommand(command: CabinetCommand, timeoutMs: number): Promise<CabinetResult> {
  return new Promise((resolve) => {
    const client = mqtt.connect(getEffectiveBrokerUrl(), getBrokerOptions('astrix-web'));
    let commandSent = false;
    let decided = false; // whether step 2 has run
    let status: CabinetStatus | null = null;
    let finished = false;
    let statusTimer: ReturnType<typeof setTimeout> | null = null;
    let ackTimer: ReturnType<typeof setTimeout> | null = null;

    const finish = (result: CabinetResult) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (statusTimer) clearTimeout(statusTimer);
      if (ackTimer) clearTimeout(ackTimer);
      try {
        client.end(true);
      } catch {}
      resolve(result);
    };

    const timer = setTimeout(() => {
      finish({ ok: false, error: commandSent ? 'TIMEOUT' : 'CONNECT_FAILED', commandSent });
    }, timeoutMs);

    const sendCommand = () => {
      if (decided || finished) return;
      decided = true;
      if (statusTimer) clearTimeout(statusTimer);

      if (status && !status.online) {
        console.warn('⚠️ [Cabinet] Status says offline. Not sending', JSON.stringify(command));
        finish({ ok: false, error: 'OFFLINE', commandSent: false });
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
        if (status?.ack) {
          ackTimer = setTimeout(() => {
            console.warn('⚠️ [Cabinet] No "got it" reply. Treating the cabinet as offline.');
            finish({ ok: false, error: 'OFFLINE', commandSent: true });
          }, ACK_WAIT_MS);
        }
      });
    };

    client.on('connect', () => {
      // Subscribe BEFORE publishing so a fast cabinet reply is never missed
      client.subscribe([MQTT_TOPIC_RESPONSE, MQTT_TOPIC_ACK, MQTT_TOPIC_STATUS], { qos: 0 }, (subErr) => {
        if (subErr) {
          console.warn('⚠️ [HiveMQ] Subscribe error:', subErr.message);
          finish({ ok: false, error: 'CONNECT_FAILED', commandSent: false });
          return;
        }
        // The retained status (if any) normally arrives within a few hundred ms
        statusTimer = setTimeout(sendCommand, STATUS_WAIT_MS);
      });
    });

    client.on('message', (topic, message, packet) => {
      const raw = message.toString();

      if (topic === MQTT_TOPIC_STATUS) {
        rememberCabinetStatus(raw);
        try {
          const data = JSON.parse(raw);
          if (typeof data.online === 'boolean') status = { online: data.online, ack: Boolean(data.ack) };
        } catch {}
        if (!decided) {
          sendCommand();
        } else if (status && !status.online && !finished) {
          // The cabinet dropped off while we were waiting
          finish({ ok: false, error: commandSent ? 'TIMEOUT' : 'OFFLINE', commandSent });
        }
        return;
      }

      // A retained message was published earlier, not by the cabinet for this command.
      // Accepting it would let an old or fake reply complete a borrow/return.
      if (packet.retain) return;

      try {
        const data = JSON.parse(raw);
        if (data.action !== command.action || Number(data.slot) !== command.slot) return;

        if (topic === MQTT_TOPIC_ACK) {
          if (ackTimer) clearTimeout(ackTimer);
          ackTimer = null;
          if (data.accepted === false) finish({ ok: false, error: 'BUSY', commandSent: true });
          return;
        }

        if (topic === MQTT_TOPIC_RESPONSE) {
          console.log(`📨 [Cabinet Response] ${raw}`);
          finish({ ok: true, response: data as CabinetResponse });
        }
      } catch {
        // Ignore anything that is not cabinet JSON
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
export function cabinetErrorMessage(error: CabinetError, action: CabinetAction): string {
  if (error === 'CONNECT_FAILED') {
    return 'Could not reach the umbrella cabinet. Please try again in a moment.';
  }
  if (error === 'OFFLINE') {
    return 'The umbrella cabinet is offline right now. Please try again later.';
  }
  if (error === 'BUSY') {
    return 'That slot is busy at the cabinet right now. Please try again in a moment.';
  }
  if (action === 'WIFI') return 'The cabinet did not confirm the WiFi change in time.';
  if (action === 'DIAG') return 'The cabinet did not send the RFID check results in time.';
  if (action === 'OPEN') return 'The cabinet did not confirm lock opening in time.';
  if (action === 'CLOSE') return 'The cabinet did not confirm lock closing in time.';
  return action === 'BORROW'
    ? 'The cabinet did not respond in time. If the slot opened and you took the umbrella, please contact the station team.'
    : 'The cabinet did not respond in time. If you put the umbrella back, please contact the station team.';
}

/**
 * HTTP status for a cabinet error
 */
export function cabinetErrorStatus(error: CabinetError): number {
  return { TIMEOUT: 504, OFFLINE: 503, BUSY: 409, CONNECT_FAILED: 502 }[error];
}
