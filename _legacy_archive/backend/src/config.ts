import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: process.env.PORT ? parseInt(process.env.PORT, 10) : 5050,
  jwtSecret: process.env.JWT_SECRET || 'umbrella_secret_key_default',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',

  supabase: {
    url: process.env.SUPABASE_URL || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  },

  mqtt: {
    brokerUrl: process.env.MQTT_BROKER_URL || 'mqtt://broker.hivemq.com:1883',
    clientId: process.env.MQTT_CLIENT_ID || `smart-umbrella-${Math.random().toString(16).substring(2, 8)}`,
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
    topics: {
      scan: 'smart-umbrella/esp32/scan',
      unlock: 'smart-umbrella/esp32/unlock',
      status: 'smart-umbrella/esp32/status',
      feedback: 'smart-umbrella/esp32/feedback',
    },
  },

  smtp: {
    host: process.env.SMTP_HOST || '',
    port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587,
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || '"Smart Umbrella Box" <noreply@smartumbrella.edu>',
  },
};
