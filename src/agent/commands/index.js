import { actionsList } from './actions.js';
import { queryList } from './queries.js';


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
        if (!paramDesc.toLowerCase().includes('(optional)')) {
            requiredCount++;
        }
    }
    return requiredCount;
}

export async function executeCommand(agent, message) {
    let parsed = parseCommandMessage(message);
    if (parsed) {
        const command = getCommand(parsed.commandName);
        console.log('Executing command:', command.name);
        console.log('Agent:', agent.name);
        console.log('Arguments:', JSON.stringify(parsed.args, null, 2));

        try {
            // Use spread syntax; JS handles default parameters
            return await command.perform(agent, ...parsed.args);
        } catch (error) {
            console.error(`Error executing command ${command.name}:`, error);
            // Return a generic error message to the agent history
            return `Error executing command ${command.name}: ${error.message}. Please check arguments.`;
        }
    } else
        return `Command is incorrectly formatted`;
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
