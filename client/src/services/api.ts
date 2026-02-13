import type {
  AuthResponse,
  Board,
  BoardMember,
  BoardSummary,
  Card,
  Checklist,
  ChecklistItem,
  Comment,
  EmailRule,
  Label,
  List,
  LoginCredentials,
  RegisterData,
  User,
} from '../types';

// ------------------------------------------------------------------ //
//  Constants                                                           //
// ------------------------------------------------------------------ //

const API_BASE = '/api';
const TOKEN_KEY = 'fhe_token';

// ------------------------------------------------------------------ //
//  Token helpers                                                       //
// ------------------------------------------------------------------ //

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function removeToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

// ------------------------------------------------------------------ //
//  Base fetch wrapper                                                  //
// ------------------------------------------------------------------ //

class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // If the caller explicitly set Content-Type to something other than JSON
  // (e.g. multipart for file uploads), remove our default so the browser
  // can set the correct boundary.
  if (options.body instanceof FormData) {
    delete headers['Content-Type'];
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as unknown as T;
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const message =
      (body as { error?: string; message?: string })?.error ??
      (body as { message?: string })?.message ??
      response.statusText;
    throw new ApiError(message, response.status, body);
  }

  return body as T;
}

// ------------------------------------------------------------------ //
//  Auth                                                                //
// ------------------------------------------------------------------ //

export const auth = {
  login(credentials: LoginCredentials): Promise<AuthResponse> {
    return request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
  },

  register(data: RegisterData): Promise<AuthResponse> {
    return request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getMe(): Promise<User> {
    return request<User>('/auth/me');
  },

  updateMe(data: { displayName?: string; avatarUrl?: string | null }): Promise<User> {
    return request<User>('/auth/me', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },
};

// ------------------------------------------------------------------ //
//  Boards                                                              //
// ------------------------------------------------------------------ //

export const boards = {
  list(): Promise<BoardSummary[]> {
    return request<BoardSummary[]>('/boards');
  },

  create(data: {
    title: string;
    description?: string;
    backgroundColor?: string;
  }): Promise<Board> {
    return request<Board>('/boards', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getById(boardId: string): Promise<Board> {
    return request<Board>(`/boards/${boardId}`);
  },

  update(
    boardId: string,
    data: { title?: string; description?: string | null; backgroundColor?: string },
  ): Promise<Board> {
    return request<Board>(`/boards/${boardId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  archive(boardId: string): Promise<{ message: string }> {
    return request<{ message: string }>(`/boards/${boardId}`, {
      method: 'DELETE',
    });
  },

  getArchivedCards(boardId: string): Promise<any[]> {
    return request<any[]>(`/boards/${boardId}/archived-cards`);
  },

  addMember(
    boardId: string,
    data: { userId: string; role?: 'admin' | 'member' | 'viewer' },
  ): Promise<BoardMember> {
    return request<BoardMember>(`/boards/${boardId}/members`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  removeMember(boardId: string, userId: string): Promise<{ message: string }> {
    return request<{ message: string }>(`/boards/${boardId}/members/${userId}`, {
      method: 'DELETE',
    });
  },
};

// ------------------------------------------------------------------ //
//  Lists                                                               //
// ------------------------------------------------------------------ //

export const lists = {
  create(data: { boardId: string; title: string }): Promise<List> {
    return request<List>('/lists', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update(listId: string, data: { title: string }): Promise<List> {
    return request<List>(`/lists/${listId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  move(listId: string, data: { newPosition: number }): Promise<{ message: string; newPosition: number }> {
    return request<{ message: string; newPosition: number }>(`/lists/${listId}/move`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  archive(listId: string): Promise<{ message: string }> {
    return request<{ message: string }>(`/lists/${listId}`, {
      method: 'DELETE',
    });
  },

  archiveAllCards(listId: string): Promise<{ message: string; archivedCount: number }> {
    return request<{ message: string; archivedCount: number }>(`/lists/${listId}/archive-all-cards`, {
      method: 'POST',
    });
  },

  setAutoArchive(listId: string, day: number | null): Promise<{ message: string; autoArchiveDay: number | null }> {
    return request<{ message: string; autoArchiveDay: number | null }>(`/lists/${listId}/auto-archive`, {
      method: 'PUT',
      body: JSON.stringify({ day }),
    });
  },
};

// ------------------------------------------------------------------ //
//  Cards                                                               //
// ------------------------------------------------------------------ //

export const cards = {
  create(data: {
    listId: string;
    title: string;
    description?: string;
    dueDate?: string | null;
  }): Promise<Card> {
    return request<Card>('/cards', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getById(cardId: string): Promise<Card> {
    return request<Card>(`/cards/${cardId}`);
  },

  update(
    cardId: string,
    data: {
      title?: string;
      description?: string | null;
      dueDate?: string | null;
      coverColor?: string | null;
    },
  ): Promise<Card> {
    return request<Card>(`/cards/${cardId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  move(
    cardId: string,
    data: { targetListId: string; newPosition: number },
  ): Promise<{ message: string; listId: string; newPosition: number }> {
    return request<{ message: string; listId: string; newPosition: number }>(
      `/cards/${cardId}/move`,
      {
        method: 'PUT',
        body: JSON.stringify(data),
      },
    );
  },

  archive(cardId: string): Promise<{ message: string }> {
    return request<{ message: string }>(`/cards/${cardId}`, {
      method: 'DELETE',
    });
  },

  restore(cardId: string): Promise<{ message: string }> {
    return request<{ message: string }>(`/cards/${cardId}/restore`, {
      method: 'PUT',
    });
  },

  search(q: string): Promise<any[]> {
    return request<any[]>(`/cards/search?q=${encodeURIComponent(q)}`);
  },

  addLabel(cardId: string, labelId: string): Promise<{ cardId: string; labelId: string; name: string; color: string }> {
    return request(`/cards/${cardId}/labels`, {
      method: 'POST',
      body: JSON.stringify({ labelId }),
    });
  },

  removeLabel(cardId: string, labelId: string): Promise<{ message: string }> {
    return request<{ message: string }>(`/cards/${cardId}/labels/${labelId}`, {
      method: 'DELETE',
    });
  },

  assign(cardId: string, userId: string): Promise<{ cardId: string; userId: string; email: string; displayName: string; avatarUrl: string | null }> {
    return request(`/cards/${cardId}/assign`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
  },

  unassign(cardId: string, userId: string): Promise<{ message: string }> {
    return request<{ message: string }>(`/cards/${cardId}/assign/${userId}`, {
      method: 'DELETE',
    });
  },

  addComment(cardId: string, content: string): Promise<Comment> {
    return request<Comment>(`/cards/${cardId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  },

  deleteComment(cardId: string, commentId: string): Promise<{ message: string }> {
    return request<{ message: string }>(`/cards/${cardId}/comments/${commentId}`, {
      method: 'DELETE',
    });
  },
};

// ------------------------------------------------------------------ //
//  Labels                                                              //
// ------------------------------------------------------------------ //

export const labels = {
  listForBoard(boardId: string): Promise<Label[]> {
    return request<Label[]>(`/labels/board/${boardId}`);
  },

  create(data: { boardId: string; name?: string | null; color?: string }): Promise<Label> {
    return request<Label>('/labels', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update(labelId: string, data: { name?: string | null; color?: string }): Promise<Label> {
    return request<Label>(`/labels/${labelId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  delete(labelId: string): Promise<{ message: string }> {
    return request<{ message: string }>(`/labels/${labelId}`, {
      method: 'DELETE',
    });
  },
};

// ------------------------------------------------------------------ //
//  Checklists                                                          //
// ------------------------------------------------------------------ //

export const checklists = {
  create(data: { cardId: string; title?: string }): Promise<Checklist> {
    return request<Checklist>('/checklists', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update(checklistId: string, data: { title: string }): Promise<Checklist> {
    return request<Checklist>(`/checklists/${checklistId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  delete(checklistId: string): Promise<{ message: string }> {
    return request<{ message: string }>(`/checklists/${checklistId}`, {
      method: 'DELETE',
    });
  },

  addItem(checklistId: string, content: string): Promise<ChecklistItem> {
    return request<ChecklistItem>(`/checklists/${checklistId}/items`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  },

  updateItem(
    itemId: string,
    data: { content?: string; isChecked?: boolean },
  ): Promise<ChecklistItem> {
    return request<ChecklistItem>(`/checklists/items/${itemId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  deleteItem(itemId: string): Promise<{ message: string }> {
    return request<{ message: string }>(`/checklists/items/${itemId}`, {
      method: 'DELETE',
    });
  },
};

// ------------------------------------------------------------------ //
//  Email rules                                                         //
// ------------------------------------------------------------------ //

export const emailRules = {
  list(): Promise<EmailRule[]> {
    return request<EmailRule[]>('/email-rules');
  },

  create(data: {
    name: string;
    targetBoardId: string;
    targetListId: string;
    fromAddresses?: string[];
    fromDomains?: string[];
    toAddresses?: string[];
    subjectContains?: string[];
    subjectNotContains?: string[];
    assignToUserIds?: string[];
    autoLabels?: string[];
  }): Promise<EmailRule> {
    return request<EmailRule>('/email-rules', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  update(
    ruleId: string,
    data: {
      name?: string;
      targetBoardId?: string;
      targetListId?: string;
      fromAddresses?: string[];
      fromDomains?: string[];
      toAddresses?: string[];
      subjectContains?: string[];
      subjectNotContains?: string[];
      assignToUserIds?: string[];
      autoLabels?: string[];
    },
  ): Promise<EmailRule> {
    return request<EmailRule>(`/email-rules/${ruleId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  delete(ruleId: string): Promise<{ message: string }> {
    return request<{ message: string }>(`/email-rules/${ruleId}`, {
      method: 'DELETE',
    });
  },

  toggle(ruleId: string, isActive: boolean): Promise<EmailRule> {
    return request<EmailRule>(`/email-rules/${ruleId}/toggle`, {
      method: 'PUT',
      body: JSON.stringify({ isActive }),
    });
  },
};

// ------------------------------------------------------------------ //
//  Users                                                               //
// ------------------------------------------------------------------ //

export const users = {
  list(): Promise<User[]> {
    return request<User[]>('/users');
  },

  getById(userId: string): Promise<User> {
    return request<User>(`/users/${userId}`);
  },
};

// ------------------------------------------------------------------ //
//  Import                                                              //
// ------------------------------------------------------------------ //

export interface TrelloImportResult {
  message: string;
  boardId: string;
  boardName: string;
  summary: {
    lists: number;
    cards: number;
    skippedCards: number;
    labels: number;
    checklists: number;
  };
}

export const importApi = {
  trello(data: any): Promise<TrelloImportResult> {
    return request<TrelloImportResult>('/import/trello', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};
