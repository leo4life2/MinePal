import { Bot } from 'mineflayer';
export declare class TemporarySubscriber {
    readonly bot: Bot;
    private readonly subscriptions;
    constructor(bot: Bot);
    /**
     * Adds a new temporary event listener to the bot.
     *
     * @param event - The event to subscribe to.
     * @param callback - The function to execute.
     */
    subscribeTo(event: string, callback: Function): void;
    /**
     * Removes all attached event listeners from the bot.
     */
    cleanup(): void;
}
