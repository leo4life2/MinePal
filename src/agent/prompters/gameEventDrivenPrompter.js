import { writeFileSync } from 'fs';
import { getCommandDocs } from '../commands/index.js';
import { getSkillDocs } from '../library/index.js';
import { stringifyTurns } from '../../utils/text.js';
import { ChatPrompter } from './basePrompter.js';

const deepClone = (value) => JSON.parse(JSON.stringify(value));

const VOICE_RESPONSE_PROPERTIES = {
    string_for_speech: {
        type: 'string',
        description: 'Same content as your in-game text, converted into a natural-sounding, expressive string optimized for text-to-speech. Expand abbreviations, slang, numbers, and symbols into spoken equivalents when it makes speech sound clearer and more natural, but preserve informal or expressive words exactly as written when expanding would alter their original emotional nuance, pronunciation, or tone. Insert commas, ellipses (…), or em-dashes (—) for appropriate pauses, and use expressive spelling (e.g., stretched vowels), natural interjections, and capitalization or italics for emphasis—but do not use brackets or markup.'
    },
    tone_and_style: {
        type: 'string',
        description: 'Provide a short, clear description of the desired speaking tone and style for the text-to-speech voice—this can include mood, energy level, pacing, pitch, and character traits, ranging from simple (“calm and cheerful”) to very descriptive (“high-pitched, bubbly anime-girl voice” or “laid-back, sluggish speech with slurred, lazy words”).'
    }
};

const VOICE_REQUIRED_FIELDS = ['string_for_speech', 'tone_and_style'];

const buildGameEventResponseSchema = (includeVoice) => {
    const schemaConfig = deepClone(GAME_EVENT_DRIVEN_RESPONSE_SCHEMA);

    if (!includeVoice) {
        return schemaConfig;
    }

    const schema = schemaConfig.schema;
    if (!schema.properties || typeof schema.properties !== 'object') {
        schema.properties = {};
    }

    for (const [key, value] of Object.entries(VOICE_RESPONSE_PROPERTIES)) {
        if (!schema.properties[key]) {
            schema.properties[key] = value;
        }
    }

    if (!Array.isArray(schema.required)) {
        schema.required = [];
    }

    for (const field of VOICE_REQUIRED_FIELDS) {
        if (!schema.required.includes(field)) {
            schema.required.push(field);
        }
    }

    return schemaConfig;
};

export const GAME_EVENT_DRIVEN_RESPONSE_SCHEMA = {
    name: 'minepal_response',
    strict: true,
    schema: {
        type: 'object',
        properties: {
            thought: {
                type: 'string',
                description: 'Internal reasoning explaining your planned action and next steps concisely.'
            },
            current_goal_status: {
                type: 'object',
                description: 'An object detailing your current goal, overall status, and subtasks. The goal is complete only when all subtasks are marked complete.',
                properties: {
                    title: {
                        type: 'string',
                        description: 'Brief description of the overall goal.'
                    },
                    status: {
                        type: 'string',
                        description: 'Overall goal status (In Progress, Completed, Failed). Set to Completed only when all subtasks are complete.'
                    },
                    subtasks: {
                        type: 'array',
                        description: 'List of specific subtasks required to achieve the goal. Each subtask should be achievable with a single action.',
                        items: {
                            type: 'object',
                            properties: {
                                description: {
                                    type: 'string',
                                    description: 'Concise description of a single-action subtask.'
                                },
                                status: {
                                    type: 'string',
                                    description: 'Status of the subtask (In Progress, Completed, Failed). Be diligent in updating status after each action.'
                                }
                            },
                            required: ['description', 'status'],
                            additionalProperties: false
                        }
                    }
                },
                required: ['title', 'status', 'subtasks'],
                additionalProperties: false
            },
            say_in_game: {
                type: 'string',
                description: "Short, casual in-game message directed at players in owner's specified language. Never ask follow-ups or offers, never end your messages with unsolicited prompts like 'want me to ...?'"
            },
            emote: {
                type: 'string',
                description: 'Optional: Trigger a specific visual emote. Valid values: hello, wave, bow, yes, no, twerk, spin, pogo, cheer. Leave empty if no emote is needed.',
                enum: ['', 'hello', 'wave', 'bow', 'yes', 'no', 'twerk', 'spin', 'pogo', 'cheer']
            },
            execute_command: {
                type: 'string',
                description: 'This is how you perform actions in Minecraft. A single MinePal non-memory command (!command) or Minecraft slash-command to execute. Do not make memory related actions here. Do not make multiple commands calls. Always prioritize MinePal custom commands and use slash commands sparingly or only if user asks for it. Leave empty if no command is necessary.'
            },
            manage_memories: {
                type: 'array',
                items: {
                    type: 'string',
                    description: "An operation string: 'ADD:<text>', 'DELETE:<shortId>' (e.g., 'DELETE:MEM-123'), or 'UPDATE:<shortId>:<newText>' (e.g., 'UPDATE:MEM-123:Updated memory text')."
                },
                description: 'An array of memory operations. Use ADD:<text> to add new memories. Use DELETE:<shortId> to remove obsolete memories. Use UPDATE:<shortId>:<newText> to modify existing memories.'
            }
        },
        required: ['thought', 'say_in_game', 'emote', 'execute_command', 'current_goal_status', 'manage_memories'],
        additionalProperties: false
    }
};

export class GameEventDrivenPrompter extends ChatPrompter {
    constructor(agent, options = {}) {
        super(agent, options);

        this.profile = agent.profile;

        const name = this.profile.name;
        const profilePath = `${this.agent.userDataDir}/profiles/${name}.json`;
        writeFileSync(profilePath, JSON.stringify(this.profile, null, 4));
    }

    getName() {
        return this.profile.name;
    }

    getInitModes() {
        return this.profile.modes;
    }

    async replaceStrings(prompt, messages, prev_memory = null, to_summarize = [], last_goals = null) {
        prompt = prompt.replaceAll('$NAME', this.agent.name);
        prompt = prompt.replaceAll('$OWNER', this.agent.owner);
        prompt = prompt.replaceAll('$LANGUAGE', this.agent.settings.language);
        prompt = prompt.replaceAll('$PERSONALITY', this.profile.personality);


        if (prompt.includes('$HUD')) {
            const { hudString } = await this.agent.headsUpDisplay();
            prompt = prompt.replaceAll('$HUD', `Your heads up display: \n${hudString}`);
        }

        if (prompt.includes('$COMMAND_DOCS'))
            prompt = prompt.replaceAll('$COMMAND_DOCS', getCommandDocs());
        if (prompt.includes('$CODE_DOCS'))
            prompt = prompt.replaceAll('$CODE_DOCS', getSkillDocs());
        if (prompt.includes('$MEMORY'))
            prompt = prompt.replaceAll('$MEMORY', prev_memory ? prev_memory : 'None.');
        if (prompt.includes('$TO_SUMMARIZE'))
            prompt = prompt.replaceAll('$TO_SUMMARIZE', stringifyTurns(to_summarize));
        if (prompt.includes('$CONVO'))
            prompt = prompt.replaceAll('$CONVO', 'Recent conversation:\n' + stringifyTurns(messages));
        if (prompt.includes('$LAST_GOALS')) {
            let goal_text = '';
            for (let goal in last_goals) {
                if (last_goals[goal])
                    goal_text += `You recently successfully completed the goal ${goal}.\n`;
                else
                    goal_text += `You recently failed to complete the goal ${goal}.\n`;
            }
            prompt = prompt.replaceAll('$LAST_GOALS', goal_text.trim());
        }
        if (prompt.includes('$BLUEPRINTS')) {
            if (this.agent.npc.constructions) {
                let blueprints = '';
                for (let blueprint in this.agent.npc.constructions) {
                    blueprints += blueprint + ', ';
                }
                prompt = prompt.replaceAll('$BLUEPRINTS', blueprints.slice(0, -2));
            }
        }

        // check if there are any remaining placeholders with syntax $<word>
        let remaining = prompt.match(/\$[A-Z_]+/g);
        if (remaining !== null) {
            console.warn('Unknown prompt placeholders:', remaining.join(', '));
        }

        return prompt;
    }

    async promptConvo(messages) {
        // Determine query text: Prioritize last assistant thought, fallback to last user message
        const latestAssistantMessage = messages.findLast(msg => msg.role === 'assistant');
        const latestAssistantThought = latestAssistantMessage?.thought;

        let queryText = null;
        if (latestAssistantThought && typeof latestAssistantThought === 'string' && latestAssistantThought.trim() !== '') {
            queryText = latestAssistantThought;
            console.log("[Prompter Memory Query] Using last assistant thought.");
        } else {
            const latestUserMessage = messages.findLast(msg => msg.role === 'user');
            if (latestUserMessage?.content) {
                queryText = latestUserMessage.content;
                console.log("[Prompter Memory Query] Using last user message as fallback.");
            } else {
                console.log("[Prompter Memory Query] No suitable query text found.");
            }
        }

        let relevantMemories = '';
        if (queryText) { // Only search if we have a valid query text
            const memories = await this.agent.history.searchRelevant(queryText);
            if (memories.length > 0) {
                // Format results including the short ID
                relevantMemories = 'Relevant Retrieved Memories:\n' + memories // Updated header
                    .map(m => `[${m.shortId}] ${m.text}`) // Format: [MEM-123] Text
                    .join('\n');
            }
        }

        // console.log('[Prompter] relevantMemories:', relevantMemories);

        let systemPrompt = this.profile.conversing;
        systemPrompt = await this.replaceStrings(systemPrompt, messages, relevantMemories);
        
        try {
            const voiceEnabled = Boolean(this.agent.profile.enable_voice);
            const responseSchema = buildGameEventResponseSchema(voiceEnabled);
            const extraRequestFields = {};

            if (voiceEnabled) {
                extraRequestFields.enable_voice = true;
                if (this.agent.profile.base_voice_id) {
                    extraRequestFields.base_voice_id = this.agent.profile.base_voice_id;
                }
            }

            return await this.completeChat({
                systemPrompt,
                turns: messages,
                responseSchema,
                extraRequestFields
            });
        } catch (e) {
            // This catch block handles errors if the proxy.sendRequest call itself fails catastrophically
            // (e.g., network errors not handled by proxy.js, or errors in request construction before proxy.js runs).
            // We ensure a consistent return structure that agent.js can handle.
            console.error('Critical Error in GameEventDrivenPrompter.promptConvo during sendChatCompletion call:', e);
            return {
                json: { error: e.message || 'Unknown critical error in gameEventDrivenPrompter' },
                audio: null,
                audio_failed_but_text_ok: false
            };
        }
    }
}