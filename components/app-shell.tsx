'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  Copy,
  Download,
  Loader2,
  Menu,
  MessageSquarePlus,
  Moon,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  Settings,
  SidebarClose,
  SidebarOpen,
  Sun,
  Trash2,
  X
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { STORAGE_KEYS, type AppTheme, type Conversation, type Message } from '@/lib/types';

const MODEL_NAME = process.env.NEXT_PUBLIC_MODEL_NAME || 'gpt-4o-mini';

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getChatTitleFromPrompt(prompt: string) {
  const withoutWhitespace = prompt.trim();
  if (!withoutWhitespace) return 'New chat';

  const words = withoutWhitespace.split(/\s+/).slice(0, 6).join(' ');
  return words.length > 0 ? words : 'New chat';
}

function isValidConversation(value: unknown): value is Conversation {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'id' in value &&
      'title' in value &&
      'messages' in value &&
      Array.isArray((value as Conversation).messages)
  );
}

export default function AppShell() {
  const [theme, setTheme] = useState<AppTheme>('dark');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeConversationId) ?? null,
    [activeConversationId, conversations]
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 768px)');
    const handleResize = () => setIsMobile(mediaQuery.matches);
    handleResize();
    mediaQuery.addEventListener('change', handleResize);

    return () => mediaQuery.removeEventListener('change', handleResize);
  }, []);

  useEffect(() => {
    const persistedTheme = localStorage.getItem(STORAGE_KEYS.theme) as AppTheme | null;
    const initialTheme = persistedTheme === 'light' || persistedTheme === 'dark' ? persistedTheme : 'dark';
    setTheme(initialTheme);
    document.documentElement.classList.toggle('dark', initialTheme === 'dark');

    const stored = localStorage.getItem(STORAGE_KEYS.conversations);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          const valid = parsed.filter(isValidConversation) as Conversation[];
          if (valid.length > 0) {
            setConversations(valid);
            setActiveConversationId(valid[0].id);
            return;
          }
        }
      } catch {
        localStorage.removeItem(STORAGE_KEYS.conversations);
      }
    }

    const newConversation: Conversation = {
      id: createId('conv'),
      title: 'New chat',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: []
    };

    setConversations([newConversation]);
    setActiveConversationId(newConversation.id);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem(STORAGE_KEYS.theme, theme);
  }, [theme]);

  useEffect(() => {
    if (conversations.length > 0) {
      localStorage.setItem(STORAGE_KEYS.conversations, JSON.stringify(conversations));
    }
  }, [conversations]);

  const createConversation = () => {
    const newConversation: Conversation = {
      id: createId('conv'),
      title: 'New chat',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: []
    };

    setConversations((previous) => [newConversation, ...previous]);
    setActiveConversationId(newConversation.id);
    setError(null);
    setInput('');
  };

  const updateConversation = (conversationId: string, updater: (conversation: Conversation) => Conversation) => {
    setConversations((previous) =>
      previous.map((conversation) => (conversation.id === conversationId ? updater(conversation) : conversation))
    );
  };

  const renameConversation = (conversationId: string) => {
    const conversation = conversations.find((item) => item.id === conversationId);
    if (!conversation) return;

    const nextTitle = window.prompt('Rename conversation', conversation.title)?.trim();
    if (!nextTitle) return;

    updateConversation(conversationId, (current) => ({
      ...current,
      title: nextTitle,
      updatedAt: Date.now()
    }));
  };

  const deleteConversation = (conversationId: string) => {
    const nextConversations = conversations.filter((conversation) => conversation.id !== conversationId);
    if (nextConversations.length === 0) {
      const created: Conversation = {
        id: createId('conv'),
        title: 'New chat',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: []
      };
      setConversations([created]);
      setActiveConversationId(created.id);
      return;
    }

    setConversations(nextConversations);
    if (activeConversationId === conversationId) {
      setActiveConversationId(nextConversations[0].id);
    }
  };

  const appendMessageToConversation = (conversationId: string, message: Message) => {
    updateConversation(conversationId, (current) => ({
      ...current,
      updatedAt: Date.now(),
      messages: [...current.messages, message]
    }));
  };

  const submitMessage = async (prompt: string, regenerate = false) => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      setError('Please enter a question before sending.');
      return;
    }

    let targetConversation = activeConversation;
    if (!targetConversation) {
      const nextConversation: Conversation = {
        id: createId('conv'),
        title: 'New chat',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: []
      };
      setConversations((previous) => [nextConversation, ...previous]);
      setActiveConversationId(nextConversation.id);
      targetConversation = nextConversation;
    }

    const userMessage: Message = {
      id: createId('msg'),
      role: 'user',
      content: trimmedPrompt,
      createdAt: Date.now()
    };

    const assistantMessageId = createId('assistant');
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      createdAt: Date.now()
    };

    if (regenerate) {
      const previousMessages = targetConversation.messages.filter((message) => message.role !== 'assistant' || message.id !== targetConversation.messages.at(-1)?.id);
      updateConversation(targetConversation.id, (current) => ({
        ...current,
        updatedAt: Date.now(),
        title: current.title === 'New chat' ? getChatTitleFromPrompt(trimmedPrompt) : current.title,
        messages: [...previousMessages, userMessage, assistantMessage]
      }));
    } else {
      updateConversation(targetConversation.id, (current) => ({
        ...current,
        title: current.title === 'New chat' ? getChatTitleFromPrompt(trimmedPrompt) : current.title,
        updatedAt: Date.now(),
        messages: [...current.messages, userMessage, assistantMessage]
      }));
    }

    setInput('');
    setError(null);
    setIsLoading(true);

    abortRef.current = new AbortController();
    const messages = [...(targetConversation.messages || []), userMessage].map((message) => ({
      role: message.role,
      content: message.content
    }));

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages }),
        signal: abortRef.current.signal
      });

      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => ({ error: 'The AI request failed.' }));
        throw new Error(payload.error || 'The AI request failed.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n\n');

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;

          const payload = trimmed.replace(/^data:\s*/, '').trim();
          if (!payload || payload === '[DONE]') continue;

          try {
            const parsed = JSON.parse(payload) as { content?: string; error?: string };
            if (parsed.error) {
              throw new Error(parsed.error);
            }

            if (parsed.content) {
              accumulated += parsed.content;
              updateConversation(targetConversation.id, (current) => ({
                ...current,
                updatedAt: Date.now(),
                messages: current.messages.map((message) =>
                  message.id === assistantMessageId ? { ...message, content: accumulated } : message
                )
              }));
            }
          } catch {
            // Ignore malformed chunks while the stream is still arriving.
          }
        }
      }

      setIsLoading(false);
      if (!accumulated.trim()) {
        setError('The AI returned an empty response.');
      }
    } catch (error) {
      setIsLoading(false);
      setError(error instanceof Error ? error.message : 'Something went wrong.');
      updateConversation(targetConversation.id, (current) => ({
        ...current,
        updatedAt: Date.now(),
        messages: current.messages.map((message) =>
          message.id === assistantMessageId ? { ...message, content: message.content || 'I was unable to complete that response.' } : message
        )
      }));
    } finally {
      abortRef.current = null;
    }
  };

  const handleSend = async () => {
    await submitMessage(input);
  };

  const handleRegenerate = async () => {
    if (!activeConversation || activeConversation.messages.length === 0) return;
    const lastUserMessage = [...activeConversation.messages].reverse().find((message) => message.role === 'user');
    if (!lastUserMessage) return;

    await submitMessage(lastUserMessage.content, true);
  };

  const handleCopy = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
    } catch {
      setError('Unable to copy this message.');
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsLoading(false);
  };

  const handleDownload = () => {
    if (!activeConversation) return;

    const content = activeConversation.messages
      .map((message) => `${message.role === 'user' ? 'You' : 'Assistant'}\n${message.content}\n`)
      .join('\n---\n');

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${activeConversation.title}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <aside
        className={`$${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} fixed inset-y-0 left-0 z-40 w-72 border-r border-slate-200 bg-white/80 backdrop-blur-xl transition-transform duration-200 dark:border-slate-800 dark:bg-slate-900/80 md:static md:translate-x-0`}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-primary-600 p-2 text-white shadow-soft">
                <MessageSquarePlus size={18} />
              </div>
              <div>
                <p className="text-sm font-semibold">OpenMind</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">AI workspace</p>
              </div>
            </div>
            <button
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 md:hidden"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close sidebar"
            >
              <ChevronLeft size={18} />
            </button>
          </div>

          <div className="p-3">
            <button
              onClick={createConversation}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-3 py-3 text-sm font-medium text-white transition hover:bg-primary-700"
            >
              <Plus size={16} />
              New chat
            </button>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto px-3 pb-5">
            {conversations.map((conversation) => (
              <div
                key={conversation.id}
                className={`group rounded-xl border px-2.5 py-2.5 transition ${
                  activeConversationId === conversation.id
                    ? 'border-primary-200 bg-primary-50 dark:border-primary-800 dark:bg-primary-950/40'
                    : 'border-transparent bg-transparent hover:border-slate-200 hover:bg-slate-100 dark:hover:border-slate-700 dark:hover:bg-slate-800/60'
                }`}
              >
                <button
                  onClick={() => setActiveConversationId(conversation.id)}
                  className="flex w-full items-start justify-between gap-3 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">
                      {conversation.title || 'Untitled chat'}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                      {new Date(conversation.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                </button>

                <div className="mt-2 flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                  <button
                    onClick={() => renameConversation(conversation.id)}
                    className="rounded-md p-1.5 text-slate-500 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700"
                    aria-label="Rename conversation"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => deleteConversation(conversation.id)}
                    className="rounded-md p-1.5 text-slate-500 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700"
                    aria-label="Delete conversation"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white/70 px-4 py-3 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/70">
          <div className="flex items-center gap-3">
            <button
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 md:hidden"
              aria-label="Open sidebar"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={18} />
            </button>
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-primary-100 p-1.5 text-primary-700 dark:bg-primary-950/40 dark:text-primary-300">
                <MessageSquarePlus size={16} />
              </div>
              <div>
                <p className="text-sm font-semibold">{activeConversation?.title || 'Conversation'}</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">{MODEL_NAME}</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <button
              className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              onClick={() => setSettingsOpen((value) => !value)}
              aria-label="Open settings"
            >
              <Settings size={16} />
            </button>
          </div>
        </header>

        {settingsOpen && (
          <div className="border-b border-slate-200 bg-white/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/80">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-medium">Integration status</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  AI provider is configured through server environment variables.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-300">
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  Ready
                </span>
                <span>Model: {MODEL_NAME}</span>
              </div>
            </div>
          </div>
        )}

        <main className="messaging-shell relative flex flex-1 flex-col overflow-hidden">
          <div className="message-scrollbar flex-1 overflow-y-auto px-3 pb-28 pt-4 sm:px-5">
            {!activeConversation || activeConversation.messages.length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <div className="max-w-md rounded-2xl border border-slate-200 bg-white/80 p-8 text-center shadow-soft dark:border-slate-800 dark:bg-slate-900/70">
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary-100 text-primary-700 dark:bg-primary-950/40 dark:text-primary-300">
                    <MessageSquarePlus size={22} />
                  </div>
                  <h2 className="text-xl font-semibold">Start a new conversation</h2>
                  <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                    Ask anything and the assistant will respond in real time using the configured AI model.
                  </p>
                </div>
              </div>
            ) : (
              <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
                {activeConversation.messages.map((message) => {
                  const isUser = message.role === 'user';

                  return (
                    <div
                      key={message.id}
                      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[88%] rounded-2xl p-3 sm:p-4 ${
                          isUser
                            ? 'bg-primary-600 text-white shadow-soft'
                            : 'border border-slate-200 bg-white/95 text-slate-800 shadow-soft dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'
                        }`}
                      >
                        <div className="mb-2 flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.12em] opacity-80">
                          <span>{isUser ? 'You' : 'Assistant'}</span>
                          {!isUser && (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleCopy(message.content)}
                                className="rounded-md p-1 hover:bg-slate-100 dark:hover:bg-slate-800"
                                aria-label="Copy response"
                              >
                                <Copy size={12} />
                              </button>
                              <button
                                onClick={handleRegenerate}
                                className="rounded-md p-1 hover:bg-slate-100 dark:hover:bg-slate-800"
                                aria-label="Regenerate response"
                              >
                                <RefreshCw size={12} />
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="prose prose-slate prose-invert max-w-none text-[14px] leading-7 dark:prose-invert">
                          {isUser ? (
                            <p className="whitespace-pre-wrap text-white">{message.content}</p>
                          ) : message.content ? (
                            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                              {message.content}
                            </ReactMarkdown>
                          ) : (
                            <span className="inline-flex items-center gap-2 text-slate-500 dark:text-slate-400">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Thinking…
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="absolute inset-x-0 bottom-0 border-t border-slate-200 bg-white/90 px-3 py-3 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/85 sm:px-5">
            {error && (
              <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                {error}
              </div>
            )}

            <div className="mx-auto w-full max-w-3xl rounded-[26px] border border-slate-200 bg-slate-50 p-2 shadow-soft dark:border-slate-700 dark:bg-slate-800">
              <div className="flex items-end gap-2">
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      void handleSend();
                    }
                  }}
                  placeholder="Message OpenMind…"
                  rows={1}
                  className="max-h-36 min-h-[52px] flex-1 resize-none bg-transparent px-3 py-3 text-sm outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500"
                />

                <div className="flex items-center gap-2">
                  <button
                    className="rounded-lg border border-slate-200 bg-white p-2.5 text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-700"
                    onClick={handleDownload}
                    aria-label="Export conversation"
                  >
                    <Download size={16} />
                  </button>
                  {isLoading ? (
                    <button
                      onClick={handleStop}
                      className="rounded-xl bg-red-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-600"
                    >
                      Stop
                    </button>
                  ) : (
                    <button
                      onClick={() => void handleSend()}
                      className="rounded-xl bg-primary-600 p-3 text-white shadow-soft transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
                      aria-label="Send message"
                      disabled={!input.trim()}
                    >
                      <Send size={16} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
