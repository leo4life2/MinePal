import minecraftData from 'minecraft-data';
import { createBot } from 'mineflayer';
import prismarine_items from 'prismarine-item';
import { pathfinder } from 'mineflayer-pathfinder';
import { plugin as pvp } from 'mineflayer-pvp';
import { plugin as collectblock } from 'mineflayer-collectblock';
import { plugin as autoEat } from 'mineflayer-auto-eat';
import plugin from 'mineflayer-armor-manager';
const armorManager = plugin;

class MCData {
    constructor(settings) {
        if (!settings) {
            throw new Error("Settings object is required for initialization");
        }
        this.mcdata = minecraftData(settings.minecraft_version);
        this.Item = prismarine_items(settings.minecraft_version);
        this.settings = settings;
        this.bot = null;
    }

    static getInstance(settings = null) {
        if (!MCData.instance) {
            if (!settings) {
                throw new Error("Settings object is required for the first initialization");
            }
            MCData.instance = new MCData(settings);
        }
        return MCData.instance;
    }

    initBot(name) {
        this.bot = createBot({
            username: name,
            host: this.settings.host,
            port: this.settings.port,
            auth: this.settings.auth,
            version: this.settings.minecraft_version,
        });
        this.bot.loadPlugin(pathfinder);
        this.bot.loadPlugin(pvp);
        this.bot.loadPlugin(collectblock);
        this.bot.loadPlugin(autoEat);
        this.bot.loadPlugin(armorManager); // auto equip armor
        return this.bot;
    }

    isHuntable(mob) {
        if (!mob || !mob.name) return false;
        const animals = ['chicken', 'cow', 'llama', 'mooshroom', 'pig', 'rabbit', 'sheep'];
        return animals.includes(mob.name.toLowerCase()) && !mob.metadata[16]; // metadata 16 is not baby
    }

    isHostile(mob) {
        if (!mob || !mob.name) return false;
        
        const conditionallyHostile = [
            'wolf', 'bee', 'polar_bear', 'llama', 'trader_llama', 
            'panda', 'iron_golem', 'enderman', 'zombified_piglin'
        ];
        
        if (conditionallyHostile.includes(mob.name.toLowerCase())) {
            // These mobs are only hostile under certain conditions
            // For simplicity, we're considering them non-hostile by default
            return false;
        }
        
        return (mob.type === 'mob' || mob.type === 'hostile');
    }

    getItemId(itemName) {
        let item = this.mcdata.itemsByName[itemName];
        if (item) {
            return item.id;
        }
        return null;
    }

    getItemName(itemId) {
        let item = this.mcdata.items[itemId];
        if (item) {
            return item.name;
        }
        return null;
    }

    getBlockId(blockName) {
        let block = this.mcdata.blocksByName[blockName];
        if (block) {
            return block.id;
        }
        return null;
    }

    getBlockName(blockId) {
        let block = this.mcdata.blocks[blockId];
        if (block) {
            return block.name;
        }
        return null;
    }

    getAllItems(ignore = []) {
        let items = [];
        for (const itemId in this.mcdata.items) {
            const item = this.mcdata.items[itemId];
            if (!ignore.includes(item.name)) {
                items.push(item);
            }
        }
        return items;
    }

    getAllItemIds(ignore) {
        const items = this.getAllItems(ignore);
        let itemIds = [];
        for (const item of items) {
            itemIds.push(item.id);
        }
        return itemIds;
    }

    getAllBlocks(ignore = []) {
        let blocks = [];
        for (const blockId in this.mcdata.blocks) {
            const block = this.mcdata.blocks[blockId];
            if (!ignore.includes(block.name)) {
                blocks.push(block);
            }
        }
        return blocks;
    }

    getAllBlockIds(ignore) {
        const blocks = this.getAllBlocks(ignore);
        let blockIds = [];
        for (const block of blocks) {
            blockIds.push(block.id);
        }
        return blockIds;
    }

    getAllBiomes() {
        return this.mcdata.biomes;
    }

    getItemCraftingRecipes(itemName) {
        let itemId = this.getItemId(itemName);
        if (!this.mcdata.recipes[itemId]) {
            return null;
        }

        let recipes = [];
        for (let r of this.mcdata.recipes[itemId]) {
            let recipe = {};
            let ingredients = [];
            if (r.ingredients) {
                ingredients = r.ingredients;
            } else if (r.inShape) {
                ingredients = r.inShape.flat();
            }
            for (let ingredient of ingredients) {
                let ingredientName = this.getItemName(ingredient);
                if (ingredientName === null) continue;
                if (!recipe[ingredientName])
                    recipe[ingredientName] = 0;
                recipe[ingredientName]++;
            }
            recipes.push(recipe);
        }

        return recipes;
    }

    getItemSmeltingIngredient(itemName) {
        return {
            baked_potato: 'potato',
            steak: 'raw_beef',
            cooked_chicken: 'raw_chicken',
            cooked_cod: 'raw_cod',
            cooked_mutton: 'raw_mutton',
            cooked_porkchop: 'raw_porkchop',
            cooked_rabbit: 'raw_rabbit',
            cooked_salmon: 'raw_salmon',
            dried_kelp: 'kelp',
            iron_ingot: 'raw_iron',
            gold_ingot: 'raw_gold',
            copper_ingot: 'raw_copper',
            glass: 'sand'
        }[itemName];
    }

    getItemBlockSources(itemName) {
        let itemId = this.getItemId(itemName);
        let sources = [];
        for (let block of this.getAllBlocks()) {
            if (block.drops.includes(itemId)) {
                sources.push(block.name);
            }
        }
        return sources;
    }

    getItemAnimalSource(itemName) {
        return {
            raw_beef: 'cow',
            raw_chicken: 'chicken',
            raw_cod: 'cod',
            raw_mutton: 'sheep',
            raw_porkchop: 'pig',
            raw_rabbit: 'rabbit',
            raw_salmon: 'salmon',
            leather: 'cow',
            wool: 'sheep'
        }[itemName];
    }

    getBlockTool(blockName) {
        let block = this.mcdata.blocksByName[blockName];
        if (!block || !block.harvestTools) {
            return null;
        }
        return this.getItemName(Object.keys(block.harvestTools)[0]);  // Double check first tool is always simplest
    }

    makeItem(name, amount = 1) {
        return new this.Item(this.getItemId(name), amount);
    }
}

export default MCData;

export const WOOD_TYPES = ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak'];
export const MATCHING_WOOD_BLOCKS = [
    'log',
    'planks',
    'sign',
    'boat',
    'fence_gate',
    'door',
    'fence',
    'slab',
    'stairs',
    'button',
    'pressure_plate',
    'trapdoor'
]
export const WOOL_COLORS = [
    'white',
    'orange',
    'magenta',
    'light_blue',
    'yellow',
    'lime',
    'pink',
    'gray',
    'light_gray',
    'cyan',
    'purple',
    'blue',
    'brown',
    'green',
    'red',
    'black'
]