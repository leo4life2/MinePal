import { actionsList } from './actions.js';
import { queryList } from './queries.js';
import axios from 'axios'; // Add axios for logging


const commandList = queryList.concat(actionsList);
const commandMap = {};
for (let command of commandList) {
    commandMap[command.name] = command;
}

export function getCommand(name) {
    return commandMap[name];
}

const commandRegex = /!(\w+)(?:\(((?:[^)(]+|'[^']*'|"[^"]*")*)\))?/
const argRegex = /(?:"[^"]*"|'[^']*'|[^,])+/g;

export function containsCommand(message) {
    const commandMatch = message.match(commandRegex);
    if (commandMatch)
        return "!" + commandMatch[1];
    return null;
}

export function commandExists(commandName) {
    if (!commandName.startsWith("!"))
        commandName = "!" + commandName;
    return commandMap[commandName] !== undefined;
}

// todo: handle arrays?
function parseCommandMessage(message) {
    const commandMatch = message.match(commandRegex);
    if (commandMatch) {
        const commandName = "!"+commandMatch[1];
        if (!commandMatch[2])
            return { commandName, args: [] };
        let args = commandMatch[2].match(argRegex);
        if (args) {
            for (let i = 0; i < args.length; i++) {
                args[i] = args[i].trim();
            }

            for (let i = 0; i < args.length; i++) {
                let arg = args[i];
                if ((arg.startsWith('"') && arg.endsWith('"')) || (arg.startsWith("'") && arg.endsWith("'"))) {
                    args[i] = arg.substring(1, arg.length-1);
                } else if (!isNaN(arg)) {
                    args[i] = Number(arg);
                } else if (arg === 'true' || arg === 'false') {
                    args[i] = arg === 'true';
                }
            }
        }
        else
            args = [];

        return { commandName, args };
    }
    return null;
}

export function truncCommandMessage(message) {
    const commandMatch = message.match(commandRegex);
    if (commandMatch) {
        return message.substring(0, commandMatch.index + commandMatch[0].length);
    }
    return message;
}

// Helper function to count required parameters (those not marked as optional)
function numRequiredParams(command) {
    if (!command.params) return 0;
    let requiredCount = 0;
    for (const paramDesc of Object.values(command.params)) {
        if (!paramDesc.toLowerCase().includes('optional)')) {
            requiredCount++;
        }
    }
    return requiredCount;
}

export async function executeCommand(agent, message) {
    let parsed = parseCommandMessage(message);
    if (parsed) {
        const command = getCommand(parsed.commandName);
        
        // Validate that the command exists
        if (!command) {
            return `Command ${parsed.commandName} does not exist`;
        }
        
        console.log('Executing command:', command.name);
        console.log('Agent:', agent.name);
        console.log('Arguments:', JSON.stringify(parsed.args, null, 2));

        // Validate argument count
        const requiredParams = numRequiredParams(command);
        const providedArgs = parsed.args.length;
        
        // Get total param count (required + optional)
        const totalParams = command.params ? Object.keys(command.params).length : 0;
        
        // Check if we have too few arguments (less than required)
        if (providedArgs < requiredParams) {
            const paramNames = command.params ? Object.keys(command.params) : [];
            const paramDescriptions = paramNames.map(name => `${name}: ${command.params[name]}`).join('\n  ');
            return `Command ${command.name} requires ${requiredParams} argument(s) but got ${providedArgs}. ` +
                   `Expected format: ${command.name}(${paramNames.join(', ')})\n` +
                   `Parameters:\n  ${paramDescriptions}`;
        }
        
        // Check if we have too many arguments
        if (providedArgs > totalParams) {
            const paramNames = command.params ? Object.keys(command.params) : [];
            return `Command ${command.name} accepts at most ${totalParams} argument(s) but got ${providedArgs}. ` +
                   `Expected format: ${command.name}(${paramNames.join(', ')})`;
        }

        let result;
        let isSuccess = true;
        let failReason = null;
        try {
            // Use spread syntax; JS handles default parameters
            result = await command.perform(agent, ...parsed.args);
            // Check for [ACTION_CRASH] in result string
            if (typeof result === 'string' && result.includes('[ACTION_CRASH]')) {
                isSuccess = false;
                // Extract error message after [ACTION_CRASH]
                const match = result.match(/\[ACTION_CRASH\](.*)/s);
                failReason = match ? match[1].trim() : 'Unknown error';
            }
        } catch (error) {
            console.error(`Error executing command ${command.name}:`, error);
            result = `Error executing command ${command.name}: ${error.message}. Please check arguments.`;
            isSuccess = false;
            failReason = error.message;
        }
        // Log the action event
        try {
            await axios.post('http://localhost:10101/log-action-event', {
                action: message,
                is_success: isSuccess,
                fail_reason: failReason,
                props: null
            });
        } catch (logErr) {
            console.error('[ACTION_EVENT_LOG] Failed to log action event:', logErr?.response?.data || logErr.message);
        }
        return result;
    } else
        return `Command is incorrectly formatted. Commands should be in the format: !commandName(arg1, arg2, ...) or !commandName() for no arguments.`;
}

export function getAllCommands() {
    return commandList.filter(cmd => cmd.callable !== false);
}

export function getCommandDocs() {
    let docs = `\n*COMMAND DOCS\n You can use the following commands to perform actions and get information about the world. 
    Use the commands with the syntax: !commandName or !commandName("arg1", 1.2, ...) if the command takes arguments.\n
    Do not use codeblocks. Only use one command in each response, trailing commands and comments will be ignored.\n`;
    for (let command of commandList) {
        if (command.callable !== false) {
            docs += command.name + ': ' + command.description + '\n';
            if (command.params) {
                docs += 'Params:\n';
                for (let param in command.params) {
                    docs += param + ': ' + command.params[param] + '\n';
                }
            }
        }
    }
    return docs + '*\n';
}
