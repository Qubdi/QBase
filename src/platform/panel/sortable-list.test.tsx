import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { describe, expect, it, vi } from 'vitest';
import { SortableHandle, SortableList, SortableRow } from './sortable-list';

const Row: React.FC<{ id: string; disabled?: boolean }> = ({
    id,
    disabled,
}) => (
    <SortableRow id={id} disabled={disabled} handleLabel={`move ${id}`}>
        <span>{id}</span>
    </SortableRow>
);

describe('SortableList', () => {
    it('tells when a row is picked up and when the drag ends', async () => {
        const onStart = vi.fn();
        const onFinish = vi.fn();
        render(
            <SortableList
                ids={['a', 'b']}
                onMove={vi.fn()}
                onStart={onStart}
                onFinish={onFinish}
            >
                <Row id="a" />
                <Row id="b" />
            </SortableList>
        );
        screen.getByRole('button', { name: 'move b' }).focus();
        await userEvent.keyboard(' ');
        expect(onStart).toHaveBeenCalledExactlyOnceWith('b');
        expect(onFinish).not.toHaveBeenCalled();
        await userEvent.keyboard('{Escape}');
        expect(onFinish).toHaveBeenCalledTimes(1);
    });

    it('moves nothing when a drag is cancelled', async () => {
        const onMove = vi.fn();
        render(
            <SortableList ids={['a', 'b']} onMove={onMove}>
                <Row id="a" />
                <Row id="b" />
            </SortableList>
        );
        screen.getByRole('button', { name: 'move a' }).focus();
        await userEvent.keyboard(' ');
        await userEvent.keyboard('{Escape}');
        expect(onMove).not.toHaveBeenCalled();
    });

    it('offers no handle, and starts nothing, while disabled', () => {
        const onStart = vi.fn();
        render(
            <SortableList
                ids={['a']}
                onMove={vi.fn()}
                onStart={onStart}
                disabled
            >
                <Row id="a" disabled />
            </SortableList>
        );
        expect(screen.queryByRole('button', { name: 'move a' })).toBeNull();
        expect(onStart).not.toHaveBeenCalled();
    });
});

describe('SortableHandle', () => {
    /** the moving element is a card around the handle, as a table row is */
    const Card: React.FC<{ id: string }> = ({ id }) => {
        const {
            setNodeRef,
            setActivatorNodeRef,
            transform,
            transition,
            isDragging,
            attributes,
            listeners,
        } = useSortable({ id });
        return (
            <div
                ref={setNodeRef}
                style={{
                    transform: CSS.Transform.toString(transform),
                    transition,
                }}
                data-testid={`card-${id}`}
                className={isDragging ? 'lifted' : 'resting'}
            >
                <p>{id}</p>
                <SortableHandle
                    label={`grip ${id}`}
                    className="extra-class"
                    activatorRef={setActivatorNodeRef}
                    attributes={attributes}
                    listeners={listeners}
                />
            </div>
        );
    };

    it('lets a card around the handle be the thing that is lifted', async () => {
        render(
            <SortableList ids={['a', 'b']} onMove={vi.fn()}>
                <Card id="a" />
                <Card id="b" />
            </SortableList>
        );
        expect(screen.getByTestId('card-a').className).toBe('resting');
        screen.getByRole('button', { name: 'grip a' }).focus();
        await userEvent.keyboard(' ');
        expect(screen.getByTestId('card-a').className).toBe('lifted');
        expect(screen.getByTestId('card-b').className).toBe('resting');
        await userEvent.keyboard('{Escape}');
        expect(screen.getByTestId('card-a').className).toBe('resting');
    });

    it('is a grip button inside the card, with the classes it is given', () => {
        render(
            <SortableList ids={['a']} onMove={vi.fn()}>
                <Card id="a" />
            </SortableList>
        );
        const grip = screen.getByRole('button', { name: 'grip a' });
        expect(screen.getByTestId('card-a').contains(grip)).toBe(true);
        expect(grip.className).toContain('extra-class');
        expect(grip.className).toContain('cursor-grab');
        expect(grip.getAttribute('type')).toBe('button');
    });
});
