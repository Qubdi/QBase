import type { EdgeTypes } from '@xyflow/react';
import { DependencyLine } from './dependency-edge';
import { LinkLine } from './link-edge';

/** Lines between tables, by the `type` the flow model gives them. */
export const edgeTypes: EdgeTypes = {
    link: LinkLine,
    dependency: DependencyLine,
};
