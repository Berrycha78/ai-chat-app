export type MessageRole = 'user' | 'assistant';

export type Message = {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: number;
};

export type Conversation = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
};

export const STORAGE_KEYS = {
  conversations: 'openmind-conversations',
  theme: 'openmind-theme'
};

export type AppTheme = 'dark' | 'light';
