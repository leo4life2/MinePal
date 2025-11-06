import { ChatPrompter } from './basePrompter.js';

export const FAILURE_HANDLER_SYSTEM_PROMPT = `You are the MinePal agent's failure handler. Review the conversation history and provided failure metadata, then summarize what likely went wrong and suggest a single concrete recovery step. Keep the tone calm and pragmatic.`;

export const FAILURE_HANDLER_RESPONSE_SCHEMA = {
    name: 'failure_handler_response',
    strict: true,
    schema: {
        type: 'object',
        properties: {
            summary: {
                type: 'string',
                description: 'Briefly explain why the previous attempt failed.'
            },
            suggested_recovery_step: {
                type: 'string',
                description: 'A single, actionable next step that should help recover from the failure.'
            },
            confidence: {
                type: 'string',
                description: 'Confidence (low, medium, high) in the suggested recovery step.',
                enum: ['low', 'medium', 'high']
            }
        },
        required: ['summary', 'suggested_recovery_step'],
        additionalProperties: false
    }
};

export class FailureHandlerPrompter extends ChatPrompter {
    async promptFailure({ messages = [], failureSummary = '', metadata = {} } = {}) {
        const metadataSnippet = Object.keys(metadata).length > 0
            ? `\nAdditional context: ${JSON.stringify(metadata)}`
            : '';

        const systemPrompt = `${FAILURE_HANDLER_SYSTEM_PROMPT}\nFailure summary: ${failureSummary || 'No summary provided.'}${metadataSnippet}`;

        return this.completeChat({
            systemPrompt,
            turns: messages,
            responseSchema: FAILURE_HANDLER_RESPONSE_SCHEMA
        });
    }
}

