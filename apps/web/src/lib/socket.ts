import { io } from 'socket.io-client'
import { getAccessToken } from './api'

// Connects to the 'alerts' namespace built in apps/api/src/alerts/alerts.gateway.ts.
// Not auto-connected — AuthContext calls .connect()/.disconnect() as auth
// state changes. `auth` is a callback (not a static object) so every
// (re)connection attempt — including automatic reconnects after a network
// blip — re-reads whatever access token is current at that moment, rather
// than baking in a token that may have since rotated.
export const alertSocket = io(
  `${import.meta.env.VITE_WS_URL ?? 'http://localhost:3000'}/alerts`,
  {
    autoConnect: false,
    withCredentials: true,
    auth: (cb) => cb({ token: getAccessToken() }),
  },
)
