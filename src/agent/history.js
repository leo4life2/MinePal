import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import { join } from 'path';
import { readFileSync, existsSync, unlinkSync } from 'fs';

export class History {
    constructor(agent) {
        this.agent = agent;
        this.name = agent.name;
        this.memory_fp = `${this.agent.userDataDir}/bots/${this.name}/memory.json`;
        this.turns = [];

        // These define an agent's long term memory
        this.memory = '';

        // Variables for controlling the agent's memory and knowledge
        this.max_messages = 30;
    }

    async initDB() {
        const file = join(this.agent.userDataDir, 'bots', this.name, 'lowdb.json');
        const defaultData = { memory: '', turns: [], modes: {}, memory_bank: {} };
        const adapter = new JSONFile(file);
        this.db = new Low(adapter, defaultData);

        await this.db.read();

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

        // Summarize older turns into memory
        if (this.turns.length >= this.max_messages) {
            let to_summarize = [this.turns.shift()];
            while (this.turns[0].role != 'user' && this.turns.length > 1)
                to_summarize.push(this.turns.shift());
            await this.storeMemories(to_summarize);
        }
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
}