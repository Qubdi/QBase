import type { NodeTypes } from '@xyflow/react';
import { EntityCard } from './entity-node';
import { MemoCard } from './memo-node';
import { RegionCard } from './region-node';

/** The kinds of node on the canvas, by the `type` the flow model gives them. */
export const nodeTypes: NodeTypes = {
    entity: EntityCard,
    region: RegionCard,
    memo: MemoCard,
};
