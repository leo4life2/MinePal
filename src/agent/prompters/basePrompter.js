import { Proxy } from '../../models/proxy.js';
import { getCommandDocs } from '../commands/index.js';

export class BasePrompter {
    constructor(agent, options = {}) {
        if (new.target === BasePrompter) {
            throw new Error('BasePrompter is abstract and cannot be instantiated directly.');
        }
        this.agent = agent;
        this.profile = agent.profile;

        const { proxyInstance = null } = options;
        this.proxy = proxyInstance ?? new Proxy(agent.userDataDir);

        if (this.getSourcePrompterId === BasePrompter.prototype.getSourcePrompterId) {
            throw new Error('Subclasses of BasePrompter must implement getSourcePrompterId().');
        }
    }

    getSourcePrompterId() {
        throw new Error('BasePrompter.getSourcePrompterId() must be overridden by subclasses.');
    }

    buildMessages(systemPrompt, turns = []) {
        const systemMessage = { role: 'system', content: systemPrompt };
        const conversationMessages = Array.isArray(turns)
            ? turns.map(turn => this._formatTurn(turn)).filter(Boolean)
            : [];

        return [systemMessage, ...conversationMessages];
    }

    async completeChat({ systemPrompt, turns, responseSchema, extraRequestFields = {} }) {
        const messages = this.buildMessages(systemPrompt, turns);
        const sourcePrompter = this.getSourcePrompterId();
        return this.proxy.sendChatCompletion({
            messages,
            responseSchema,
            extraRequestFields,
            sourcePrompter
        });
    }

    async injectContext(prompt, { messages = [], memory = null } = {}) {
        let populated = prompt;

        const replacements = {
            '$NAME': this.agent.name ?? '',
            '$OWNER': this.agent.owner ?? '',
            '$LANGUAGE': this.agent.settings?.language ?? '',
            '$PERSONALITY': this.profile?.personality ?? ''
        };

        for (const [token, value] of Object.entries(replacements)) {
            if (populated.includes(token)) {
                populated = populated.replaceAll(token, value);
            }
        }

        if (populated.includes('$MEMORY')) {
            const memoryText = await this._resolveMemoryPlaceholder(memory, messages);
            populated = populated.replaceAll('$MEMORY', memoryText);
        }

        if (populated.includes('$HUD')) {
            const { hudJson } = await this.agent.headsUpDisplay();
            populated = populated.replaceAll('$HUD', `Current HUD (JSON):\n${hudJson}`);
        }

        if (populated.includes('$COMMAND_DOCS')) {
            populated = populated.replaceAll('$COMMAND_DOCS', getCommandDocs());
        }

        return populated;
    }

    _formatTurn(turn) {
        if (!turn || typeof turn !== 'object') {
            return null;
        }

        const role = turn.role ?? 'user';

        if (role === 'assistant') {
            const formattedContent = this._formatAssistantContent(turn);
            return {
                role: 'assistant',
                content: formattedContent
            };
        }

        if (role === 'system') {
            const content = typeof turn.content === 'string' || Array.isArray(turn.content)
                ? turn.content
                : '';
            return { role: 'system', content };
        }

        if (role === 'user') {
            if (typeof turn.content === 'string') {
                const { strippedContent } = this._stripSpeakerPrefix(turn.content);
                return {
                    role: 'user',
                    content: strippedContent
                };
            }
            return {
                role: 'user',
                content: turn.content
            };
        }

        const fallbackContent = typeof turn.content === 'string' || Array.isArray(turn.content)
            ? turn.content
            : '';
        return { role, content: fallbackContent };
    }

    _formatAssistantContent(turn) {
        let formattedContent = '';

        if (turn.thought) {
            formattedContent += `[Inner Thought]: ${turn.thought}\n`;
        }

        if (turn.current_goal_status) {
            formattedContent += this._stringifyGoalStatus(turn.current_goal_status);
        }

        let assistantContent = turn.content;
        if (typeof assistantContent === 'string') {
            const { strippedContent } = this._stripSpeakerPrefix(assistantContent);
            assistantContent = strippedContent;
        }

        if (assistantContent != null) {
            formattedContent += assistantContent;
        }

        return formattedContent;
    }

    _stripSpeakerPrefix(content) {
        if (typeof content !== 'string') {
            return { strippedContent: content, speakerName: undefined };
        }

        const speakerMatch = content.match(/^<([^>]+)>:\s*(.*)$/s);
        if (!speakerMatch) {
            return { strippedContent: content, speakerName: undefined };
        }

        const [, speaker, remainder] = speakerMatch;
        return {
            strippedContent: remainder,
            speakerName: speaker
        };
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

    async _resolveMemoryPlaceholder(providedMemory, messages) {
        if (typeof providedMemory === 'string' && providedMemory.trim().length > 0) {
            return providedMemory;
        }

        const queryText = BasePrompter._inferQueryText(messages);
        if (!queryText || !this.agent?.history?.searchRelevant) {
            return 'None.';
        }

        try {
            const memories = await this.agent.history.searchRelevant(queryText);
            if (!Array.isArray(memories) || memories.length === 0) {
                return 'None.';
            }

            return memories
                .map(m => `[${m.shortId}] ${m.text}`)
                .join('\n');
        } catch (err) {
            console.warn('[BasePrompter] Failed to retrieve relevant memories:', err);
            return 'None.';
        }
    }

    static _inferQueryText(messages) {
        if (!Array.isArray(messages)) return null;

        const latestAssistantMessage = [...messages].reverse().find(msg => msg.role === 'assistant');
        if (latestAssistantMessage?.thought && typeof latestAssistantMessage.thought === 'string' && latestAssistantMessage.thought.trim()) {
            return latestAssistantMessage.thought;
        }

        const latestUserMessage = [...messages].reverse().find(msg => msg.role === 'user');
        if (latestUserMessage?.content && typeof latestUserMessage.content === 'string' && latestUserMessage.content.trim()) {
            return latestUserMessage.content;
        }

        return null;
    }
}

