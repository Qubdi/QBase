import type { EdgeTypes } from '@xyflow/react';
import { LinkLine } from './link-edge';

/** Lines between tables, by the `type` the flow model gives them. */
export const edgeTypes: EdgeTypes = {
    link: LinkLine,
};
