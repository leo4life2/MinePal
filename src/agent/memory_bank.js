export class MemoryBank {
	constructor() {
		this.memory = {};
	}

	rememberPlace(name, x, y, z) {
		this.memory[name] = [x, y, z];
	}

	recallPlace(name) {
		return this.memory[name];
	}

	getJson() {
		return this.memory
	}

	loadJson(json) {
		this.memory = json;
	}

	getKeys() {
		return Object.keys(this.memory).join(', ')
	}

	renamePlace(oldName, newName) {
		if (this.memory[oldName]) {
			this.memory[newName] = this.memory[oldName];
			delete this.memory[oldName];
		}
	}

	deletePlace(name) {
		if (this.memory[name]) {
			delete this.memory[name];
			return `Location "${name}" has been deleted.`;
		} else {
			return `Location "${name}" does not exist.`;
		}
	}
}