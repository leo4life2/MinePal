import { BasePrompter } from './basePrompter.js';
import { createTree, createNLNode, createActionNode } from '../taskTree.js';

export const FAILURE_HANDLER_SYSTEM_PROMPT = `
You are the MinePal agent's task decomposer.

The agent attempted an action in Minecraft that failed.

Your task is to analyze the failed action and its error message,
then identify the essential subtasks that must be completed
to enable this action to succeed.

Formulate these subtasks as a *disjoint set* S = { s₁, s₂, …, sₙ },
where each sᵢ is a complete, independent requirement that can be executed
in any order relative to the others. No subtask may depend on the outcome
of another, and no conditional phrasing (if, then, else, after, when, otherwise) is allowed.

Each subtask must be one of the following:
- An "action": a directly executable command available to the robot (see command docs below), with explicit parameters when possible.
- A "goal": a concise natural-language description of a necessary subgoal if no single command fits yet.

Output ONLY this disjoint set of subtasks as a JSON list; do not explain reasoning or predict future behavior.

Command docs:
$COMMAND_DOCS

Context:
- Agent name: $NAME
- Owner name: $OWNER
- Language: $LANGUAGE
- Personality: $PERSONALITY
- Relevant memory: $MEMORY
- HUD snapshot: $HUD
`;

export const FAILURE_HANDLER_RESPONSE_SCHEMA = {
    name: 'failure_handler_response',
    strict: true,
    schema: {
        type: 'object',
        properties: {
            children: {
                type: 'array',
                description: 'List of subtasks generated to address the failure.',
                items: {
                    type: 'object',
                    properties: {
                        type: {
                            type: 'string',
                            enum: ['action', 'goal'],
                            description: 'Whether this child is an executable command or a higher-level goal.'
                        },
                        content: {
                            type: 'string',
                            description: 'If type=action, provide a MinePal command string like !action(param1, param2,...). If type=goal, provide a concise natural-language goal description.'
                        }
                    },
                    required: ['type', 'content'],
                    additionalProperties: false
                },
                additionalProperties: false
            }
        },
        required: ['children'],
        additionalProperties: false
    }
};

const formatMetadata = (metadata) => {
    if (!metadata || typeof metadata !== 'object' || Object.keys(metadata).length === 0) {
        return null;
    }

    try {
        return JSON.stringify(metadata, null, 2);
    } catch (err) {
        console.warn('[FailureHandlerPrompter] Unable to stringify metadata:', err);
        return String(metadata);
    }
};

export class FailureHandlerPrompter extends BasePrompter {
    getSourcePrompterId() {
        return 'failure_handler';
    }

    async _injectContext(basePrompt, failureSummary, metadata, messages) {
        const enrichedPrompt = await super.injectContext(basePrompt, { messages });

        const formattedSummary = failureSummary && failureSummary.trim().length > 0
            ? failureSummary.trim()
            : 'No summary provided.';

        const formattedMetadata = formatMetadata(metadata);
        const metadataSection = formattedMetadata
            ? `\nAdditional failure context (JSON):\n${formattedMetadata}`
            : '';

        return `${enrichedPrompt}\nFailure summary: ${formattedSummary}${metadataSection}`;
    }

    async promptFailure({ messages = [], failureSummary = '', metadata = {} } = {}) {
        const systemPrompt = await this._injectContext(
            FAILURE_HANDLER_SYSTEM_PROMPT,
            failureSummary,
            metadata,
            messages
        );

        return this.completeChat({
            systemPrompt,
            turns: messages,
            responseSchema: FAILURE_HANDLER_RESPONSE_SCHEMA
        });
    }

    async generateRecoveryTree({
        commandName = 'unknown action',
        failureSummary = '',
        metadata = {},
        messages = []
    } = {}) {
        const summary = failureSummary && failureSummary.trim().length > 0
            ? failureSummary.trim()
            : `Action ${commandName} failed.`;

        const treeId = `failure-${Date.now()}`;
        const treeLabel = `Failure: ${commandName}`;
        const tree = createTree({ treeId, label: treeLabel });
        const rootNode = tree.getNode(tree.rootId);

        tree.setLabel(rootNode.id, treeLabel);
        rootNode.goalText = summary;
        rootNode.meta = { ...(metadata || {}), commandName };
        rootNode.touch();

        let responseJson = null;
        try {
            const response = await this.promptFailure({
                messages,
                failureSummary: summary,
                metadata
            });
            responseJson = response?.json ?? null;
        } catch (err) {
            rootNode.notes = `Failure handler invocation error: ${err.message}`;
            return tree;
        }

        const subtasks = Array.isArray(responseJson?.children) ? responseJson.children : [];
        if (subtasks.length === 0) {
            if (responseJson?.error) {
                rootNode.notes = `Failure handler returned error: ${responseJson.error}`;
            }
            return tree;
        }

        subtasks.forEach((child, index) => {
            if (!child || typeof child !== 'object') return;
            const childId = `child-${index + 1}`;
            const type = child.type;
            const content = typeof child.content === 'string' ? child.content.trim() : '';

            if (type === 'action' && content) {
                const node = createActionNode({
                    id: childId,
                    label: content,
                    command: content
                });
                tree.addNode(node);
                tree.attachChild(rootNode.id, node.id);
                return;
            }

            if (type === 'goal' && content) {
                const node = createNLNode({
                    id: childId,
                    label: content,
                    goalText: content
                });
                tree.addNode(node);
                tree.attachChild(rootNode.id, node.id);
            }
        });

        return tree;
    }
}
