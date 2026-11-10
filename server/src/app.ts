import express from 'express';
import cookieParser from 'cookie-parser';
import { corsMiddleware } from './middlewares/cors.js';
import { csrfGuard } from './middlewares/csrfGuard.js';
import { requireJsonContentType } from './middlewares/contentType.js';
import { errorHandler } from './middlewares/errorHandler.js';
import authRoutes from './routes/auth.routes.js';
import accountRoutes from './routes/account.routes.js';
import transactionRoutes from './routes/transaction.routes.js';
import financialRoutes from './routes/financial.routes.js';

export const app = express();

// 1. CORS Middleware
app.use(corsMiddleware);

// 2. CSRF Validation Middleware
app.use(csrfGuard);

// 3. Content-Type check for mutating JSON requests
app.use(requireJsonContentType);

// 4. JSON body parser
app.use(express.json());

// 5. Cookie Parser
app.use(cookieParser());

// 6. Routes
app.use('/api/auth', authRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api', financialRoutes);

// 7. Global Error Handler
app.use(errorHandler);
