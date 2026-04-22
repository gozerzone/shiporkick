/**
 * Mint a LiveKit access JWT for local/dev static token flow.
 * Never commit API secrets. Run:
 *   LIVEKIT_API_KEY=... LIVEKIT_API_SECRET=... node scripts/mint-livekit-token.mjs
 * Optional: LIVEKIT_ROOM=Main LIVEKIT_IDENTITY=ShipORKick LIVEKIT_TTL=168h
 */
import { AccessToken } from 'livekit-server-sdk'

const apiKey = process.env.LIVEKIT_API_KEY
const apiSecret = process.env.LIVEKIT_API_SECRET
const room = process.env.LIVEKIT_ROOM || 'Main'
const identity = process.env.LIVEKIT_IDENTITY || 'ShipORKick'
const ttl = process.env.LIVEKIT_TTL || '168h'

if (!apiKey || !apiSecret) {
  console.error('Set LIVEKIT_API_KEY and LIVEKIT_API_SECRET (do not commit them).')
  process.exit(1)
}

const token = new AccessToken(apiKey, apiSecret, { identity, ttl })
token.addGrant({
  room,
  roomJoin: true,
  canPublish: true,
  canPublishData: true,
  canSubscribe: true,
})

console.log(await token.toJwt())
