/** Shared color/style constants for event action types (create/update/delete). */

export type ActionType = 'create' | 'update' | 'delete';

export interface ActionTheme {
  border: string;
  bg: string;
  accent: string;
  text: string;
  button: string;
  buttonHover: string;
}

export const ACTION_THEMES: Record<ActionType, ActionTheme> = {
  create: {
    border: 'border-green-400',
    bg: 'bg-green-50',
    accent: 'border-green-400 bg-green-50',
    text: 'text-green-600',
    button: 'bg-green-600',
    buttonHover: 'bg-green-600 hover:bg-green-700',
  },
  update: {
    border: 'border-blue-400',
    bg: 'bg-blue-50',
    accent: 'border-blue-400 bg-blue-50',
    text: 'text-blue-600',
    button: 'bg-blue-600',
    buttonHover: 'bg-blue-600 hover:bg-blue-700',
  },
  delete: {
    border: 'border-red-400',
    bg: 'bg-red-50',
    accent: 'border-red-400 bg-red-50',
    text: 'text-red-600',
    button: 'bg-red-600',
    buttonHover: 'bg-red-600 hover:bg-red-700',
  },
};
