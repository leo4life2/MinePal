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

        mkdirSync(`${this.agent.userDataDir}/bots/${name}`, { recursive: true });
        writeFileSync(`${this.agent.userDataDir}/bots/${name}/last_profile.json`, JSON.stringify(this.profile, null, 4), (err) => {
            if (err) {
                throw err;
            }
            console.log("Copy profile saved.");
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
        // Get the latest user message
        const latestUserMessage = messages.findLast(msg => msg.role === 'user')?.content;
        
        // Get relevant memories if there's a user message
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
        
        let chat_response, execute_command;
        let response = await this.proxy.sendRequest(messages, systemPrompt);
        if (typeof response === 'string') {
            // If it's an error message, return it directly
            if (response.includes('Error')) {
                return response;
            }
            // Otherwise try to parse as JSON
            try {
                response = JSON.parse(response);
            } catch (e) {
                // Bad json
                return "Oops! OpenAI's server took an arrow to the knee. Mind trying that prompt again?";
            }
        }
        ({ chat_response, execute_command } = response);
        console.log('Chat Response:', chat_response);
        console.log('Execute Command:', execute_command);
        
        if (chat_response === undefined || execute_command === undefined) {
            return "Oops! OpenAI's server took an arrow to the knee. Mind trying that prompt again?";
        }
        
        if (execute_command && !execute_command.startsWith('!') && !execute_command.startsWith('/')) {
            execute_command = '!' + execute_command;
        }
        
        return (chat_response || "On it.") + " " + execute_command;
    }

    async promptMemSaving(prev_mem, to_summarize) {
        let prompt = this.profile.saving_memory;
        prompt = await this.replaceStrings(prompt, null, null, prev_mem, to_summarize);
        return await this.proxy.sendRequest([], prompt, '***', true);
    }
}