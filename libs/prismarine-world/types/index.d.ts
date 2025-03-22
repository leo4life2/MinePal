import { World } from "./world";

export * as iterators from "./iterators";

// Make public the types related to World, but not the classes
// (since they aren't exported in js)
import type * as world from "./world";
export { world };

export default function loader(mcVersion: string): typeof World;
