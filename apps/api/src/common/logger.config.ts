import type { Params } from 'nestjs-pino';

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Structured logging via pino, not the default Nest console logger — every
 * HTTP request/response is logged as JSON with a request id, ready for a log
 * aggregator (CloudWatch, Datadog, whatever) once this is actually deployed.
 * Pretty-printed instead in non-production so local dev output stays
 * human-readable.
 *
 * Redaction is the part that actually matters here: without it, every
 * request log line would include the Authorization header (bearer token),
 * the refresh-token cookie, and — for login/register — the password in the
 * request body, in plaintext, in every log line. That's the kind of gap that
 * doesn't show up in a demo but is a real credential leak in production logs.
 */
export const loggerConfig: Params = {
  pinoHttp: {
    level: isProduction ? 'info' : 'debug',
    transport: isProduction
      ? undefined
      : {
          target: 'pino-pretty',
          options: { singleLine: true, colorize: true },
        },
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'res.headers["set-cookie"]',
        'req.body.password',
        'req.body.newPassword',
      ],
      censor: '[REDACTED]',
    },
    // Health checks get hit constantly by load balancers/orchestrators —
    // logging every single one at request volume would drown out everything
    // else within minutes of running behind a real health-checked LB.
    autoLogging: {
      ignore: (req) => req.url === '/api/health',
    },
  },
};
