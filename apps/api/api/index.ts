import { handle } from '@hono/node-server/vercel'
import app from '../src/index' // Point this to your actual Hono app instance

export const config = {
  runtime: 'edge', // Optional: Use 'edge' or remove for standard serverless
}

export default handle(app)
