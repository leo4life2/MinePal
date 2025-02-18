import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import { join } from 'path';
import { readFileSync, existsSync, unlinkSync } from 'fs';
import { LocalIndex } from 'vectra';

export class History {
    constructor(agent) {
        this.agent = agent;
        this.name = agent.name;
        this.memory_fp = `${this.agent.userDataDir}/bots/${this.name}/memory.json`;
        this.turns = [];

        // These define an agent's long term memory (deprecate soon)
        this.memory = '';

        // New LTM
        this.index = new LocalIndex(join(this.agent.userDataDir, 'bots', this.name, 'index'));

        // Variables for controlling the agent's memory and knowledge
        this.max_messages = 30;
    }

    async initDB() {
        // LowDB storage
        const file = join(this.agent.userDataDir, 'bots', this.name, 'lowdb.json');
        const defaultData = { memory: '', turns: [], modes: {}, memory_bank: {} };
        const adapter = new JSONFile(file);
        this.db = new Low(adapter, defaultData);
        await this.db.read();

        // VectorDB
        if (!(await this.index.isIndexCreated())) {
            await this.index.createIndex();
        }

        // This can probably get removed in a few versions, i don't think anyone will still be running the old memory.json anymore.
        // Check if memory.json exists and LowDB is empty
        if (existsSync(this.memory_fp) && this.db.data.memory === '' && this.db.data.turns.length === 0) {
            try {
                const data = readFileSync(this.memory_fp, 'utf8');
                const obj = JSON.parse(data);
                this.db.data.memory = obj.memory;
                this.db.data.turns = obj.turns;
                if (obj.modes) this.db.data.modes = obj.modes;
                if (obj.memory_bank) this.db.data.memory_bank = obj.memory_bank;
                await this.db.write();
                unlinkSync(this.memory_fp); // Delete the old memory.json file
            } catch (err) {
                console.error(`Error reading ${this.name}'s memory file: ${err.message}`);
            }
        }

        this.memory = this.db.data.memory;
        this.turns = this.db.data.turns;
        if (this.db.data.modes) this.agent.bot.modes.loadJson(this.db.data.modes);
        if (this.db.data.memory_bank) this.agent.memory_bank.loadJson(this.db.data.memory_bank);
    }

    getHistory() { // expects an Examples object
        return JSON.parse(JSON.stringify(this.turns));
    }

    async storeMemories(turns) {
        console.log(`Process ${process.pid}: Storing memories...`);
        this.memory = await this.agent.prompter.promptMemSaving(this.getHistory(), turns);
        console.log(`Process ${process.pid}: Memory updated to: `, this.memory);
    }

    async add(name, content) {
        let role = 'assistant';
        if (name === 'system') {
            role = 'system';
        }
        else if (name !== this.name) {
            role = 'user';
            content = `${name}: ${content}`;
        }
        this.turns.push({role, content});

        // When we hit max messages, summarize all turns and store in vector DB
        if (this.turns.length >= this.max_messages) {
            // Copy all turns for summarization
            const turnsToSummarize = [...this.turns];
            await this.summarizeTurns(turnsToSummarize);
            
            // Remove oldest 2/3 of messages
            const keepCount = Math.floor(this.turns.length / 3);
            this.turns = this.turns.slice(-keepCount);
        }
    }

    async summarizeTurns(turns) {
        console.log(`Process ${process.pid}: Summarizing conversation chunk...`);
        const summary = await this.agent.prompter.promptMemSaving(this.getHistory(), turns);
        console.log(`Process ${process.pid}: Chunk summarized as: `, summary);
        
        // Store the summary in vector DB
        await this.insertMemory(summary);
        return summary;
    }

    async save() {
        this.db.data.memory = this.memory;
        this.db.data.turns = this.turns;
        
        // Save agent.bot.modes and memory_bank
        this.db.data.modes = this.agent.bot.modes.getJson();
        this.db.data.memory_bank = this.agent.memory_bank.getJson();
        
        await this.db.write();
    }

    async load() {
        await this.initDB();
    }

    clear() {
        this.turns = [];
        this.memory = '';
        this.save();
    }

    async insertMemory(text) {
        try {
            const vector = await this.agent.prompter.chat_model.embed(text);
            await this.index.insertItem({
                vector: vector,
                metadata: { text: text }
            });
            return true;
        } catch (err) {
            console.error('Failed to insert memory:', err);
            return false;
        }
    }

    async searchRelevant(text, k = 4) {
        try {
            const vector = await this.agent.prompter.chat_model.embed(text);
            const results = await this.index.queryItems(vector, k);
            return results.map(result => ({
                text: result.item.metadata.text,
                score: result.score
            }));
        } catch (err) {
            console.error('Failed to search memories:', err);
            return [];
        }
    }

    async deleteMemory(text) {
        try {
            const vector = await this.agent.prompter.chat_model.embed(text);
            const results = await this.index.queryItems(vector, 1);
            if (results.length > 0 && results[0].score > 0.95) {  // Only delete if very similar
                await this.index.deleteItems([results[0].item.id]);
                return true;
            }
            return false;
        } catch (err) {
            console.error('Failed to delete memory:', err);
            return false;
        }
    }
}