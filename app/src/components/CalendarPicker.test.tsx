import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CalendarPicker from './CalendarPicker';

// Mock hooks
vi.mock('../hooks/useCalendars', () => ({
  useCalendars: vi.fn(),
}));

vi.mock('../stores/calendar', () => ({
  useCalendarStore: vi.fn(),
}));

import { useCalendars } from '../hooks/useCalendars';
import { useCalendarStore } from '../stores/calendar';

const mockUseCalendars = vi.mocked(useCalendars);
const mockUseCalendarStore = vi.mocked(useCalendarStore);

const calendars = [
  { id: 'cal-1', summary: 'Work', backgroundColor: '#4285f4', primary: true },
  { id: 'cal-2', summary: 'Personal', backgroundColor: '#0b8043', primary: false },
];

const mockSetCalendar = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mockUseCalendars.mockReturnValue({ calendars, loading: false, error: false });
  mockUseCalendarStore.mockReturnValue({ calendarId: 'cal-1', calendarName: 'Work', setCalendar: mockSetCalendar, clearCalendar: vi.fn() });
});

describe('CalendarPicker', () => {
  it('renders a select with calendar options', () => {
    render(<CalendarPicker hasMessages={false} onNewChat={vi.fn()} />);

    const select = screen.getByLabelText('Active calendar');
    expect(select).toBeDefined();

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(2);
    expect(options[0].textContent).toBe('Work');
    expect(options[1].textContent).toBe('Personal');
  });

  it('shows loading state when loading', () => {
    mockUseCalendars.mockReturnValue({ calendars: [], loading: true, error: false });
    render(<CalendarPicker hasMessages={false} onNewChat={vi.fn()} />);

    const select = screen.getByLabelText('Active calendar');
    expect(select).toBeDisabled();
    expect(screen.getByText('Loading…')).toBeDefined();
  });

  it('shows error state when error', () => {
    mockUseCalendars.mockReturnValue({ calendars: [], loading: false, error: true });
    render(<CalendarPicker hasMessages={false} onNewChat={vi.fn()} />);

    expect(screen.getByText('Calendars unavailable')).toBeDefined();
  });

  it('switches calendar directly when no messages', () => {
    render(<CalendarPicker hasMessages={false} onNewChat={vi.fn()} />);

    const select = screen.getByLabelText('Active calendar');
    fireEvent.change(select, { target: { value: 'cal-2' } });

    expect(mockSetCalendar).toHaveBeenCalledWith('cal-2', 'Personal');
  });

  it('shows confirmation dialog when switching with existing messages', () => {
    render(<CalendarPicker hasMessages={true} onNewChat={vi.fn()} />);

    const select = screen.getByLabelText('Active calendar');
    fireEvent.change(select, { target: { value: 'cal-2' } });

    expect(screen.getByText('Switch calendar?')).toBeDefined();
    expect(mockSetCalendar).not.toHaveBeenCalled();
  });

  it('confirms switch: calls onNewChat and setCalendar', () => {
    const onNewChat = vi.fn();
    render(<CalendarPicker hasMessages={true} onNewChat={onNewChat} />);

    const select = screen.getByLabelText('Active calendar');
    fireEvent.change(select, { target: { value: 'cal-2' } });

    fireEvent.click(screen.getByText('New Chat'));

    expect(onNewChat).toHaveBeenCalledOnce();
    expect(mockSetCalendar).toHaveBeenCalledWith('cal-2', 'Personal');
  });

  it('dismisses dialog on Dismiss button', () => {
    render(<CalendarPicker hasMessages={true} onNewChat={vi.fn()} />);

    const select = screen.getByLabelText('Active calendar');
    fireEvent.change(select, { target: { value: 'cal-2' } });

    fireEvent.click(screen.getByText('Dismiss'));

    expect(screen.queryByText('Switch calendar?')).toBeNull();
    expect(mockSetCalendar).not.toHaveBeenCalled();
  });

  it('does nothing when selecting a non-existent calendar', () => {
    render(<CalendarPicker hasMessages={false} onNewChat={vi.fn()} />);

    const select = screen.getByLabelText('Active calendar');
    fireEvent.change(select, { target: { value: 'nonexistent' } });

    expect(mockSetCalendar).not.toHaveBeenCalled();
  });
});
