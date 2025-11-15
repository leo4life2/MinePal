import { BaseDecomposerPrompter, buildDecomposerPrompt, createDecomposerResponseSchema } from './baseDecomposerPrompter.js';
import TaskTree, { createActionNode } from '../taskTree.js';

const FAILURE_INTRO_LINES = [
    'You are the MinePal agent\'s task decomposer.',
    'The agent attempted an action in Minecraft that failed.'
];

const FAILURE_TASK_EXPLANATION = `Your task is to analyze the failed action and its error message,
then identify the essential subtasks that must be completed
to enable this action to succeed.`;

const FAILURE_CHILDREN_DESCRIPTION = 'List of subtasks generated to address the failure.';

export const FAILURE_DECOMPOSER_SYSTEM_PROMPT = buildDecomposerPrompt({
    introLines: FAILURE_INTRO_LINES,
    taskExplanation: FAILURE_TASK_EXPLANATION,
    additionalContextLines: []
});

export const FAILURE_DECOMPOSER_RESPONSE_SCHEMA = createDecomposerResponseSchema({
    name: 'failure_decomposer_response',
    childrenDescription: FAILURE_CHILDREN_DESCRIPTION
});

export class FailureDecomposerPrompter extends BaseDecomposerPrompter {
    getSourcePrompterId() {
        return 'failure_decomposer';
    }

    getDisplayName() {
        return 'Failure decomposer';
    }

    getIntroLines() {
        return FAILURE_INTRO_LINES;
    }

    getTaskExplanation() {
        return FAILURE_TASK_EXPLANATION;
    }

    getSummaryLabel() {
        return 'Failure summary';
    }

    getSummaryFallback() {
        return 'No summary provided.';
    }

    getMetadataLabel() {
        return 'Additional failure context (JSON)';
    }

    getResponseSchema() {
        return FAILURE_DECOMPOSER_RESPONSE_SCHEMA;
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
        const tree = new TaskTree({ treeId, label: treeLabel });
        const rootNode = createActionNode({
            id: 'root',
            label: treeLabel,
            command: commandName,
            status: 'failed',
            notes: summary,
            meta: { ...(metadata || {}), commandName }
        });

        tree.addNode(rootNode);
        tree.setRoot(rootNode.id);
        rootNode.touch();
        tree.touch();

        let responseJson = null;
        let reasoningSummary = null;
        try {
            const decomposition = await this.decompose({
                messages,
                summary,
                metadata
            });
            responseJson = decomposition.responseJson;
            reasoningSummary = decomposition.reasoningSummary;
        } catch (err) {
            rootNode.notes = `Failure decomposer invocation error: ${err.message}`;
            return tree;
        }

        if (reasoningSummary) {
            rootNode.decompositionReasoning = reasoningSummary;
            rootNode.touch();
            tree.touch();
        }

        const subtasks = Array.isArray(responseJson?.children) ? responseJson.children : [];
        if (subtasks.length === 0) {
            if (responseJson?.error) {
                rootNode.notes = `Failure decomposer returned error: ${responseJson.error}`;
            }
            return tree;
        }

        this.attachSubtasksToTree(tree, rootNode, subtasks);
        return tree;
    }
}
