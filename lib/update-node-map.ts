import { Json } from "@ark/util";
import type { ScopeEvent } from "../scope/protocol.ts";
import { reduce } from "./reduce.ts";
import type { Stream } from "effection";

/**
 * A function that transforms one stream into another
 */
export type Transform<A, B> = <TClose>(input: Stream<A, TClose>) => Stream<B, TClose>;

export interface Node {
  id: string;
  parentId?: string;
  data: Record<string, Json>;
}

export type NodeMap = Record<string, Node>;

export function updateNodeMap(initial: NodeMap): Transform<ScopeEvent, NodeMap> {
  return reduce(function* (nodemap, item) {
    if (item.type === "tree") {
      for (let node of item.value) {
        nodemap[node.id] = {
          id: node.id,
          parentId: node.parentId,
          data: node.data,
        };
      }
    }
    if (item.type === "created") {
      nodemap[item.id] = {
        id: item.id,
        parentId: item.parentId,
        data: {},
      };
    }
    if (item.type === "destroyed") {
      delete nodemap[item.id];
    }
    if (item.type === "set") {
      nodemap[item.id].data[item.contextName] = item.contextValue;
    }
    return nodemap;
  }, initial);
}
