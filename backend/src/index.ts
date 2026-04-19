import express from 'express';
import cors from 'cors';
import { PORT } from './config';
import './db';
import authRoutes from './routes/auth.routes';
import payrollRoutes from './routes/payroll.routes';
import employeesRoutes from './routes/employees.routes';
import emailRoutes from './routes/email.routes';

const app = express();

const allowedOrigins = [
  'http://localhost:5173',
  'https://nominas.carnesbinefar.es',
  'https://carnesbinefar.github.io',
  process.env.FRONTEND_URL,
].filter(Boolean) as string[];

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: '50mb' }));

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`);
  });
  next();
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/employees', employeesRoutes);
app.use('/api/email', emailRoutes);

app.listen(PORT, () => {
  console.log(`Payroll Manager API running on port ${PORT}`);
});
