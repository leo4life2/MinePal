import { BasePrompter } from './basePrompter.js';
import { createTree, createNLNode, createActionNode } from '../taskTree.js';

export const FAILURE_HANDLER_SYSTEM_PROMPT = `
You are the MinePal agent's task decomposer. 

The agent attempted an action in Minecraft that failed. 

Your job is to analyze the failed action and its error message, 
then decompose the problem into smaller subtasks that could allow 
the original action to eventually succeed.


Each subtask can be:
- an "action": one of the robot's available commands (see list below), with parameters filled in if possible.
- a "goal": a short natural-language objective when no single action fits yet.


Always return a JSON list of children ordered in a logical execution sequence.
Do not explain reasoning; output only the structured list.


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
                            description: 'Whether this is a concrete robot action or an abstract goal.'
                        },
                        name: {
                            type: 'string',
                            description: 'Action command name if type=action, or short goal label if type=goal.'
                        },
                        args: {
                            type: 'object',
                            description: 'Parameters for the action; empty if type=goal.'
                        },
                        description: {
                            type: 'string',
                            description: 'One-line human-readable explanation of the subtask.'
                        }
                    },
                    required: ['type', 'name'],
                    additionalProperties: false
                }
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
            const description = child.description && child.description.trim().length > 0
                ? child.description.trim()
                : child.name ?? `Subtask ${index + 1}`;

            if (child.type === 'action') {
                if (!child.name || typeof child.name !== 'string' || child.name.trim() === '') {
                    return;
                }
                const node = createActionNode({
                    id: childId,
                    label: description,
                    command: child.name,
                    notes: description,
                    meta: { args: child.args ?? {} }
                });
                tree.addNode(node);
                tree.attachChild(rootNode.id, node.id);
                return;
            }

            if (child.type === 'goal') {
                const goalLabel = child.name && child.name.trim().length > 0
                    ? child.name.trim()
                    : description;
                const node = createNLNode({
                    id: childId,
                    label: goalLabel,
                    goalText: description,
                    notes: description,
                    meta: { args: child.args ?? {} }
                });
                tree.addNode(node);
                tree.attachChild(rootNode.id, node.id);
            }
        });

        return tree;
    }
}
