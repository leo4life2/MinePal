import { mkdirSync, writeFileSync } from 'fs';
import { getCommandDocs } from './commands/index.js';
import { getSkillDocs } from './library/index.js';
import { stringifyTurns } from '../utils/text.js';
import { Proxy } from '../models/proxy.js';
export class Prompter {
    constructor(agent) {
        this.agent = agent;
        this.profile = agent.profile

        let name = this.profile.name;

        // Create a single proxy instance with userDataDir
        this.proxy = new Proxy(this.agent.userDataDir);

        // Overwrite the profile file on boot.
        const profilePath = `${this.agent.userDataDir}/profiles/${name}.json`;
        writeFileSync(profilePath, JSON.stringify(this.profile, null, 4), (err) => {
            if (err) {
                throw err;
            }
            console.log(`Profile updated at ${profilePath}.`);
        });
    }

    getName() {
        return this.profile.name;
    }

    getInitModes() {
        return this.profile.modes;
    }

    async replaceStrings(prompt, messages, prev_memory=null, to_summarize=[], last_goals=null) {
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
                    goal_text += `You recently successfully completed the goal ${goal}.\n`
                else
                    goal_text += `You recently failed to complete the goal ${goal}.\n`
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
        
        let responseData = null; // Initialize to null
        let error = null;

        try {
            responseData = await this.proxy.sendRequest(messages, systemPrompt);
            
            // --- Initial Error Handling & Validation --- 
            if (typeof responseData === 'string') {
                if (responseData.includes('Error')) {
                    error = responseData; // Keep error string
                    responseData = null; // Nullify responseData on error string
                } else {
                    // Attempt to parse if it's not explicitly an error string but might be JSON
                    try {
                        responseData = JSON.parse(responseData);
                    } catch (e) {
                        error = "Oops! The LLM returned invalid string data that couldn't be parsed as JSON.";
                        responseData = null; // Nullify responseData on parse error
                    }
                }
            }

            // Check if responseData is a valid object after potential parsing/error handling
            if (!error && (typeof responseData !== 'object' || responseData === null)) {
                 error = "Oops! The LLM returned an unexpected data format (not an object). Please try again.";
                 console.log('[Prompter] bad format:', responseData); // Log the bad format
                 responseData = null; // Nullify responseData
            }
        } catch (e) { 
             // Catch errors during the proxy request itself
             console.error("Error during LLM request:", e);
             error = e.message || "An unknown error occurred during the LLM request.";
             responseData = null; // Ensure responseData is null on request error
        }

        // --- Return --- 
        // Return the raw responseData if successful, or null if error occurred
        // Include the error separately
        return { response: responseData, error: error };
    }

    async promptMemSaving(prev_mem, to_summarize) {
        let prompt = this.profile.saving_memory;
        prompt = await this.replaceStrings(prompt, null, null, prev_mem, to_summarize);
        return await this.proxy.sendRequest([], prompt, '***', true);
    }
}