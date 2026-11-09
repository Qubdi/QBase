/**
 * True when `value` nests objects or arrays deeper than `max` levels. A loop
 * with its own stack, not recursion: the point is to refuse input so deep that
 * recursing over it (to hash it, say) would overflow the call stack.
 */
export function exceedsDepth(value: unknown, max: number): boolean {
    const stack: Array<[unknown, number]> = [[value, 1]];
    while (stack.length > 0) {
        const [node, depth] = stack.pop()!;
        if (node === null || typeof node !== 'object') continue;
        if (depth > max) return true;
        const children = Array.isArray(node) ? node : Object.values(node);
        for (const child of children) stack.push([child, depth + 1]);
    }
    return false;
}
