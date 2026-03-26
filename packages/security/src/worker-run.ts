import { z } from 'zod'

export const WorkModeSchema = z.enum(['remote', 'hybrid', 'onsite'])

export const CareerClawProfileSchema = z.object({
  name: z.string().max(200).optional(),
  skills: z.array(z.string().max(100)).max(100).optional().default([]),
  targetRoles: z.array(z.string().max(200)).max(20).optional().default([]),
  experienceYears: z.number().int().min(0).max(60).nullable().optional(),
  resumeSummary: z.string().max(2_000).nullable().optional(),
  workMode: WorkModeSchema.optional(),
  salaryMin: z.number().int().positive().max(10_000_000).optional(),
  salaryMax: z.number().int().positive().max(10_000_000).optional(),
  locationPref: z.string().max(200).optional(),
})

export const CareerClawWorkerInputSchema = z
  .object({
    profile: CareerClawProfileSchema,
    resumeText: z.string().max(50_000, 'Resume text too long (max 50k chars)').optional(),
    topK: z.number().int().min(1).max(10).default(3),
  })
  .refine(
    (d) => {
      if (d.profile.salaryMin != null && d.profile.salaryMax != null) {
        return d.profile.salaryMin <= d.profile.salaryMax
      }
      return true
    },
    { message: 'salaryMin must be <= salaryMax', path: ['profile', 'salaryMin'] },
  )

export const WorkerAssertionTokenSchema = z.string().min(32).max(8_000)

export const CareerClawRunRequestSchema = z.object({
  assertion: WorkerAssertionTokenSchema,
  input: CareerClawWorkerInputSchema,
})

export type CareerClawWorkerInputParsed = z.infer<typeof CareerClawWorkerInputSchema>
export type CareerClawRunRequestInput = z.infer<typeof CareerClawRunRequestSchema>
