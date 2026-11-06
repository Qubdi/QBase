import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
    qubdiContext,
    type QubdiContext,
} from '@/context/qubdi-context/qubdi-context';
import { SessionEndedNotice } from '../session-ended-notice';

const show = (sessionEnded: boolean) =>
    render(
        <qubdiContext.Provider
            value={{ sessionEnded } as unknown as QubdiContext}
        >
            <SessionEndedNotice />
        </qubdiContext.Provider>
    );

describe('SessionEndedNotice', () => {
    it('explains that the account can only be signed in once at a time', () => {
        show(true);
        expect(screen.getByRole('alert').textContent).toMatch(
            /signed out.*only be signed in once at a time/
        );
    });

    it('says nothing on an ordinary sign-in screen', () => {
        show(false);
        expect(screen.queryByRole('alert')).toBeNull();
    });
});
