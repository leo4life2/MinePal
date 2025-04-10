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
        const latestUserMessage = messages.findLast(msg => msg.role === 'user')?.content;
        let relevantMemories = '';
        if (latestUserMessage) {
            const memories = await this.agent.history.searchRelevant(latestUserMessage, 5);
            if (memories.length > 0) {
                relevantMemories = 'Relevant memories:\n' + memories
                    .map(m => `- ${m.text}`)
                    .join('\n');
            }
        }

        let systemPrompt = this.profile.conversing;
        systemPrompt = await this.replaceStrings(systemPrompt, messages, relevantMemories);
        
        let responseData;
        let chatMessage = null;
        let command = null;
        let error = null;

        try {
            responseData = await this.proxy.sendRequest(messages, systemPrompt);
            
            if (typeof responseData === 'string') {
                if (responseData.includes('Error')) {
                    error = responseData;
                } else {
                    // Attempt to parse if it's not explicitly an error string
                    try {
                        responseData = JSON.parse(responseData);
                    } catch (e) {
                        error = "Oops! The LLM returned invalid data. Please try again.";
                    }
                }
            }

            // If no error so far, process the response object
            if (!error) {
                if (typeof responseData !== 'object' || responseData === null) {
                     error = "Oops! The LLM returned an unexpected data format. Please try again.";
                     console.log('[Prompter] bad format:', responseData);
                } else {
                    const { say_in_game, execute_command } = responseData;

                    // Validate required fields
                    if (say_in_game === undefined || execute_command === undefined) {
                         error = "Oops! The LLM response is missing required fields. Please try again.";
                         console.log('[Prompter] bad response:', responseData);
                    } else {
                        chatMessage = say_in_game || null; // Use null if empty string
                        command = execute_command || null; // Use null if empty string

                        console.log('Chat Response:', chatMessage);
                        console.log('Execute Command:', command);

                        // Add prefix to command if needed
                        if (command && command.trim() !== '' && !command.startsWith('!') && !command.startsWith('/')) {
                            command = '!' + command;
                        }
                        // Ensure empty/whitespace commands become null
                        if (command && command.trim() === '') {
                            command = null;
                        }
                    }
                }
            }
        } catch (e) { 
             // Catch errors during the proxy request itself
             console.error("Error during LLM request:", e);
             error = e.message;
        }

        // Return the structured object
        return { chatMessage, command, error };
    }

    async promptMemSaving(prev_mem, to_summarize) {
        let prompt = this.profile.saving_memory;
        prompt = await this.replaceStrings(prompt, null, null, prev_mem, to_summarize);
        return await this.proxy.sendRequest([], prompt, '***', true);
    }
}