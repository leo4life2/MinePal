import { BaseDecomposerPrompter, buildDecomposerPrompt, createDecomposerResponseSchema } from './baseDecomposerPrompter.js';
import TaskTree, { createNLNode } from '../taskTree.js';

const NL_INTRO_LINES = [
    'You are the MinePal agent\'s natural-language task decomposer.',
    'The agent received a natural-language task to execute.'
];

const NL_TASK_EXPLANATION = `Your job is to break the task into subtasks.`;

const NL_CHILDREN_DESCRIPTION = 'List of subtasks generated for the natural-language task.';

const NL_EXTRA_CONTEXT_LINES = ['- Task description: $TASK_DESCRIPTION'];

export const NL_DECOMPOSER_SYSTEM_PROMPT = buildDecomposerPrompt({
    introLines: NL_INTRO_LINES,
    taskExplanation: NL_TASK_EXPLANATION,
    additionalContextLines: NL_EXTRA_CONTEXT_LINES
});

export const NL_DECOMPOSER_RESPONSE_SCHEMA = createDecomposerResponseSchema({
    name: 'nl_decomposer_response',
    childrenDescription: NL_CHILDREN_DESCRIPTION
});

export class NLDecomposerPrompter extends BaseDecomposerPrompter {
    getSourcePrompterId() {
        return 'nl_decomposer';
    }

    getDisplayName() {
        return 'Task decomposer';
    }

    getIntroLines() {
        return NL_INTRO_LINES;
    }

    getTaskExplanation() {
        return NL_TASK_EXPLANATION;
    }

    getAdditionalContextLines() {
        return NL_EXTRA_CONTEXT_LINES;
    }

    getSummaryFallback() {
        return 'No task description provided.';
    }

    getMetadataLabel() {
        return 'Additional task context (JSON)';
    }

    getResponseSchema() {
        return NL_DECOMPOSER_RESPONSE_SCHEMA;
    }

    async generateTaskTree({
        taskTitle = 'Natural language task',
        taskSummary = '',
        metadata = {},
        messages = []
    } = {}) {
        const normalizedTitle = taskTitle && taskTitle.trim().length > 0
            ? taskTitle.trim()
            : 'Natural language task';
        const summary = taskSummary && taskSummary.trim().length > 0
            ? taskSummary.trim()
            : normalizedTitle;

        const treeId = `nltask-${Date.now()}`;
        const treeLabel = normalizedTitle;
        const tree = new TaskTree({ treeId, label: treeLabel });
        const rootNode = createNLNode({
            id: 'root',
            label: treeLabel,
            goalText: summary,
            notes: summary,
            meta: { ...(metadata || {}), taskTitle: normalizedTitle }
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
            rootNode.notes = `Task decomposer invocation error: ${err.message}`;
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
                rootNode.notes = `Task decomposer returned error: ${responseJson.error}`;
            }
            return tree;
        }

        this.attachSubtasksToTree(tree, rootNode, subtasks);
        return tree;
    }
}
