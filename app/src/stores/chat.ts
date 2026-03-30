import { create } from 'zustand';
import { chatReducer, initialState } from '../hooks/chatReducer';
import type { ChatState, ChatAction } from '../hooks/chatReducer';

interface ChatStore extends ChatState {
  dispatch: (action: ChatAction) => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  ...initialState,
  dispatch: (action) => set((state) => chatReducer(state, action)),
}));
