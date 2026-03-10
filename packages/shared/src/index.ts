// ── Enums / Literals ──────────────────────────────────────────────────────────

export type Channel = 'web' | 'telegram' | 'whatsapp'
export type Tier = 'free' | 'pro'
export type WorkMode = 'remote' | 'hybrid' | 'onsite'
export type RunStatus = 'pending' | 'running' | 'complete' | 'error'
export type JobStatus = 'saved' | 'applied' | 'interviewing' | 'rejected' | 'offer'
export type MessageRole = 'user' | 'assistant'

// ── Domain types ──────────────────────────────────────────────────────────────

export interface User {
  id: string
  email: string | null
  name: string | null
  tier: Tier
  workMode: WorkMode | null
  /** Minimum acceptable annual salary in USD */
  salaryMin: number | null
  /** Maximum acceptable annual salary in USD */
  salaryMax: number | null
  /** Extracted plain text from last uploaded resume. 50k char max. Raw PDF never stored. */
  resumeText: string | null
  createdAt: string
  updatedAt: string
}

export interface ChannelIdentity {
  id: string
  userId: string
  channel: Channel
  /** External channel user ID (e.g. Telegram user ID) */
  channelUserId: string
  createdAt: string
}

export interface Message {
  role: MessageRole
  content: string
  timestamp: string
}

export interface Session {
  id: string
  userId: string
  channel: Channel
  messages: Message[]
  lastActive: string
  createdAt: string
}

export interface JobTracking {
  id: string
  userId: string
  jobId: string
  title: string
  company: string
  url: string | null
  status: JobStatus
  createdAt: string
}

/** Append-only log of job search skill invocations per user */
export interface Run {
  id: string
  userId: string
  skill: string
  status: RunStatus
  resultSummary: string | null
  durationMs: number | null
  createdAt: string
}

// ── API contracts ─────────────────────────────────────────────────────────────

export interface ChatRequest {
  userId: string
  channel: Channel
  message: string
  sessionId?: string
}

export interface ChatResponse {
  sessionId: string
  message: string
  skill: string | null
  metadata?: Record<string, unknown>
}

/** SSE progress event sent during long-running skill invocations */
export interface ProgressEvent {
  type: 'progress'
  step: string
  message: string
}

export interface ApiError {
  code: string
  message: string
  status: number
}

// ── Worker contracts ──────────────────────────────────────────────────────────

export interface CareerClawProfile {
  name?: string
  workMode?: WorkMode
  salaryMin?: number
  salaryMax?: number
}

export interface CareerClawRunRequest {
  userId: string
  profile: CareerClawProfile
  resumeText?: string
  /** Number of top-scored results to return (free: 3, pro: 10) */
  topK: number
}

export interface JobMatch {
  id: string
  title: string
  company: string
  url: string
  salary: string | null
  location: string
  source: string
  score: number
  skillOverlap: string[]
  outreachDraft: string | null
}

export interface CareerClawRunResult {
  matches: JobMatch[]
  runId: string
  durationMs: number
}
