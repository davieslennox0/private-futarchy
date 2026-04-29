import winston from 'winston';
import { config } from './config';

export const logger = winston.createLogger({
  level: config.agent.logLevel,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const metaStr = Object.keys(meta).length ? `\n  ${JSON.stringify(meta, null, 2)}` : '';
      return `[${timestamp}] ${level}: ${message}${metaStr}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: 'logs/agent.log',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.uncolorize(),
        winston.format.json()
      ),
    }),
  ],
});

