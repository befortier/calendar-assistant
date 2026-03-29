import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import PreferencesPage from './PreferencesPage';

vi.mock('../lib/apiInstance', () => ({
  authenticatedApi: {
    getPreferences: vi.fn(),
    updatePreferences: vi.fn(),
  },
}));

import { authenticatedApi } from '../lib/apiInstance';

const mockGet = vi.mocked(authenticatedApi.getPreferences);
const mockUpdate = vi.mocked(authenticatedApi.updatePreferences);

function renderPage() {
  return render(
    <MemoryRouter>
      <PreferencesPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PreferencesPage', () => {
  it('shows loading state initially', () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('shows textarea with loaded content', async () => {
    mockGet.mockResolvedValue({ content: 'prefer mornings' });
    renderPage();

    const textarea = await screen.findByRole('textbox', { name: /user preferences/i });
    expect(textarea).toHaveValue('prefer mornings');
  });

  it('Save button is disabled when content is not dirty', async () => {
    mockGet.mockResolvedValue({ content: 'some prefs' });
    renderPage();
    await screen.findByRole('textbox');
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
  });

  it('Save button is enabled after editing', async () => {
    mockGet.mockResolvedValue({ content: 'some prefs' });
    renderPage();
    const textarea = await screen.findByRole('textbox');

    await userEvent.type(textarea, ' extra');
    expect(screen.getByRole('button', { name: /save/i })).toBeEnabled();
  });

  it('shows Saved indicator when content is clean and non-empty', async () => {
    mockGet.mockResolvedValue({ content: 'some prefs' });
    renderPage();
    await screen.findByRole('textbox');
    expect(screen.getByText('Saved')).toBeInTheDocument();
  });

  it('calls updatePreferences and shows Saved after save', async () => {
    mockGet.mockResolvedValue({ content: 'original' });
    mockUpdate.mockResolvedValue({ content: 'original updated' });

    renderPage();
    const textarea = await screen.findByRole('textbox');
    await userEvent.type(textarea, ' updated');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(mockUpdate).toHaveBeenCalledWith('original updated');
    expect(await screen.findByText('Saved')).toBeInTheDocument();
  });

  it('shows error message on load failure', async () => {
    mockGet.mockRejectedValue(new Error('network'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to load preferences.');
  });

  it('shows Retry button on load failure', async () => {
    mockGet.mockRejectedValue(new Error('network'));
    renderPage();
    expect(await screen.findByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('re-fetches when Retry is clicked', async () => {
    mockGet.mockRejectedValueOnce(new Error('fail'));
    mockGet.mockResolvedValueOnce({ content: 'recovered' });

    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /retry/i }));

    expect(await screen.findByRole('textbox')).toHaveValue('recovered');
  });
});
