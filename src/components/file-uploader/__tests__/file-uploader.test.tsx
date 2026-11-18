import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FileUploader } from '../file-uploader';

const file = (name = 'diagram.json') =>
    new File(['{}'], name, { type: 'application/json' });

const show = (
    props: Partial<React.ComponentProps<typeof FileUploader>> = {}
) => {
    const onFilesChange = vi.fn();
    const view = render(
        <FileUploader
            accept=".json"
            label="Drop a file here"
            onFilesChange={onFilesChange}
            {...props}
        />
    );
    const box = screen.getByRole('button');
    const input = view.container.querySelector(
        'input[type="file"]'
    ) as HTMLInputElement;
    return { ...view, onFilesChange, box, input };
};

// The hidden input sits inside the button, so its click bubbles back to the
// button, which clicks the input again. A browser ignores that second click
// (an element already being clicked is not clicked again); happy-dom does
// not, so the input's click() is stubbed out wherever it would be reached.
const stubPicker = (input: HTMLInputElement) =>
    vi.spyOn(input, 'click').mockImplementation(() => undefined);

// a drop event whose dataTransfer carries the given files
const dropOn = (el: HTMLElement, files: File[]) =>
    fireEvent.drop(el, { dataTransfer: { files } });

describe('FileUploader', () => {
    it('shows the label, the hint and a hidden picker that only offers the accepted types', () => {
        const { box, input } = show({ hint: 'JSON files only' });
        expect(box).toHaveTextContent('Drop a file here');
        expect(box).toHaveTextContent('JSON files only');
        expect(input.accept).toBe('.json');
        expect(input.hidden).toBe(true);
    });

    it('leaves the hint out when there is none', () => {
        const { box } = show();
        expect(box.querySelectorAll('span')).toHaveLength(1);
    });

    it('shows the chosen file name in place of the label', () => {
        const { box } = show({ chosen: 'shop.json' });
        expect(box).toHaveTextContent('shop.json');
        expect(box).not.toHaveTextContent('Drop a file here');
    });

    it('opens the file picker when the box is clicked', async () => {
        const { box, input } = show();
        const click = stubPicker(input);
        await userEvent.click(box);
        expect(click).toHaveBeenCalled();
    });

    it('hands over the files picked in the file picker and clears the input so the same file can be picked again', async () => {
        const { input, onFilesChange } = show();
        stubPicker(input);
        const picked = file();
        await userEvent.upload(input, picked);
        expect(onFilesChange).toHaveBeenCalledTimes(1);
        expect(onFilesChange).toHaveBeenCalledWith([picked]);
        expect(input.value).toBe('');
    });

    it('does nothing when the picker is closed without a file', () => {
        const { input, onFilesChange } = show();
        fireEvent.change(input, { target: { files: [] } });
        expect(onFilesChange).not.toHaveBeenCalled();
    });

    it('takes every dropped file', () => {
        const { box, onFilesChange } = show();
        const a = file('a.json');
        const b = file('b.json');
        dropOn(box, [a, b]);
        expect(onFilesChange).toHaveBeenCalledWith([a, b]);
    });

    it('ignores a drop that carries no files', () => {
        const { box, onFilesChange } = show();
        dropOn(box, []);
        expect(onFilesChange).not.toHaveBeenCalled();
    });

    it('highlights the box while a file is dragged over it, and not after it leaves or is dropped', () => {
        const { box } = show();
        expect(box.className).not.toContain('border-primary');
        fireEvent.dragOver(box);
        expect(box.className).toContain('border-primary');
        fireEvent.dragLeave(box);
        expect(box.className).not.toContain('border-primary');
        fireEvent.dragOver(box);
        dropOn(box, [file()]);
        expect(box.className).not.toContain('border-primary');
    });

    it('when disabled, neither opens the picker nor takes a dropped file', async () => {
        const { box, input, onFilesChange } = show({ disabled: true });
        expect(box).toBeDisabled();
        const click = stubPicker(input);
        await userEvent.click(box);
        expect(click).not.toHaveBeenCalled();
        dropOn(box, [file()]);
        expect(onFilesChange).not.toHaveBeenCalled();
    });

    it('keeps the caller class names', () => {
        const { box } = show({ className: 'h-20 extra' });
        expect(box.className).toContain('extra');
    });
});
