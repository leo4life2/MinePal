"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TemporarySubscriber = void 0;
class Subscription {
    constructor(eventName, callback) {
        this.eventName = eventName;
        this.callback = callback;
    }
}
class TemporarySubscriber {
    constructor(bot) {
        this.bot = bot;
        this.subscriptions = [];
    }
    /**
     * Adds a new temporary event listener to the bot.
     *
     * @param event - The event to subscribe to.
     * @param callback - The function to execute.
     */
    subscribeTo(event, callback) {
        this.subscriptions.push(new Subscription(event, callback));
        // @ts-expect-error
        this.bot.on(event, callback);
    }
    /**
     * Removes all attached event listeners from the bot.
     */
    cleanup() {
        for (const sub of this.subscriptions) {
            // @ts-expect-error
            this.bot.removeListener(sub.eventName, sub.callback);
        }
    }
}
exports.TemporarySubscriber = TemporarySubscriber;
