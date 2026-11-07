import './setup';
import type { Command } from '@/core/commands/command';
import { apply } from '@/core/commands/apply';
import { planAddColumn } from '@/core/commands/plan-column';
import { planLink } from '@/core/commands/plan-link';
import {
    createEntityParts,
    createMemo,
    createRegion,
} from '@/core/model/defaults';
import type { DatabaseType } from '@/core/model/database';
import type { Design } from '@/core/model/design';
import type { Id } from '@/core/model/id';
import { blank, NOW, rng } from '@/core/testing/helpers';

export interface Shop {
    design: Design;
    users: Id;
    orders: Id;
    items: Id;
    userKey: Id;
    orderUser: Id;
    link: Id;
}

function run(design: Design, command: Command): Design {
    const result = apply(design, command, { now: NOW });
    if (!result.ok) throw new Error(result.message);
    return result.design;
}

/**
 * users(id), orders(id, user_id), items(id) and one link orders.user_id ->
 * users.id. The tables sit at known positions, 300 apart.
 */
export function shop(databaseType: DatabaseType = 'postgresql'): Shop {
    const random = rng(5);
    let design = blank(databaseType);
    const make = (name: string, x: number, y: number) => {
        const parts = createEntityParts(design, {
            name,
            x,
            y,
            now: NOW,
            random,
        });
        design = run(design, { type: 'entity.insert', parts });
        return parts.entity.id;
    };
    const users = make('users', 0, 0);
    const orders = make('orders', 300, 0);
    const items = make('items', 600, 0);
    const add = planAddColumn(design, orders, {
        name: 'user_id',
        now: NOW,
        random,
    });
    if (!add || add.type !== 'part.insert') throw new Error('no column');
    design = run(design, add);
    const orderUser = add.item.id;
    const userKey = design.entities.byId[users].columnIds[0];
    const plan = planLink(
        design,
        { entityId: users, columnId: userKey },
        { entityId: orders, columnId: orderUser },
        { now: NOW, random }
    );
    if (plan.kind !== 'ok') throw new Error('no link');
    design = run(design, plan.command);
    return {
        design,
        users,
        orders,
        items,
        userKey,
        orderUser,
        link: plan.link.id,
    };
}

/** Adds `count` plain columns to a table. */
export function withColumns(
    design: Design,
    entityId: Id,
    count: number
): Design {
    let next = design;
    for (let i = 0; i < count; i++) {
        const add = planAddColumn(next, entityId, {
            name: `extra_${i + 1}`,
            now: NOW,
            random: rng(1000 + i),
        });
        if (add) next = run(next, add);
    }
    return next;
}

export function withRegion(
    design: Design,
    box: { x: number; y: number; width: number; height: number },
    label = 'Area'
): { design: Design; regionId: Id } {
    const region = createRegion(design, { label, box, random: rng(77) });
    return {
        design: run(design, {
            type: 'item.insert',
            collection: 'regions',
            item: region,
        }),
        regionId: region.id,
    };
}

export function withMemo(
    design: Design,
    body = ''
): { design: Design; memoId: Id } {
    const memo = createMemo({ body, random: rng(78) });
    return {
        design: run(design, {
            type: 'item.insert',
            collection: 'memos',
            item: memo,
        }),
        memoId: memo.id,
    };
}

export { run as applyTo };
