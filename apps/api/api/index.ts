import { handle } from '@hono/node-server/vercel'
import app from '../src/index' // Point this to your actual Hono app instance

export default handle(app)
