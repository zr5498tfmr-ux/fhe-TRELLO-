// ------------------------------------------------------------------ //
//  User                                                                //
// ------------------------------------------------------------------ //

export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  role: 'admin' | 'member';
  createdAt: string;
}

// ------------------------------------------------------------------ //
//  Board                                                               //
// ------------------------------------------------------------------ //

export interface Board {
  id: string;
  title: string;
  description: string | null;
  backgroundColor: string;
  isArchived: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
  members: BoardMember[];
  lists: List[];
  labels: Label[];
}

/** Lightweight board summary returned by the list endpoint. */
export interface BoardSummary {
  id: string;
  title: string;
  description: string | null;
  backgroundColor: string;
  memberRole: string;
  createdAt: string;
  updatedAt?: string;
}

// ------------------------------------------------------------------ //
//  Board member                                                        //
// ------------------------------------------------------------------ //

export interface BoardMember {
  id?: string;
  userId: string;
  boardId?: string;
  role: 'admin' | 'member' | 'viewer';
  user?: User;
  /** Flattened fields returned by the boards/:boardId endpoint. */
  email?: string;
  displayName?: string;
  avatarUrl?: string | null;
}

// ------------------------------------------------------------------ //
//  List                                                                //
// ------------------------------------------------------------------ //

export interface List {
  id: string;
  boardId: string;
  title: string;
  position: number;
  isArchived: boolean;
  autoArchiveDay: number | null;
  cards: Card[];
}

// ------------------------------------------------------------------ //
//  Card                                                                //
// ------------------------------------------------------------------ //

export interface Card {
  id: string;
  listId: string;
  title: string;
  description: string | null;
  position: number;
  dueDate: string | null;
  isArchived: boolean;
  coverColor: string | null;
  createdBy: string;
  sourceEmailId?: string | null;
  createdAt: string;
  updatedAt: string;
  labels: Label[];
  assignees: User[];
  checklists: Checklist[];
  attachments: Attachment[];
  comments: Comment[];
}

// ------------------------------------------------------------------ //
//  Label                                                               //
// ------------------------------------------------------------------ //

export interface Label {
  id: string;
  boardId?: string;
  name: string | null;
  color: string;
}

// ------------------------------------------------------------------ //
//  Checklist                                                           //
// ------------------------------------------------------------------ //

export interface Checklist {
  id: string;
  cardId: string;
  title: string;
  position: number;
  items: ChecklistItem[];
}

export interface ChecklistItem {
  id: string;
  checklistId: string;
  content: string;
  isChecked: boolean;
  position: number;
}

// ------------------------------------------------------------------ //
//  Attachment                                                          //
// ------------------------------------------------------------------ //

export interface Attachment {
  id: string;
  cardId: string;
  filename: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  uploadedBy: string;
  createdAt: string;
}

// ------------------------------------------------------------------ //
//  Comment                                                             //
// ------------------------------------------------------------------ //

export interface Comment {
  id: string;
  cardId: string;
  userId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  user?: User;
  /** Flattened fields returned by some endpoints. */
  displayName?: string;
  avatarUrl?: string | null;
  email?: string;
}

// ------------------------------------------------------------------ //
//  Email rule                                                          //
// ------------------------------------------------------------------ //

export interface EmailRule {
  id: string;
  name: string;
  isActive: boolean;
  targetBoardId: string;
  targetListId: string;
  fromAddresses: string[];
  fromDomains: string[];
  toAddresses: string[];
  subjectContains: string[];
  subjectNotContains: string[];
  assignToUserIds: string[];
  autoLabels: string[];
  createdBy?: string;
  createdAt: string;
  updatedAt?: string;
  /** Joined fields returned by the list endpoint. */
  boardTitle?: string;
  listTitle?: string;
}

// ------------------------------------------------------------------ //
//  Auth                                                                //
// ------------------------------------------------------------------ //

export interface AuthResponse {
  token: string;
  user: User;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  displayName: string;
}

// ------------------------------------------------------------------ //
//  Generic API helpers                                                 //
// ------------------------------------------------------------------ //

export interface ApiError {
  error: string;
  message?: string;
  statusCode?: number;
}
