import { GameEventDrivenPrompter, GAME_EVENT_DRIVEN_RESPONSE_SCHEMA } from './gameEventDrivenPrompter.js';
import { FailureHandlerPrompter, FAILURE_HANDLER_RESPONSE_SCHEMA, FAILURE_HANDLER_SYSTEM_PROMPT } from './failureHandlerPrompter.js';

export const PROMPTER_REGISTRY = {
    gameEventDriven: GameEventDrivenPrompter,
    failureHandler: FailureHandlerPrompter
};

export function createPrompter(type, agent, options = {}) {
    const Prompter = PROMPTER_REGISTRY[type];
    if (!Prompter) {
        throw new Error(`Unknown prompter type: ${type}`);
    }
    return new Prompter(agent, options);
}

export {
    GameEventDrivenPrompter,
    GAME_EVENT_DRIVEN_RESPONSE_SCHEMA,
    FailureHandlerPrompter,
    FAILURE_HANDLER_RESPONSE_SCHEMA,
    FAILURE_HANDLER_SYSTEM_PROMPT
};

