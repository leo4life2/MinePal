import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import { join } from 'path';
import { readFileSync, existsSync, unlinkSync } from 'fs';
import { LocalIndex } from 'vectra';

const SHORT_ID_PREFIX = 'MEM-'; // Define prefix for short IDs

export class History {
    constructor(agent) {
        this.agent = agent;
        this.name = agent.name;
        this.memory_fp = `${this.agent.userDataDir}/bots/${this.name}/memory.json`;
        this.turns = [];

        // New LTM
        this.index = new LocalIndex(join(this.agent.userDataDir, 'bots', this.name, 'index'));

        // Variables for controlling the agent's memory and knowledge
        this.max_messages = 30;
    }

    async initDB() {
        // LowDB storage
        const file = join(this.agent.userDataDir, 'bots', this.name, 'lowdb.json');
        const defaultData = { turns: [], modes: {}, memory_bank: {} };
        const adapter = new JSONFile(file);
        this.db = new Low(adapter, defaultData);
        await this.db.read();

        // Initialize short ID map and counter if they don't exist
        this.db.data.shortIdMap = this.db.data.shortIdMap || {};
        this.db.data.shortIdCounter = this.db.data.shortIdCounter || 0;

        // VectorDB
        if (!(await this.index.isIndexCreated())) {
            await this.index.createIndex();
        }

        // Check if memory.json exists and LowDB is empty
        if (existsSync(this.memory_fp) && this.db.data.turns.length === 0) {
            try {
                const data = readFileSync(this.memory_fp, 'utf8');
                const obj = JSON.parse(data);
                this.db.data.turns = obj.turns;
                if (obj.modes) this.db.data.modes = obj.modes;
                if (obj.memory_bank) this.db.data.memory_bank = obj.memory_bank;
                await this.db.write();
                unlinkSync(this.memory_fp); // Delete the old memory.json file
            } catch (err) {
                console.error(`Error reading ${this.name}'s memory file: ${err.message}`);
            }
        }

        this.turns = this.db.data.turns;
        if (this.db.data.modes) this.agent.bot.modes.loadJson(this.db.data.modes);
        if (this.db.data.memory_bank) this.agent.memory_bank.loadJson(this.db.data.memory_bank);

        // Assign map/counter to instance variables for easier access (optional but convenient)
        this.shortIdMap = this.db.data.shortIdMap;
        this.shortIdCounter = this.db.data.shortIdCounter;
    }

    getHistory() { // expects an Examples object
        return JSON.parse(JSON.stringify(this.turns));
    }

    async add(name, content, thought = null, progressAcknowledgement = null) {
        let role = 'user'; // Default to user
        let turnObject = {};

        if (name === 'system') {
            role = 'system';
            turnObject = { role, content };
        } else if (name === this.name) {
            role = 'assistant';
            turnObject = {
                role,
                content: `<${this.name}>: ${content}`,
                thought: thought, // Store thought separately
                current_goal_status: progressAcknowledgement // Store progress acknowledgement separately
            };
            // Filter out null/undefined fields before pushing
            turnObject = Object.fromEntries(Object.entries(turnObject).filter(([_, v]) => v != null));
        } else {
            // role remains 'user'
            turnObject = { role, content: `<${name}>: ${content}` };
        }

        this.turns.push(turnObject);

        // Sliding window truncation
        if (this.turns.length > this.max_messages) {
            this.turns.shift(); // Remove the oldest message
        }
    }

    async save() {
        this.db.data.turns = this.turns;
        
        // Save agent.bot.modes and memory_bank
        this.db.data.modes = this.agent.bot.modes.getJson();
        this.db.data.memory_bank = this.agent.memory_bank.getJson();
        
        // Ensure short ID map and counter are saved
        this.db.data.shortIdMap = this.shortIdMap;
        this.db.data.shortIdCounter = this.shortIdCounter;
        
        await this.db.write();
    }

    async load() {
        await this.initDB();
    }

    clear() {
        this.turns = [];
        // Reset short ID map and counter
        this.shortIdMap = {};
        this.shortIdCounter = 0;
        this.save();
    }

    async insertMemory(text) {
        try {
            // Increment counter and generate short ID
            this.shortIdCounter++;
            const shortId = `${SHORT_ID_PREFIX}${this.shortIdCounter}`;

            const vector = await this.agent.prompter.proxy.embed(text);
            // Insert into Vectra index
            const insertResult = await this.index.insertItem({
                vector: vector,
                metadata: { text: text }
            });

            // Get the full Vectra ID
            const fullId = insertResult.id;

            // Store the mapping
            this.shortIdMap[fullId] = shortId;

            // Save the updated map and counter immediately
            await this.save();

            console.log(`[History] Inserted memory with Short ID: ${shortId} (Full ID: ${fullId})`);
            return true;
        } catch (err) {
            console.error('Failed to insert memory:', err);
            // Rollback counter if insert failed? Consider implications.
            return false;
        }
    }

    async searchRelevant(text, k = 10) {
        try {
            const vector = await this.agent.prompter.proxy.embed(text);
            const results = await this.index.queryItems(vector, k);

            // Map results to include short and full IDs
            const mappedResults = [];
            let changesMade = false; // Flag to track if we need to save

            for (const result of results) {
                const fullId = result.item.id;
                let shortId = this.shortIdMap[fullId];

                // If shortId doesn't exist (legacy memory), assign one
                if (!shortId) {
                    this.shortIdCounter++;
                    shortId = `${SHORT_ID_PREFIX}${this.shortIdCounter}`;
                    this.shortIdMap[fullId] = shortId;
                    changesMade = true; // Mark that we need to save
                    console.log(`[History] Assigned Short ID ${shortId} to legacy memory (Full ID: ${fullId})`);
                }

                mappedResults.push({
                    text: result.item.metadata.text,
                    score: result.score,
                    shortId: shortId,
                    fullId: fullId
                });
            }

            // Save map/counter if any legacy IDs were assigned
            if (changesMade) {
                await this.save();
            }

            return mappedResults;
        } catch (err) {
            console.error('Failed to search memories:', err);
            return [];
        }
    }

    /**
     * Deletes a memory item from the index and the ID map using its short ID.
     * @param {string} shortId - The short ID (e.g., "MEM-123") of the memory to delete.
     * @returns {Promise<boolean>} - True if deletion was successful, false otherwise.
     */
    async deleteMemoryByShortId(shortId) {
        try {
            let fullIdToDelete = null;

            // Find the full ID corresponding to the short ID
            for (const [fullId, sId] of Object.entries(this.shortIdMap)) {
                if (sId === shortId) {
                    fullIdToDelete = fullId;
                    break;
                }
            }

            if (fullIdToDelete) {
                // Delete from Vectra index
                await this.index.deleteItem(fullIdToDelete);

                // Delete from the map
                delete this.shortIdMap[fullIdToDelete];

                // Save the updated map
                await this.save();

                console.log(`[History] Deleted memory with Short ID: ${shortId} (Full ID: ${fullIdToDelete})`);
                return true;
            } else {
                console.warn(`[History] Could not find memory with Short ID: ${shortId} for deletion.`);
                return false;
            }
        } catch (err) {
            console.error(`[History] Failed to delete memory with Short ID ${shortId}:`, err);
            return false;
        }
    }

    /**
     * Updates a memory item: Deletes the old entry and inserts a new one with the updated text,
     * reusing the original short ID but associating it with the new full Vectra ID.
     * @param {string} shortId - The short ID (e.g., "MEM-123") of the memory to update.
     * @param {string} newText - The new text content for the memory.
     * @returns {Promise<boolean>} - True if update was successful, false otherwise.
     */
    async updateMemoryByShortId(shortId, newText) {
        let fullIdToDelete = null;
        // Find the full ID corresponding to the short ID
        for (const [fullId, sId] of Object.entries(this.shortIdMap)) {
            if (sId === shortId) {
                fullIdToDelete = fullId;
                break;
            }
        }

        if (!fullIdToDelete) {
            console.warn(`[History] Could not find memory with Short ID: ${shortId} for update.`);
            return false;
        }

        try {
            // 1. Delete the old item from Vectra
            await this.index.deleteItem(fullIdToDelete);

            // 2. Remove the old mapping (fullId -> shortId)
            delete this.shortIdMap[fullIdToDelete];

            // 3. Embed the new text
            const newVector = await this.agent.prompter.proxy.embed(newText);

            // 4. Insert the new item into Vectra
            const insertResult = await this.index.insertItem({
                vector: newVector,
                metadata: { text: newText }
            });
            const newFullId = insertResult.id; // Get the ID of the *newly* inserted item

            // 5. Add the new mapping (newFullId -> original shortId)
            this.shortIdMap[newFullId] = shortId;

            // 6. Save the updated map
            await this.save();

            console.log(`[History] Updated memory for Short ID: ${shortId} (Old Full ID: ${fullIdToDelete}, New Full ID: ${newFullId})`);
            return true;

        } catch (err) {
            console.error(`[History] Failed to update memory for Short ID ${shortId}:`, err);
            // Attempt to rollback? This is tricky. If deletion worked but insertion failed,
            // the mapping is already gone. If insertion worked but mapping update failed,
            // the short ID points to nothing. Best to just log the error for now.
            return false;
        }
    }
}