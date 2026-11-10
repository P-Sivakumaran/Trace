import { z } from 'zod';
import { recordId, proposalSchema } from '../recon/contracts.js';
export const providerSchema = z.enum(['codex', 'claude']);
export type AgentProvider = z.infer<typeof providerSchema>;
export const profileSchema = z.object({
  provider: providerSchema, model: z.string().max(120).regex(/^(?:[A-Za-z0-9][A-Za-z0-9_./:-]*)?$/),
}).strict();
export const responseSchema = z.object({
  answer: z.string().max(24000), citations: z.array(recordId).max(30),
  action: z.union([
    z.object({ type: z.literal('search_case'), query: z.string().min(1).max(160) }).strict(),
    z.object({ type: z.literal('read_source'), sourceId: recordId }).strict(),
    z.object({ type: z.literal('propose_findings'), proposal: proposalSchema }).strict(),
  ]).nullable(),
}).strict();
export type AgentAnswer = z.infer<typeof responseSchema>;
const objectSchema = (properties: Record<string, unknown>) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
export const agentResponseJsonSchema = objectSchema({
  answer: { type: 'string' }, citations: { type: 'array', items: { type: 'string' } },
  action: { anyOf: [
    objectSchema({ type: { const: 'search_case', type: 'string' }, query: { type: 'string' } }),
    objectSchema({ type: { const: 'read_source', type: 'string' }, sourceId: { type: 'string' } }),
    objectSchema({ type: { const: 'propose_findings', type: 'string' }, proposal: objectSchema({ target: { type: 'string' }, domains: { type: 'array', items: { type: 'string' } }, summary: { type: 'string' } }) }),
    { type: 'null' },
  ] },
});
export const messageSchema = z.object({
  id: recordId, role: z.enum(['user', 'assistant']), content: z.string().max(24000),
  createdAt: z.iso.datetime(), provider: providerSchema.optional(), model: z.string().max(120).optional(),
  status: z.enum(['running', 'completed', 'failed', 'cancelled']), error: z.string().max(1000).optional(),
  citations: z.array(recordId).max(30), activity: z.array(z.string().max(500)).max(20),
  includeCase: z.boolean(), proposalId: recordId.optional(),
  contextHash: z.string().regex(/^[a-f0-9]{64}$/).optional(), contextRecords: z.number().int().nonnegative().optional(),
});
export type AgentMessage = z.infer<typeof messageSchema>;
export const conversationSchema = z.object({
  id: recordId, caseId: recordId, createdAt: z.iso.datetime(), messages: z.array(messageSchema).max(100),
});
export type AgentConversation = z.infer<typeof conversationSchema>;
export const sendSchema = profileSchema.extend({ caseId: recordId, conversationId: recordId, message: z.string().trim().min(1).max(12000), includeCase: z.boolean() }).strict();
export type ProviderStatus = { provider: AgentProvider; installed: boolean; version?: string; account: 'subscription' | 'api' | 'unknown' | 'signed_out'; detail: string };
export interface AgentApi {
  providers(): Promise<ProviderStatus[]>;
  list(caseId: string): Promise<AgentConversation[]>;
  get(caseId: string, conversationId: string): Promise<AgentConversation>;
  create(caseId: string): Promise<AgentConversation>;
  send(request: z.infer<typeof sendSchema>): Promise<AgentConversation>;
  cancel(caseId: string, conversationId: string): Promise<void>;
  context(caseId: string): Promise<{ text: string; records: number; truncated: boolean }>;
}
