import { GameEventDrivenPrompter, GAME_EVENT_DRIVEN_RESPONSE_SCHEMA } from './gameEventDrivenPrompter.js';
import { FailureDecomposerPrompter, FAILURE_DECOMPOSER_RESPONSE_SCHEMA, FAILURE_DECOMPOSER_SYSTEM_PROMPT } from './failureDecomposerPrompter.js';
import { NLDecomposerPrompter, NL_DECOMPOSER_RESPONSE_SCHEMA, NL_DECOMPOSER_SYSTEM_PROMPT } from './nlDecomposerPrompter.js';

export const PROMPTER_REGISTRY = {
    gameEventDriven: GameEventDrivenPrompter,
    failureDecomposer: FailureDecomposerPrompter,
    nlDecomposer: NLDecomposerPrompter
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
    FailureDecomposerPrompter,
    FAILURE_DECOMPOSER_RESPONSE_SCHEMA,
    FAILURE_DECOMPOSER_SYSTEM_PROMPT,
    NLDecomposerPrompter,
    NL_DECOMPOSER_RESPONSE_SCHEMA,
    NL_DECOMPOSER_SYSTEM_PROMPT
};

