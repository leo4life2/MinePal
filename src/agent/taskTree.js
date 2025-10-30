const VALID_KINDS = new Set(['NL', 'Action']);
const VALID_STATUS = new Set(['pending', 'running', 'succeeded', 'failed']);
const VALID_POLICY = new Set(['sequence', 'selector']);

const DEFAULT_VERSION = 1;
const DEFAULT_POLICY = 'sequence';

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const omitUndefined = (source) => {
    const target = {};
    for (const [key, value] of Object.entries(source)) {
        if (value === undefined) continue;
        target[key] = value;
    }
    return target;
};

const isEmptyObject = (value) => isObject(value) && Object.keys(value).length === 0;

const nowMs = () => Date.now();

function assertString(value, message) {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new Error(message);
    }
}

function assertEnum(value, allowed, message) {
    if (!allowed.has(value)) {
        throw new Error(message);
    }
}

export class BaseNode {
    constructor({
        id,
        kind,
        label,
        status = 'pending',
        parentId,
        notes,
        meta,
        createdAt,
        updatedAt
    }) {
        if (new.target === BaseNode) {
            throw new Error('BaseNode is abstract and cannot be instantiated directly');
        }
        assertString(id, 'BaseNode id must be a non-empty string');
        assertEnum(kind, VALID_KINDS, `BaseNode kind must be one of ${Array.from(VALID_KINDS).join(', ')}`);
        assertString(label, 'BaseNode label must be a non-empty string');
        assertEnum(status, VALID_STATUS, `BaseNode status must be one of ${Array.from(VALID_STATUS).join(', ')}`);

        this.id = id;
        this.kind = kind;
        this.label = label;
        this.status = status;

        if (parentId !== undefined) {
            assertString(parentId, 'BaseNode parentId, when provided, must be a non-empty string');
            this.parentId = parentId;
        }

        if (notes !== undefined) {
            if (typeof notes !== 'string') {
                throw new Error('BaseNode notes must be a string when provided');
            }
            this.notes = notes;
        }

        if (meta !== undefined) {
            if (!isObject(meta)) {
                throw new Error('BaseNode meta must be an object when provided');
            }
            this.meta = meta;
        }

        const created = createdAt ?? nowMs();
        this.createdAt = created;
        if (updatedAt !== undefined) {
            this.updatedAt = updatedAt;
        }
    }

    touch() {
        this.updatedAt = nowMs();
    }

    toJSON() {
        return omitUndefined({
            id: this.id,
            kind: this.kind,
            label: this.label,
            status: this.status,
            parentId: this.parentId,
            notes: this.notes,
            meta: isEmptyObject(this.meta) ? undefined : this.meta,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt
        });
    }
}

export class NLNode extends BaseNode {
    constructor({
        id,
        label,
        goalText,
        policy = DEFAULT_POLICY,
        status,
        parentId,
        notes,
        meta,
        createdAt,
        updatedAt,
        children,
        hints
    }) {
        super({ id, kind: 'NL', label, status, parentId, notes, meta, createdAt, updatedAt });
        assertString(goalText, 'NLNode goalText must be a non-empty string');
        assertEnum(policy, VALID_POLICY, `NLNode policy must be one of ${Array.from(VALID_POLICY).join(', ')}`);

        this.goalText = goalText;
        this.policy = policy;
        this.children = Array.isArray(children) ? [...children] : [];

        if (hints !== undefined) {
            if (!isObject(hints)) {
                throw new Error('NLNode hints must be an object when provided');
            }
            this.hints = hints;
        }
    }

    addChildId(childId) {
        if (!this.children.includes(childId)) {
            this.children.push(childId);
        }
    }

    removeChildId(childId) {
        const index = this.children.indexOf(childId);
        if (index >= 0) {
            this.children.splice(index, 1);
        }
    }

    toJSON() {
        const base = super.toJSON();
        return omitUndefined({
            ...base,
            goalText: this.goalText,
            policy: this.policy === DEFAULT_POLICY ? undefined : this.policy,
            children: this.children.length > 0 ? [...this.children] : undefined,
            hints: this.hints
        });
    }
}

export class ActionNode extends BaseNode {
    constructor({
        id,
        label,
        command,
        status,
        parentId,
        notes,
        meta,
        createdAt,
        updatedAt,
        successCheck,
        preconditions,
        children
    }) {
        if (children !== undefined) {
            throw new Error('ActionNode must not define children');
        }
        super({ id, kind: 'Action', label, status, parentId, notes, meta, createdAt, updatedAt });
        assertString(command, 'ActionNode command must be a non-empty string');

        this.command = command;

        if (successCheck !== undefined) {
            if (!isObject(successCheck)) {
                throw new Error('ActionNode successCheck must be an object when provided');
            }
            this.successCheck = successCheck;
        }

        if (preconditions !== undefined) {
            if (!isObject(preconditions)) {
                throw new Error('ActionNode preconditions must be an object when provided');
            }
            this.preconditions = preconditions;
        }
    }

    toJSON() {
        const base = super.toJSON();
        return omitUndefined({
            ...base,
            command: this.command,
            successCheck: this.successCheck,
            preconditions: this.preconditions
        });
    }
}

export class TaskTree {
    constructor({
        treeId,
        version = DEFAULT_VERSION,
        rootId,
        nodes,
        label,
        createdAt,
        updatedAt,
        meta
    }) {
        assertString(treeId, 'TaskTree treeId must be a non-empty string');
        this.treeId = treeId;
        this.version = version;

        if (label !== undefined) {
            assertString(label, 'TaskTree label, when provided, must be a non-empty string');
            this.label = label;
        }

        const created = createdAt ?? nowMs();
        this.createdAt = created;
        this.updatedAt = updatedAt ?? created;

        if (meta !== undefined) {
            if (!isObject(meta)) {
                throw new Error('TaskTree meta must be an object when provided');
            }
            this.meta = meta;
        }

        this.nodes = Object.create(null);
        this.rootId = undefined;

        if (nodes) {
            for (const node of nodes) {
                this.addNode(node, { suppressTouch: true });
            }
        }

        if (rootId !== undefined) {
            this.setRoot(rootId);
        }
    }

    touch() {
        this.updatedAt = nowMs();
    }

    addNode(node, { suppressTouch = false } = {}) {
        if (!(node instanceof BaseNode)) {
            throw new Error('TaskTree.addNode expects a BaseNode instance');
        }
        if (this.nodes[node.id]) {
            throw new Error(`TaskTree already contains a node with id "${node.id}"`);
        }

        this.nodes[node.id] = node;
        if (!suppressTouch) {
            this.touch();
        }
        return node;
    }

    removeNode(nodeId) {
        if (nodeId === this.rootId) {
            throw new Error('TaskTree cannot remove the root node');
        }
        const node = this.getNode(nodeId);
        if (!node) return false;

        if (node.parentId) {
            const parent = this.getNode(node.parentId);
            if (parent instanceof NLNode) {
                parent.removeChildId(node.id);
            }
        }

        delete this.nodes[node.id];
        this.touch();
        return true;
    }

    setRoot(rootId) {
        const node = this.getNode(rootId);
        if (!node) {
            throw new Error(`TaskTree rootId must reference an existing node, but "${rootId}" was not found`);
        }
        if (!(node instanceof NLNode)) {
            throw new Error('TaskTree root must be an NLNode');
        }
        if (node.parentId !== undefined) {
            throw new Error('TaskTree root node cannot have a parentId');
        }
        this.rootId = node.id;
        this.touch();
    }

    getNode(nodeId) {
        return this.nodes[nodeId];
    }

    getChildren(nodeId) {
        const node = this.getNode(nodeId);
        if (!(node instanceof NLNode)) {
            return [];
        }
        return node.children.map((childId) => this.getNode(childId)).filter(Boolean);
    }

    getAncestors(nodeId) {
        const ancestors = [];
        let current = this.getNode(nodeId);
        while (current && current.parentId) {
            const parent = this.getNode(current.parentId);
            if (!parent) break;
            ancestors.push(parent);
            current = parent;
            if (ancestors.length > Object.keys(this.nodes).length) {
                // Safety guard against malformed cycles.
                break;
            }
        }
        return ancestors.reverse();
    }

    attachChild(parentId, childId) {
        const parent = this.getNode(parentId);
        if (!parent) {
            throw new Error(`attachChild failed: parent node "${parentId}" not found`);
        }
        if (!(parent instanceof NLNode)) {
            throw new Error('attachChild failed: parent must be an NLNode');
        }

        const child = this.getNode(childId);
        if (!child) {
            throw new Error(`attachChild failed: child node "${childId}" not found`);
        }

        if (child.id === parent.id) {
            throw new Error('attachChild failed: node cannot be attached to itself');
        }

        if (this.getAncestors(parentId).some((ancestor) => ancestor.id === child.id)) {
            throw new Error('attachChild failed: would create a cycle');
        }

        if (child.parentId) {
            const previousParent = this.getNode(child.parentId);
            if (previousParent instanceof NLNode) {
                previousParent.removeChildId(child.id);
            }
        }

        child.parentId = parent.id;
        child.touch();
        parent.addChildId(child.id);
        parent.touch();
        this.touch();
    }

    setStatus(nodeId, status) {
        assertEnum(status, VALID_STATUS, `setStatus status must be one of ${Array.from(VALID_STATUS).join(', ')}`);
        const node = this.getNode(nodeId);
        if (!node) {
            throw new Error(`setStatus failed: node "${nodeId}" not found`);
        }
        node.status = status;
        node.touch();
        this.touch();
    }

    setLabel(nodeId, label) {
        assertString(label, 'setLabel label must be a non-empty string');
        const node = this.getNode(nodeId);
        if (!node) {
            throw new Error(`setLabel failed: node "${nodeId}" not found`);
        }
        node.label = label;
        node.touch();
        this.touch();
    }

    serialize() {
        if (!this.rootId) {
            throw new Error('TaskTree cannot serialize without a rootId');
        }

        const payload = omitUndefined({
            treeId: this.treeId,
            version: this.version,
            rootId: this.rootId,
            label: this.label,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
            meta: isEmptyObject(this.meta) ? undefined : this.meta
        });

        payload.nodes = {};
        for (const node of Object.values(this.nodes)) {
            payload.nodes[node.id] = node.toJSON();
        }

        return JSON.stringify(payload, null, 2);
    }

    validate() {
        const errors = [];

        if (!this.rootId) {
            errors.push('TaskTree rootId is not defined');
        }

        const rootNode = this.rootId ? this.getNode(this.rootId) : undefined;
        if (!rootNode) {
            errors.push(`TaskTree root node "${this.rootId}" does not exist`);
        } else {
            if (!(rootNode instanceof NLNode)) {
                errors.push('Root node must be an NLNode');
            }
            if (rootNode.parentId !== undefined) {
                errors.push('Root node must not declare a parentId');
            }
        }

        for (const node of Object.values(this.nodes)) {
            if (!VALID_STATUS.has(node.status)) {
                errors.push(`Node "${node.id}" has invalid status "${node.status}"`);
            }

            if (node instanceof NLNode) {
                for (const childId of node.children) {
                    const child = this.getNode(childId);
                    if (!child) {
                        errors.push(`NLNode "${node.id}" references missing child "${childId}"`);
                        continue;
                    }
                    if (child.parentId !== node.id) {
                        errors.push(`Child "${childId}" of parent "${node.id}" must declare parentId = "${node.id}"`);
                    }
                }
            }

            if (node instanceof ActionNode) {
                if (!node.command) {
                    errors.push(`ActionNode "${node.id}" must define a command`);
                }
                if (node.id === this.rootId) {
                    errors.push('ActionNode cannot be the root');
                }
            }

            if (node.parentId !== undefined) {
                const parent = this.getNode(node.parentId);
                if (!parent) {
                    errors.push(`Node "${node.id}" references missing parent "${node.parentId}"`);
                } else if (!(parent instanceof NLNode)) {
                    errors.push(`Node "${node.id}" references parent "${node.parentId}" that is not an NLNode`);
                } else if (!parent.children.includes(node.id)) {
                    errors.push(`Parent "${node.parentId}" must list "${node.id}" as a child`);
                }
            } else if (node.id !== this.rootId) {
                errors.push(`Non-root node "${node.id}" must declare a parentId`);
            }
        }

        const visited = new Set();
        const stack = new Set();

        const detectCycle = (nodeId) => {
            if (stack.has(nodeId)) {
                return true;
            }
            if (visited.has(nodeId)) {
                return false;
            }

            visited.add(nodeId);
            stack.add(nodeId);

            const node = this.getNode(nodeId);
            if (node instanceof NLNode) {
                for (const childId of node.children) {
                    if (!this.nodes[childId]) continue;
                    if (detectCycle(childId)) {
                        return true;
                    }
                }
            }

            stack.delete(nodeId);
            return false;
        };

        if (this.rootId && detectCycle(this.rootId)) {
            errors.push('TaskTree contains a cycle');
        }

        return errors.length === 0 ? { ok: true } : { ok: false, errors };
    }

    static deserialize(json) {
        let parsed;
        try {
            parsed = JSON.parse(json);
        } catch (error) {
            throw new Error('TaskTree.deserialize received invalid JSON');
        }

        const {
            treeId,
            version,
            rootId,
            label,
            createdAt,
            updatedAt,
            meta,
            nodes: rawNodes
        } = parsed;

        if (!rawNodes || typeof rawNodes !== 'object') {
            throw new Error('TaskTree.deserialize expects a nodes object');
        }

        const nodes = [];
        for (const [nodeId, nodeData] of Object.entries(rawNodes)) {
            if (!nodeData || typeof nodeData !== 'object') {
                throw new Error(`TaskTree.deserialize expected node "${nodeId}" to be an object`);
            }

            const data = { id: nodeId, ...nodeData };
            let node;
            if (data.kind === 'NL') {
                node = new NLNode(data);
            } else if (data.kind === 'Action') {
                node = new ActionNode(data);
            } else {
                throw new Error(`TaskTree.deserialize encountered unknown node kind for "${nodeId}"`);
            }
            nodes.push(node);
        }

        const tree = new TaskTree({ treeId, version, label, createdAt, updatedAt, meta, nodes });
        if (rootId === undefined) {
            throw new Error('TaskTree.deserialize requires rootId');
        }
        tree.rootId = rootId;

        const validation = tree.validate();
        if (!validation.ok) {
            throw new Error(`TaskTree.deserialize produced an invalid tree: ${validation.errors.join('; ')}`);
        }

        return tree;
    }
}

export function createTree(init) {
    if (!init || typeof init !== 'object') {
        throw new Error('createTree requires an init object');
    }

    const { treeId, label } = init;
    assertString(treeId, 'createTree requires a non-empty treeId');
    if (label !== undefined) {
        assertString(label, 'createTree label, when provided, must be a non-empty string');
    }

    const tree = new TaskTree({ treeId, label });
    const rootNode = createNLNode({
        id: 'root',
        label: label ?? 'Root',
        goalText: label ?? 'root goal'
    });

    tree.addNode(rootNode);
    tree.setRoot(rootNode.id);
    return tree;
}

export function createNLNode(init) {
    if (!init || typeof init !== 'object') {
        throw new Error('createNLNode requires an init object');
    }

    const { id, label, goalText, policy } = init;
    return new NLNode({
        id,
        label,
        goalText,
        policy,
        status: init.status ?? 'pending',
        notes: init.notes,
        meta: init.meta,
        hints: init.hints
    });
}

export function createActionNode(init) {
    if (!init || typeof init !== 'object') {
        throw new Error('createActionNode requires an init object');
    }

    const { id, label, command } = init;
    return new ActionNode({
        id,
        label,
        command,
        status: init.status ?? 'pending',
        notes: init.notes,
        meta: init.meta,
        successCheck: init.successCheck,
        preconditions: init.preconditions
    });
}

export default TaskTree;

