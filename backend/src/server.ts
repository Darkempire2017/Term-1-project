import express from 'express';
import cors from 'cors';
import { config } from './config';
import { mqttService } from './services/mqtt.service';
import { authenticateJwt } from './middleware/auth.middleware';
import * as authController from './controllers/auth.controller';
import * as umbrellaController from './controllers/umbrella.controller';

const app = express();

// Middlewares
app.use(cors({ origin: '*' }));
app.use(express.json());

// Request logger
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Health check & station metrics
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    mqtt: mqttService.getStatus(),
  });
});

// Authentication Routes
app.post('/api/auth/register', authController.register);
app.post('/api/auth/verify-email', authController.verifyEmail);
app.post('/api/auth/resend-code', authController.resendOtp);
app.post('/api/auth/login', authController.login);
app.get('/api/auth/me', authenticateJwt, authController.getMe);

// Umbrella Station Routes
app.get('/api/umbrella/slots', umbrellaController.getSlots);
app.get('/api/umbrella/my-borrow', authenticateJwt, umbrellaController.getMyActiveBorrow);
app.post('/api/umbrella/borrow', authenticateJwt, umbrellaController.borrowUmbrella);
app.post('/api/umbrella/return', authenticateJwt, umbrellaController.returnUmbrella);
app.post('/api/umbrella/admin-unlock', umbrellaController.adminUnlockSlot);

// Start Server
app.listen(config.port, () => {
  console.log(`\n===============================================================`);
  console.log(`☂️  Smart Umbrella Sharing System - Backend Server Running`);
  console.log(`📡 REST API:       http://localhost:${config.port}`);
  console.log(`🌐 HiveMQ Broker:  ${config.mqtt.brokerUrl}`);
  console.log(`🚀 Ready to handle ESP32 NFC events and Student Requests`);
  console.log(`===============================================================\n`);
});
