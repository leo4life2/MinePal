import type { Callback } from './index';
export declare type Task = (cb: Callback) => void;
export declare type SyncTask = () => void;
/**
 * A simple utility class for queuing up a series of async tasks to execute.
 */
export declare class TaskQueue {
    private tasks;
    /**
     * If true, the task list will stop executing if one of the tasks throws an error.
     */
    readonly stopOnError: boolean;
    /**
     * Adds a new async task to this queue. The provided callback should be executed when
     * the async task is complete.
     *
     * @param task - The async task to add.
     */
    add(task: Task): void;
    /**
     * Adds a synchronous task toi this queue.
     *
     * @param task - The sync task to add.
     */
    addSync(task: SyncTask): void;
    /**
     * Runs all tasks currently in this queue and empties the queue.
     *
     * @param cb - The optional callback to be executed when all tasks in this queue have
     * finished executing.
     */
    runAll(cb?: Callback): void;
}
