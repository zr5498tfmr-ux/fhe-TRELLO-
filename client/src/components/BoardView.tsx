import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { boards as boardsApi, lists as listsApi, cards as cardsApi } from '../services/api';

// ------------------------------------------------------------------ //
//  Archive Panel                                                       //
// ------------------------------------------------------------------ //

interface ArchivePanelProps {
  boardId: string;
  onRestore: (cardId: string) => void;
  onClose: () => void;
}

function ArchivePanel({ boardId, onRestore, onClose }: ArchivePanelProps) {
  const [archivedCards, setArchivedCards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchArchived = async () => {
      try {
        const data = await boardsApi.getArchivedCards(boardId);
        setArchivedCards(data);
      } catch {
        setArchivedCards([]);
      } finally {
        setLoading(false);
      }
    };
    fetchArchived();
  }, [boardId]);

  const handleRestore = async (cardId: string) => {
    try {
      await cardsApi.restore(cardId);
      setArchivedCards((prev) => prev.filter((c) => c.id !== cardId));
      onRestore(cardId);
    } catch {
      // ignore
    }
  };

  const panelStyles: Record<string, React.CSSProperties> = {
    overlay: {
      position: 'fixed',
      top: 0,
      right: 0,
      bottom: 0,
      width: 340,
      background: '#fff',
      boxShadow: '-4px 0 16px rgba(0,0,0,0.2)',
      zIndex: 900,
      display: 'flex',
      flexDirection: 'column',
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '14px 16px',
      borderBottom: '1px solid #e0e0e0',
    },
    title: {
      fontSize: 16,
      fontWeight: 700,
      color: '#172B4D',
    },
    closeBtn: {
      background: 'none',
      border: 'none',
      fontSize: 20,
      cursor: 'pointer',
      color: '#5E6C84',
      lineHeight: 1,
      padding: '2px 6px',
    },
    body: {
      flex: 1,
      overflowY: 'auto',
      padding: '8px 12px',
    },
    card: {
      background: '#F4F5F7',
      borderRadius: 6,
      padding: '10px 12px',
      marginBottom: 8,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 8,
    },
    cardInfo: {
      flex: 1,
      minWidth: 0,
    },
    cardTitle: {
      fontSize: 14,
      fontWeight: 500,
      color: '#172B4D',
      wordBreak: 'break-word' as const,
    },
    cardMeta: {
      fontSize: 11,
      color: '#5E6C84',
      marginTop: 2,
    },
    restoreBtn: {
      background: '#0079BF',
      color: '#fff',
      border: 'none',
      borderRadius: 4,
      padding: '5px 10px',
      fontSize: 12,
      fontWeight: 600,
      cursor: 'pointer',
      whiteSpace: 'nowrap' as const,
      flexShrink: 0,
    },
    emptyMsg: {
      textAlign: 'center' as const,
      color: '#5E6C84',
      fontSize: 13,
      padding: '40px 16px',
    },
  };

  return (
    <div style={panelStyles.overlay}>
      <div style={panelStyles.header}>
        <div style={panelStyles.title}>Archived Cards</div>
        <button style={panelStyles.closeBtn} onClick={onClose}>&times;</button>
      </div>
      <div style={panelStyles.body}>
        {loading ? (
          <div style={panelStyles.emptyMsg}>Loading...</div>
        ) : archivedCards.length === 0 ? (
          <div style={panelStyles.emptyMsg}>No archived cards</div>
        ) : (
          archivedCards.map((card) => (
            <div key={card.id} style={panelStyles.card}>
              <div style={panelStyles.cardInfo}>
                <div style={panelStyles.cardTitle}>{card.title}</div>
                <div style={panelStyles.cardMeta}>
                  {card.listTitle && <>from: {card.listTitle}</>}
                  {card.updatedAt && (
                    <> &middot; {new Date(card.updatedAt).toLocaleDateString()}</>
                  )}
                </div>
              </div>
              <button
                style={panelStyles.restoreBtn}
                onClick={() => handleRestore(card.id)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#026AA7';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#0079BF';
                }}
              >
                Restore
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
import type { Board, List, Card } from '../types';
import CardDetail from './CardDetail';

// ------------------------------------------------------------------ //
//  Colour palette                                                      //
// ------------------------------------------------------------------ //

const COLORS = {
  primary: '#0079BF',
  primaryHover: '#026AA7',
  success: '#61BD4F',
  warning: '#F2D600',
  danger: '#EB5A46',
  bg: '#F4F5F7',
  card: '#FFFFFF',
  text: '#172B4D',
  textSecondary: '#5E6C84',
  listBg: '#EBECF0',
};

// ------------------------------------------------------------------ //
//  Sortable Card                                                       //
// ------------------------------------------------------------------ //

interface SortableCardProps {
  card: Card;
  onClick: () => void;
}

function SortableCard({ card, onClick }: SortableCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.id, data: { type: 'card', card } });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    background: COLORS.card,
    borderRadius: 6,
    padding: '8px 10px',
    marginBottom: 8,
    cursor: 'pointer',
    boxShadow: '0 1px 2px rgba(0,0,0,0.12)',
    fontSize: 14,
    color: COLORS.text,
    position: 'relative',
    userSelect: 'none' as const,
  };

  const checkedCount = card.checklists?.reduce(
    (sum, cl) => sum + cl.items.filter((i) => i.isChecked).length,
    0,
  ) ?? 0;
  const totalCount = card.checklists?.reduce(
    (sum, cl) => sum + cl.items.length,
    0,
  ) ?? 0;

  const dueDateStr = card.dueDate
    ? new Date(card.dueDate).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      })
    : null;

  const isOverdue =
    card.dueDate ? new Date(card.dueDate) < new Date() : false;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {/* Labels */}
      {card.labels && card.labels.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
          {card.labels.map((l) => (
            <span
              key={l.id}
              style={{
                display: 'inline-block',
                width: 32,
                height: 8,
                borderRadius: 4,
                background: l.color,
              }}
              title={l.name ?? l.color}
            />
          ))}
        </div>
      )}

      {/* Title */}
      <div style={{ fontWeight: 500, wordBreak: 'break-word' as const }}>{card.title}</div>

      {/* Meta row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginTop: 6,
          flexWrap: 'wrap',
          fontSize: 12,
          color: COLORS.textSecondary,
        }}
      >
        {dueDateStr && (
          <span
            style={{
              background: isOverdue ? COLORS.danger : '#DFE1E6',
              color: isOverdue ? '#fff' : COLORS.text,
              padding: '2px 6px',
              borderRadius: 3,
              fontSize: 11,
              fontWeight: 500,
            }}
          >
            {dueDateStr}
          </span>
        )}

        {totalCount > 0 && (
          <span
            style={{
              color: checkedCount === totalCount ? COLORS.success : COLORS.textSecondary,
              fontWeight: 500,
            }}
          >
            {checkedCount}/{totalCount}
          </span>
        )}

        {card.attachments && card.attachments.length > 0 && (
          <span>{card.attachments.length} att.</span>
        )}

        {/* Assignee avatars */}
        {card.assignees && card.assignees.length > 0 && (
          <div style={{ display: 'flex', gap: 2, marginLeft: 'auto' }}>
            {card.assignees.slice(0, 3).map((u) => (
              <div
                key={u.id}
                title={u.displayName}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  background: COLORS.primary,
                  color: '#fff',
                  fontSize: 10,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                }}
              >
                {u.avatarUrl ? (
                  <img
                    src={u.avatarUrl}
                    alt={u.displayName}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  u.displayName
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2)
                )}
              </div>
            ))}
            {card.assignees.length > 3 && (
              <span style={{ fontSize: 11, color: COLORS.textSecondary, alignSelf: 'center' }}>
                +{card.assignees.length - 3}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ //
//  Card placeholder rendered in DragOverlay                           //
// ------------------------------------------------------------------ //

function CardOverlay({ card }: { card: Card }) {
  return (
    <div
      style={{
        background: COLORS.card,
        borderRadius: 6,
        padding: '8px 10px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
        fontSize: 14,
        color: COLORS.text,
        maxWidth: 280,
        transform: 'rotate(3deg)',
      }}
    >
      <div style={{ fontWeight: 500 }}>{card.title}</div>
    </div>
  );
}

// ------------------------------------------------------------------ //
//  Droppable List Column                                               //
// ------------------------------------------------------------------ //

interface ListColumnProps {
  list: List;
  onAddCard: (listId: string, title: string) => void;
  onClickCard: (card: Card) => void;
  onEditTitle: (listId: string, title: string) => void;
  onArchiveList: (listId: string) => void;
}

function ListColumn({
  list,
  onAddCard,
  onClickCard,
  onEditTitle,
  onArchiveList,
}: ListColumnProps) {
  const [addingCard, setAddingCard] = useState(false);
  const [newCardTitle, setNewCardTitle] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(list.title);

  const cardIds = useMemo(
    () => list.cards.filter((c) => !c.isArchived).map((c) => c.id),
    [list.cards],
  );

  const handleAddCard = () => {
    if (!newCardTitle.trim()) return;
    onAddCard(list.id, newCardTitle.trim());
    setNewCardTitle('');
    setAddingCard(false);
  };

  const handleTitleBlur = () => {
    setEditingTitle(false);
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== list.title) {
      onEditTitle(list.id, trimmed);
    } else {
      setTitleDraft(list.title);
    }
  };

  const columnStyle: React.CSSProperties = {
    background: COLORS.listBg,
    borderRadius: 8,
    width: 280,
    minWidth: 280,
    maxHeight: '100%',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
  };

  return (
    <div style={columnStyle}>
      {/* Header */}
      <div
        style={{
          padding: '10px 12px 6px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 4,
        }}
      >
        {editingTitle ? (
          <input
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={handleTitleBlur}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleTitleBlur();
              if (e.key === 'Escape') {
                setTitleDraft(list.title);
                setEditingTitle(false);
              }
            }}
            autoFocus
            style={{
              flex: 1,
              fontSize: 14,
              fontWeight: 700,
              border: '2px solid ' + COLORS.primary,
              borderRadius: 4,
              padding: '2px 6px',
              outline: 'none',
              background: COLORS.card,
              color: COLORS.text,
            }}
          />
        ) : (
          <div
            style={{
              flex: 1,
              fontSize: 14,
              fontWeight: 700,
              color: COLORS.text,
              cursor: 'pointer',
              padding: '2px 6px',
              borderRadius: 4,
            }}
            onClick={() => setEditingTitle(true)}
          >
            {list.title}
          </div>
        )}
        <button
          onClick={() => onArchiveList(list.id)}
          title="Archive list"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 16,
            color: COLORS.textSecondary,
            padding: '2px 4px',
            lineHeight: 1,
          }}
        >
          &times;
        </button>
      </div>

      {/* Cards area */}
      <div
        style={{
          padding: '0 8px',
          overflowY: 'auto',
          flex: 1,
          minHeight: 4,
        }}
      >
        <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
          {list.cards
            .filter((c) => !c.isArchived)
            .map((card) => (
              <SortableCard
                key={card.id}
                card={card}
                onClick={() => onClickCard(card)}
              />
            ))}
        </SortableContext>
      </div>

      {/* Add card */}
      <div style={{ padding: '4px 8px 8px' }}>
        {addingCard ? (
          <div>
            <textarea
              value={newCardTitle}
              onChange={(e) => setNewCardTitle(e.target.value)}
              placeholder="Enter a title for this card..."
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleAddCard();
                }
                if (e.key === 'Escape') setAddingCard(false);
              }}
              style={{
                width: '100%',
                minHeight: 54,
                padding: '8px 10px',
                fontSize: 14,
                border: 'none',
                borderRadius: 6,
                resize: 'none',
                outline: 'none',
                boxSizing: 'border-box',
                boxShadow: '0 1px 2px rgba(0,0,0,0.12)',
                color: COLORS.text,
              }}
            />
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <button
                onClick={handleAddCard}
                style={{
                  padding: '6px 14px',
                  background: COLORS.primary,
                  color: '#fff',
                  border: 'none',
                  borderRadius: 4,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Add Card
              </button>
              <button
                onClick={() => setAddingCard(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: 18,
                  cursor: 'pointer',
                  color: COLORS.textSecondary,
                  lineHeight: 1,
                }}
              >
                &times;
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAddingCard(true)}
            style={{
              width: '100%',
              background: 'none',
              border: 'none',
              padding: '6px 8px',
              textAlign: 'left',
              fontSize: 13,
              color: COLORS.textSecondary,
              cursor: 'pointer',
              borderRadius: 6,
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(0,0,0,0.06)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            + Add a card
          </button>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ //
//  BoardView (main component)                                          //
// ------------------------------------------------------------------ //

export default function BoardView() {
  const { id: boardId } = useParams<{ id: string }>();

  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);

  // Add list state
  const [addingList, setAddingList] = useState(false);
  const [newListTitle, setNewListTitle] = useState('');

  // Archive panel state
  const [showArchive, setShowArchive] = useState(false);

  // Active drag item
  const [activeCard, setActiveCard] = useState<Card | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  // ---------------------------------------------------------------- //
  //  Fetch board data                                                  //
  // ---------------------------------------------------------------- //

  const fetchBoard = useCallback(async () => {
    if (!boardId) return;
    try {
      setLoading(true);
      const data = await boardsApi.getById(boardId);
      // Sort lists by position, and cards within each list by position
      data.lists = (data.lists || [])
        .filter((l) => !l.isArchived)
        .sort((a, b) => a.position - b.position)
        .map((l) => ({
          ...l,
          cards: (l.cards || []).sort((a, b) => a.position - b.position),
        }));
      setBoard(data);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load board');
    } finally {
      setLoading(false);
    }
  }, [boardId]);

  useEffect(() => {
    fetchBoard();
  }, [fetchBoard]);

  // ---------------------------------------------------------------- //
  //  Helpers: find list that contains a given card/item ID             //
  // ---------------------------------------------------------------- //

  const findListContainingCard = useCallback(
    (cardId: string): List | undefined => {
      if (!board) return undefined;
      // The cardId may be a list droppable id
      const directList = board.lists.find((l) => l.id === cardId);
      if (directList) return directList;
      return board.lists.find((l) =>
        l.cards.some((c) => c.id === cardId),
      );
    },
    [board],
  );

  // ---------------------------------------------------------------- //
  //  Drag handlers                                                     //
  // ---------------------------------------------------------------- //

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const { active } = event;
      const data = active.data.current;
      if (data?.type === 'card') {
        setActiveCard(data.card as Card);
      }
    },
    [],
  );

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      if (!over || !board) return;

      const activeList = findListContainingCard(active.id as string);
      const overList = findListContainingCard(over.id as string);

      if (!activeList || !overList || activeList.id === overList.id) return;

      // Move the card from one list to another in local state
      setBoard((prev) => {
        if (!prev) return prev;
        const card = activeList.cards.find((c) => c.id === active.id);
        if (!card) return prev;

        const newLists = prev.lists.map((l) => {
          if (l.id === activeList.id) {
            return { ...l, cards: l.cards.filter((c) => c.id !== active.id) };
          }
          if (l.id === overList.id) {
            const overIndex = l.cards.findIndex((c) => c.id === over.id);
            const insertIdx = overIndex >= 0 ? overIndex : l.cards.length;
            const newCards = [...l.cards];
            newCards.splice(insertIdx, 0, { ...card, listId: l.id });
            return { ...l, cards: newCards };
          }
          return l;
        });
        return { ...prev, lists: newLists };
      });
    },
    [board, findListContainingCard],
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveCard(null);
      const { active, over } = event;
      if (!over || !board) return;

      const activeList = findListContainingCard(active.id as string);
      const overList = findListContainingCard(over.id as string);

      if (!activeList || !overList) return;

      if (activeList.id === overList.id) {
        // Reorder within the same list
        const oldIndex = activeList.cards.findIndex((c) => c.id === active.id);
        const newIndex = activeList.cards.findIndex((c) => c.id === over.id);

        if (oldIndex !== newIndex && oldIndex >= 0 && newIndex >= 0) {
          const reordered = arrayMove(activeList.cards, oldIndex, newIndex);
          setBoard((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              lists: prev.lists.map((l) =>
                l.id === activeList.id ? { ...l, cards: reordered } : l,
              ),
            };
          });

          // Persist the move
          try {
            await cardsApi.move(active.id as string, {
              targetListId: activeList.id,
              newPosition: newIndex,
            });
          } catch {
            // Revert on error
            fetchBoard();
          }
        }
      } else {
        // Moved to a different list -- find new position
        const newIndex = overList.cards.findIndex((c) => c.id === active.id);
        const position = newIndex >= 0 ? newIndex : overList.cards.length - 1;

        try {
          await cardsApi.move(active.id as string, {
            targetListId: overList.id,
            newPosition: position,
          });
        } catch {
          fetchBoard();
        }
      }
    },
    [board, findListContainingCard, fetchBoard],
  );

  // ---------------------------------------------------------------- //
  //  Board-level actions                                               //
  // ---------------------------------------------------------------- //

  const handleAddList = async () => {
    if (!newListTitle.trim() || !boardId) return;
    try {
      const created = await listsApi.create({
        boardId,
        title: newListTitle.trim(),
      });
      setBoard((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          lists: [...prev.lists, { ...created, cards: created.cards || [] }],
        };
      });
      setNewListTitle('');
      setAddingList(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create list');
    }
  };

  const handleAddCard = async (listId: string, title: string) => {
    try {
      const created = await cardsApi.create({ listId, title });
      setBoard((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          lists: prev.lists.map((l) =>
            l.id === listId
              ? {
                  ...l,
                  cards: [
                    ...l.cards,
                    {
                      ...created,
                      labels: created.labels || [],
                      assignees: created.assignees || [],
                      checklists: created.checklists || [],
                      attachments: created.attachments || [],
                      comments: created.comments || [],
                    },
                  ],
                }
              : l,
          ),
        };
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create card');
    }
  };

  const handleEditListTitle = async (listId: string, title: string) => {
    try {
      await listsApi.update(listId, { title });
      setBoard((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          lists: prev.lists.map((l) => (l.id === listId ? { ...l, title } : l)),
        };
      });
    } catch {
      // ignore
    }
  };

  const handleArchiveList = async (listId: string) => {
    if (!window.confirm('Archive this list?')) return;
    try {
      await listsApi.archive(listId);
      setBoard((prev) => {
        if (!prev) return prev;
        return { ...prev, lists: prev.lists.filter((l) => l.id !== listId) };
      });
    } catch {
      // ignore
    }
  };

  const handleClickCard = (card: Card) => {
    setSelectedCard(card);
  };

  const handleCardUpdated = useCallback(
    (updatedCard: Card) => {
      setSelectedCard(updatedCard);
      setBoard((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          lists: prev.lists.map((l) => ({
            ...l,
            cards: l.cards.map((c) => (c.id === updatedCard.id ? updatedCard : c)),
          })),
        };
      });
    },
    [],
  );

  const handleCardArchived = useCallback(
    (cardId: string) => {
      setSelectedCard(null);
      setBoard((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          lists: prev.lists.map((l) => ({
            ...l,
            cards: l.cards.filter((c) => c.id !== cardId),
          })),
        };
      });
    },
    [],
  );

  const handleArchiveRestore = useCallback(() => {
    // Re-fetch the board to pick up the restored card
    fetchBoard();
  }, [fetchBoard]);

  // ---------------------------------------------------------------- //
  //  Styles                                                            //
  // ---------------------------------------------------------------- //

  const bgColor = board?.backgroundColor || COLORS.primary;

  const styles: Record<string, React.CSSProperties> = {
    page: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      background: bgColor,
      overflow: 'hidden',
    },
    boardHeader: {
      display: 'flex',
      alignItems: 'center',
      padding: '10px 16px',
      gap: 16,
    },
    boardTitle: {
      fontSize: 18,
      fontWeight: 700,
      color: '#fff',
    },
    boardMembers: {
      display: 'flex',
      gap: 4,
    },
    memberBubble: {
      width: 28,
      height: 28,
      borderRadius: '50%',
      background: 'rgba(255,255,255,0.3)',
      color: '#fff',
      fontSize: 11,
      fontWeight: 700,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    columnsWrapper: {
      flex: 1,
      display: 'flex',
      overflowX: 'auto',
      overflowY: 'hidden',
      padding: '0 16px 16px',
      gap: 12,
      alignItems: 'flex-start',
    },
    addListBtn: {
      minWidth: 280,
      width: 280,
      flexShrink: 0,
      background: 'rgba(255,255,255,0.24)',
      borderRadius: 8,
      padding: 12,
      color: '#fff',
      fontSize: 14,
      fontWeight: 500,
      cursor: 'pointer',
      border: 'none',
      textAlign: 'left' as const,
      transition: 'background 0.15s',
    },
    addListForm: {
      minWidth: 280,
      width: 280,
      flexShrink: 0,
      background: COLORS.listBg,
      borderRadius: 8,
      padding: 8,
    },
    archiveBtn: {
      background: 'rgba(255,255,255,0.2)',
      border: 'none',
      color: '#fff',
      fontSize: 13,
      fontWeight: 500,
      padding: '6px 12px',
      borderRadius: 4,
      cursor: 'pointer',
      whiteSpace: 'nowrap' as const,
      transition: 'background 0.15s',
      marginLeft: 'auto',
    },
    loadingMsg: {
      color: '#fff',
      fontSize: 14,
      textAlign: 'center' as const,
      padding: 60,
    },
    errorMsg: {
      color: '#fff',
      background: 'rgba(235,90,70,0.8)',
      padding: '10px 14px',
      borderRadius: 4,
      margin: '0 16px 8px',
      fontSize: 13,
    },
  };

  // ---------------------------------------------------------------- //
  //  Render                                                            //
  // ---------------------------------------------------------------- //

  if (loading) {
    return (
      <div style={{ ...styles.page, justifyContent: 'center', alignItems: 'center' }}>
        <div style={styles.loadingMsg}>Loading board...</div>
      </div>
    );
  }

  if (error || !board) {
    return (
      <div style={{ ...styles.page, justifyContent: 'center', alignItems: 'center' }}>
        <div style={styles.errorMsg}>{error || 'Board not found'}</div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      {/* Board header */}
      <div style={styles.boardHeader}>
        <div style={styles.boardTitle}>{board.title}</div>
        <div style={styles.boardMembers}>
          {board.members?.slice(0, 6).map((m) => {
            const name = m.displayName || m.user?.displayName || '?';
            const initials = name
              .split(' ')
              .map((n) => n[0])
              .join('')
              .toUpperCase()
              .slice(0, 2);
            const url = m.avatarUrl ?? m.user?.avatarUrl;
            return (
              <div key={m.userId} style={styles.memberBubble} title={name}>
                {url ? (
                  <img
                    src={url}
                    alt={name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
                  />
                ) : (
                  initials
                )}
              </div>
            );
          })}
          {(board.members?.length ?? 0) > 6 && (
            <div style={{ ...styles.memberBubble, background: 'rgba(255,255,255,0.15)', fontSize: 10 }}>
              +{(board.members?.length ?? 0) - 6}
            </div>
          )}
        </div>
        <button
          style={styles.archiveBtn}
          onClick={() => setShowArchive(true)}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.35)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.2)';
          }}
        >
          Archive
        </button>
      </div>

      {error && <div style={styles.errorMsg}>{error}</div>}

      {/* Columns */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div style={styles.columnsWrapper}>
          {board.lists.map((list) => (
            <SortableContext
              key={list.id}
              items={list.cards.filter((c) => !c.isArchived).map((c) => c.id)}
              strategy={verticalListSortingStrategy}
            >
              <ListColumn
                list={list}
                onAddCard={handleAddCard}
                onClickCard={handleClickCard}
                onEditTitle={handleEditListTitle}
                onArchiveList={handleArchiveList}
              />
            </SortableContext>
          ))}

          {/* Add list */}
          {addingList ? (
            <div style={styles.addListForm}>
              <input
                value={newListTitle}
                onChange={(e) => setNewListTitle(e.target.value)}
                placeholder="Enter list title..."
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddList();
                  if (e.key === 'Escape') setAddingList(false);
                }}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  fontSize: 14,
                  border: '2px solid ' + COLORS.primary,
                  borderRadius: 4,
                  outline: 'none',
                  boxSizing: 'border-box',
                  marginBottom: 6,
                  color: COLORS.text,
                }}
              />
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={handleAddList}
                  style={{
                    padding: '6px 14px',
                    background: COLORS.primary,
                    color: '#fff',
                    border: 'none',
                    borderRadius: 4,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Add List
                </button>
                <button
                  onClick={() => setAddingList(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: 18,
                    cursor: 'pointer',
                    color: COLORS.textSecondary,
                    lineHeight: 1,
                  }}
                >
                  &times;
                </button>
              </div>
            </div>
          ) : (
            <button
              style={styles.addListBtn}
              onClick={() => setAddingList(true)}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.32)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.24)';
              }}
            >
              + Add another list
            </button>
          )}
        </div>

        <DragOverlay>
          {activeCard ? <CardOverlay card={activeCard} /> : null}
        </DragOverlay>
      </DndContext>

      {/* Card detail modal */}
      {selectedCard && (
        <CardDetail
          card={selectedCard}
          board={board}
          onClose={() => setSelectedCard(null)}
          onCardUpdated={handleCardUpdated}
          onCardArchived={handleCardArchived}
        />
      )}

      {/* Archive panel */}
      {showArchive && boardId && (
        <ArchivePanel
          boardId={boardId}
          onRestore={handleArchiveRestore}
          onClose={() => setShowArchive(false)}
        />
      )}
    </div>
  );
}
