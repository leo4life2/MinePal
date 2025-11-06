import { Proxy } from '../../models/proxy.js';

export class ChatPrompter {
    constructor(agent, options = {}) {
        this.agent = agent;
        this.profile = agent.profile;

        const { proxyInstance = null } = options;
        this.proxy = proxyInstance ?? new Proxy(agent.userDataDir);
    }

    buildMessages(systemPrompt, turns = []) {
        const systemMessage = { role: 'system', content: systemPrompt };
        const conversationMessages = Array.isArray(turns)
            ? turns.map(turn => this._formatTurn(turn))
            : [];

        return [systemMessage, ...conversationMessages];
    }

    async completeChat({ systemPrompt, turns, responseSchema, extraRequestFields = {} }) {
        const messages = this.buildMessages(systemPrompt, turns);
        return this.proxy.sendChatCompletion({
            messages,
            responseSchema,
            extraRequestFields
        });
    }

    _formatTurn(turn) {
        if (!turn || typeof turn !== 'object') {
            return turn;
        }

        if (turn.role !== 'assistant') {
            return { ...turn };
        }

        const formattedContent = this._formatAssistantContent(turn);
        return {
            ...turn,
            content: formattedContent
        };
    }

    _formatAssistantContent(turn) {
        let formattedContent = '';

        if (turn.thought) {
            formattedContent += `[Inner Thought]: ${turn.thought}\n`;
        }

        if (turn.current_goal_status) {
            formattedContent += this._stringifyGoalStatus(turn.current_goal_status);
        }

        formattedContent += turn.content || '';
        return formattedContent;
    }

    _stringifyGoalStatus(goalStatus) {
        if (!goalStatus || typeof goalStatus !== 'object') {
            return '';
        }

        const title = goalStatus.title ?? 'Unknown Goal';
        const status = goalStatus.status ?? 'Unknown Status';
        let goalStatusString = `[Goal Status]: Title: ${title} (Status: ${status})\n`;

        if (Array.isArray(goalStatus.subtasks) && goalStatus.subtasks.length > 0) {
            goalStatusString += '  Subtasks:\n';
            goalStatus.subtasks.forEach((subtask, index) => {
                const description = subtask?.description ?? 'No description provided';
                const subtaskStatus = subtask?.status ?? 'Unknown';
                goalStatusString += `    ${index + 1}. ${description} (Status: ${subtaskStatus})\n`;
            });
        }

        return goalStatusString;
    }
}

