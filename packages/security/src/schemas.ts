import { z } from 'zod'

export const ChannelSchema = z.enum(['web', 'telegram', 'whatsapp'])
export const TierSchema = z.enum(['free', 'pro'])
