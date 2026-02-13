import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { query } from '../db/pool';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { NotFoundError, ForbiddenError } from '../middleware/errorHandler';

const router = Router();

// ------------------------------------------------------------------ //
//  Validation schemas                                                 //
// ------------------------------------------------------------------ //

const createCardSchema = z.object({
  listId: z.string().uuid('Invalid list ID'),
  title: z.string().min(1, 'Title is required').max(500),
  description: z.string().max(10000).optional(),
  dueDate: z.string().datetime().nullable().optional(),
});

const updateCardSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(10000).nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  coverColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
});

const moveCardSchema = z.object({
  targetListId: z.string().uuid('Invalid target list ID'),
  newPosition: z.number().int().min(0, 'Position must be non-negative'),
});

const addLabelSchema = z.object({
  labelId: z.string().uuid('Invalid label ID'),
});

const assignUserSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
});

const addCommentSchema = z.object({
  content: z.string().min(1, 'Comment cannot be empty').max(10000),
});

// ------------------------------------------------------------------ //
//  Helpers                                                            //
// ------------------------------------------------------------------ //

/**
 * Look up the board a list belongs to and verify the user is a member.
 * Returns the board_id.
 */
async function getBoardIdFromList(listId: string, userId: string): Promise<string> {
  const result = await query(
    `SELECT l.board_id
     FROM lists l
     JOIN boards b ON b.id = l.board_id
     WHERE l.id = $1 AND b.is_archived = false`,
    [listId],
  );
  if (result.rows.length === 0) {
    throw new NotFoundError('List not found');
  }
  const boardId = result.rows[0].board_id;

  const memberResult = await query(
    'SELECT role FROM board_members WHERE board_id = $1 AND user_id = $2',
    [boardId, userId],
  );
  if (memberResult.rows.length === 0) {
    throw new ForbiddenError('You are not a member of this board');
  }

  return boardId;
}

/**
 * Fetch a card and verify that the requesting user has access via
 * the board membership of the card's list.  Returns { card, boardId, boardRole }.
 */
async function getCardAndVerifyAccess(cardId: string, userId: string) {
  const result = await query(
    `SELECT c.id, c.list_id, c.title, c.description, c.position,
            c.due_date, c.cover_color, c.is_archived, c.created_by,
            c.created_at, c.updated_at, l.board_id
     FROM cards c
     JOIN lists l ON l.id = c.list_id
     WHERE c.id = $1`,
    [cardId],
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Card not found');
  }

  const card = result.rows[0];

  const memberResult = await query(
    'SELECT role FROM board_members WHERE board_id = $1 AND user_id = $2',
    [card.board_id, userId],
  );
  if (memberResult.rows.length === 0) {
    throw new ForbiddenError('You are not a member of this board');
  }

  return {
    card,
    boardId: card.board_id as string,
    boardRole: memberResult.rows[0].role as string,
  };
}

// ------------------------------------------------------------------ //
//  All routes require authentication                                  //
// ------------------------------------------------------------------ //

router.use(authenticate);

// ------------------------------------------------------------------ //
//  GET /search  -  search cards across all boards the user can access //
// ------------------------------------------------------------------ //

router.get(
  '/search',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const q = (req.query.q as string || '').trim();
      if (!q) {
        res.json([]);
        return;
      }

      const searchPattern = `%${q}%`;

      const result = await query(
        `SELECT c.id, c.list_id, c.title, c.description, c.position,
                c.due_date, c.cover_color, c.is_archived, c.created_by,
                c.created_at, c.updated_at,
                l.title AS list_title, l.board_id,
                b.title AS board_title, b.background_color
         FROM cards c
         JOIN lists l ON l.id = c.list_id
         JOIN boards b ON b.id = l.board_id
         JOIN board_members bm ON bm.board_id = b.id
         WHERE bm.user_id = $1
           AND b.is_archived = false
           AND (c.title ILIKE $2 OR c.description ILIKE $2)
         ORDER BY c.updated_at DESC
         LIMIT 25`,
        [req.user!.id, searchPattern],
      );

      const cards = result.rows.map((c) => ({
        id: c.id,
        listId: c.list_id,
        title: c.title,
        description: c.description,
        position: c.position,
        dueDate: c.due_date,
        coverColor: c.cover_color,
        isArchived: c.is_archived,
        createdBy: c.created_by,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
        listTitle: c.list_title,
        boardId: c.board_id,
        boardTitle: c.board_title,
        boardBackgroundColor: c.background_color,
      }));

      res.json(cards);
    } catch (err) {
      next(err);
    }
  },
);

// ------------------------------------------------------------------ //
//  POST /  -  create a card                                           //
// ------------------------------------------------------------------ //

router.post(
  '/',
  validate(createCardSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { listId, title, description, dueDate } = req.body;

      await getBoardIdFromList(listId, req.user!.id);

      // Determine next position in the list
      const posResult = await query(
        `SELECT COALESCE(MAX(position), -1) + 1 AS next_pos
         FROM cards
         WHERE list_id = $1 AND is_archived = false`,
        [listId],
      );
      const nextPosition = posResult.rows[0].next_pos;

      const result = await query(
        `INSERT INTO cards (list_id, title, description, due_date, position, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, list_id, title, description, position, due_date,
                   cover_color, created_by, created_at, updated_at`,
        [listId, title, description || null, dueDate || null, nextPosition, req.user!.id],
      );

      const card = result.rows[0];

      res.status(201).json({
        id: card.id,
        listId: card.list_id,
        title: card.title,
        description: card.description,
        position: card.position,
        dueDate: card.due_date,
        coverColor: card.cover_color,
        createdBy: card.created_by,
        createdAt: card.created_at,
        updatedAt: card.updated_at,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ------------------------------------------------------------------ //
//  GET /:cardId  -  full card details                                 //
// ------------------------------------------------------------------ //

router.get(
  '/:cardId',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { cardId } = req.params;
      const { card } = await getCardAndVerifyAccess(cardId, req.user!.id);

      // Labels
      const labelsResult = await query(
        `SELECT lb.id, lb.name, lb.color
         FROM card_labels cl
         JOIN labels lb ON lb.id = cl.label_id
         WHERE cl.card_id = $1`,
        [cardId],
      );

      // Assignments
      const assigneesResult = await query(
        `SELECT u.id, u.email, u.display_name, u.avatar_url
         FROM card_assignments ca
         JOIN users u ON u.id = ca.user_id
         WHERE ca.card_id = $1`,
        [cardId],
      );

      // Checklists with items
      const checklistsResult = await query(
        `SELECT id, title, position FROM checklists WHERE card_id = $1 ORDER BY position`,
        [cardId],
      );

      const checklistIds = checklistsResult.rows.map((cl) => cl.id);
      let checklistItemsMap: Record<string, any[]> = {};

      if (checklistIds.length > 0) {
        const itemsResult = await query(
          `SELECT id, checklist_id, content, is_checked, position
           FROM checklist_items
           WHERE checklist_id = ANY($1)
           ORDER BY position`,
          [checklistIds],
        );
        for (const item of itemsResult.rows) {
          if (!checklistItemsMap[item.checklist_id]) checklistItemsMap[item.checklist_id] = [];
          checklistItemsMap[item.checklist_id].push({
            id: item.id,
            content: item.content,
            isChecked: item.is_checked,
            position: item.position,
          });
        }
      }

      // Attachments
      const attachmentsResult = await query(
        `SELECT id, filename, original_name, mime_type, file_size, uploaded_by, created_at
         FROM attachments
         WHERE card_id = $1
         ORDER BY created_at DESC`,
        [cardId],
      );

      // Comments
      const commentsResult = await query(
        `SELECT cm.id, cm.content, cm.user_id, cm.created_at, cm.updated_at,
                u.display_name, u.avatar_url, u.email
         FROM comments cm
         JOIN users u ON u.id = cm.user_id
         WHERE cm.card_id = $1
         ORDER BY cm.created_at DESC`,
        [cardId],
      );

      res.json({
        id: card.id,
        listId: card.list_id,
        title: card.title,
        description: card.description,
        position: card.position,
        dueDate: card.due_date,
        coverColor: card.cover_color,
        isArchived: card.is_archived,
        createdBy: card.created_by,
        createdAt: card.created_at,
        updatedAt: card.updated_at,
        labels: labelsResult.rows.map((l) => ({
          id: l.id,
          name: l.name,
          color: l.color,
        })),
        assignees: assigneesResult.rows.map((a) => ({
          id: a.id,
          email: a.email,
          displayName: a.display_name,
          avatarUrl: a.avatar_url,
        })),
        checklists: checklistsResult.rows.map((cl) => ({
          id: cl.id,
          title: cl.title,
          position: cl.position,
          items: checklistItemsMap[cl.id] || [],
        })),
        attachments: attachmentsResult.rows.map((a) => ({
          id: a.id,
          filename: a.filename,
          originalName: a.original_name,
          mimeType: a.mime_type,
          fileSize: a.file_size,
          uploadedBy: a.uploaded_by,
          createdAt: a.created_at,
        })),
        comments: commentsResult.rows.map((c) => ({
          id: c.id,
          content: c.content,
          userId: c.user_id,
          displayName: c.display_name,
          avatarUrl: c.avatar_url,
          email: c.email,
          createdAt: c.created_at,
          updatedAt: c.updated_at,
        })),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ------------------------------------------------------------------ //
//  PUT /:cardId  -  update card fields                                //
// ------------------------------------------------------------------ //

router.put(
  '/:cardId',
  validate(updateCardSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { cardId } = req.params;
      const { title, description, dueDate, coverColor } = req.body;

      await getCardAndVerifyAccess(cardId, req.user!.id);

      const setClauses: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (title !== undefined) {
        setClauses.push(`title = $${paramIndex++}`);
        params.push(title);
      }
      if (description !== undefined) {
        setClauses.push(`description = $${paramIndex++}`);
        params.push(description);
      }
      if (dueDate !== undefined) {
        setClauses.push(`due_date = $${paramIndex++}`);
        params.push(dueDate);
      }
      if (coverColor !== undefined) {
        setClauses.push(`cover_color = $${paramIndex++}`);
        params.push(coverColor);
      }

      if (setClauses.length === 0) {
        res.status(400).json({ error: 'No fields to update' });
        return;
      }

      params.push(cardId);

      const result = await query(
        `UPDATE cards
         SET ${setClauses.join(', ')}
         WHERE id = $${paramIndex}
         RETURNING id, list_id, title, description, position, due_date,
                   cover_color, created_by, created_at, updated_at`,
        params,
      );

      const card = result.rows[0];

      res.json({
        id: card.id,
        listId: card.list_id,
        title: card.title,
        description: card.description,
        position: card.position,
        dueDate: card.due_date,
        coverColor: card.cover_color,
        createdBy: card.created_by,
        createdAt: card.created_at,
        updatedAt: card.updated_at,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ------------------------------------------------------------------ //
//  PUT /:cardId/move  -  move card to another list / reorder          //
// ------------------------------------------------------------------ //

router.put(
  '/:cardId/move',
  validate(moveCardSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { cardId } = req.params;
      const { targetListId, newPosition } = req.body;

      const { card, boardId } = await getCardAndVerifyAccess(cardId, req.user!.id);
      const sourceListId = card.list_id;
      const oldPosition = card.position;

      // Verify target list belongs to the same board
      const targetListResult = await query(
        'SELECT id, board_id FROM lists WHERE id = $1 AND is_archived = false',
        [targetListId],
      );
      if (targetListResult.rows.length === 0) {
        throw new NotFoundError('Target list not found');
      }
      if (targetListResult.rows[0].board_id !== boardId) {
        throw new ForbiddenError('Target list must be on the same board');
      }

      if (sourceListId === targetListId) {
        // Moving within the same list
        if (oldPosition === newPosition) {
          res.json({ message: 'Position unchanged' });
          return;
        }

        if (newPosition < oldPosition) {
          await query(
            `UPDATE cards
             SET position = position + 1
             WHERE list_id = $1 AND is_archived = false
               AND position >= $2 AND position < $3 AND id != $4`,
            [sourceListId, newPosition, oldPosition, cardId],
          );
        } else {
          await query(
            `UPDATE cards
             SET position = position - 1
             WHERE list_id = $1 AND is_archived = false
               AND position > $2 AND position <= $3 AND id != $4`,
            [sourceListId, oldPosition, newPosition, cardId],
          );
        }

        await query(
          'UPDATE cards SET position = $1 WHERE id = $2',
          [newPosition, cardId],
        );
      } else {
        // Moving to a different list

        // Close the gap in the source list
        await query(
          `UPDATE cards
           SET position = position - 1
           WHERE list_id = $1 AND is_archived = false
             AND position > $2`,
          [sourceListId, oldPosition],
        );

        // Make room in the target list
        await query(
          `UPDATE cards
           SET position = position + 1
           WHERE list_id = $1 AND is_archived = false
             AND position >= $2`,
          [targetListId, newPosition],
        );

        // Move the card
        await query(
          'UPDATE cards SET list_id = $1, position = $2 WHERE id = $3',
          [targetListId, newPosition, cardId],
        );
      }

      res.json({
        message: 'Card moved successfully',
        listId: targetListId,
        newPosition,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ------------------------------------------------------------------ //
//  DELETE /:cardId  -  archive card                                   //
// ------------------------------------------------------------------ //

router.delete(
  '/:cardId',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { cardId } = req.params;

      await getCardAndVerifyAccess(cardId, req.user!.id);

      await query(
        'UPDATE cards SET is_archived = true WHERE id = $1',
        [cardId],
      );

      res.json({ message: 'Card archived successfully' });
    } catch (err) {
      next(err);
    }
  },
);

// ------------------------------------------------------------------ //
//  PUT /:cardId/restore  -  restore an archived card                  //
// ------------------------------------------------------------------ //

router.put(
  '/:cardId/restore',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { cardId } = req.params;

      await getCardAndVerifyAccess(cardId, req.user!.id);

      // Place the card at the end of its list
      const card = (await query('SELECT list_id FROM cards WHERE id = $1', [cardId])).rows[0];

      const posResult = await query(
        `SELECT COALESCE(MAX(position), -1) + 1 AS next_pos
         FROM cards
         WHERE list_id = $1 AND is_archived = false`,
        [card.list_id],
      );

      await query(
        'UPDATE cards SET is_archived = false, position = $1 WHERE id = $2',
        [posResult.rows[0].next_pos, cardId],
      );

      res.json({ message: 'Card restored successfully' });
    } catch (err) {
      next(err);
    }
  },
);

// ------------------------------------------------------------------ //
//  POST /:cardId/labels  -  add label to card                        //
// ------------------------------------------------------------------ //

router.post(
  '/:cardId/labels',
  validate(addLabelSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { cardId } = req.params;
      const { labelId } = req.body;

      const { boardId } = await getCardAndVerifyAccess(cardId, req.user!.id);

      // Verify the label belongs to the same board
      const labelResult = await query(
        'SELECT id, board_id, name, color FROM labels WHERE id = $1',
        [labelId],
      );
      if (labelResult.rows.length === 0) {
        throw new NotFoundError('Label not found');
      }
      if (labelResult.rows[0].board_id !== boardId) {
        throw new ForbiddenError('Label does not belong to this board');
      }

      // Insert (ignore conflict if already applied)
      await query(
        `INSERT INTO card_labels (card_id, label_id)
         VALUES ($1, $2)
         ON CONFLICT (card_id, label_id) DO NOTHING`,
        [cardId, labelId],
      );

      const label = labelResult.rows[0];

      res.status(201).json({
        cardId,
        labelId: label.id,
        name: label.name,
        color: label.color,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ------------------------------------------------------------------ //
//  DELETE /:cardId/labels/:labelId  -  remove label from card         //
// ------------------------------------------------------------------ //

router.delete(
  '/:cardId/labels/:labelId',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { cardId, labelId } = req.params;

      await getCardAndVerifyAccess(cardId, req.user!.id);

      const result = await query(
        'DELETE FROM card_labels WHERE card_id = $1 AND label_id = $2',
        [cardId, labelId],
      );

      if (result.rowCount === 0) {
        throw new NotFoundError('Label not found on this card');
      }

      res.json({ message: 'Label removed from card' });
    } catch (err) {
      next(err);
    }
  },
);

// ------------------------------------------------------------------ //
//  POST /:cardId/assign  -  assign user to card                      //
// ------------------------------------------------------------------ //

router.post(
  '/:cardId/assign',
  validate(assignUserSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { cardId } = req.params;
      const { userId } = req.body;

      const { boardId } = await getCardAndVerifyAccess(cardId, req.user!.id);

      // Verify the target user is a member of the board
      const memberResult = await query(
        'SELECT user_id FROM board_members WHERE board_id = $1 AND user_id = $2',
        [boardId, userId],
      );
      if (memberResult.rows.length === 0) {
        throw new ForbiddenError('User is not a member of this board');
      }

      await query(
        `INSERT INTO card_assignments (card_id, user_id)
         VALUES ($1, $2)
         ON CONFLICT (card_id, user_id) DO NOTHING`,
        [cardId, userId],
      );

      // Fetch user info to return
      const userResult = await query(
        'SELECT id, email, display_name, avatar_url FROM users WHERE id = $1',
        [userId],
      );
      const user = userResult.rows[0];

      res.status(201).json({
        cardId,
        userId: user.id,
        email: user.email,
        displayName: user.display_name,
        avatarUrl: user.avatar_url,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ------------------------------------------------------------------ //
//  DELETE /:cardId/assign/:userId  -  unassign user from card         //
// ------------------------------------------------------------------ //

router.delete(
  '/:cardId/assign/:userId',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { cardId, userId } = req.params;

      await getCardAndVerifyAccess(cardId, req.user!.id);

      const result = await query(
        'DELETE FROM card_assignments WHERE card_id = $1 AND user_id = $2',
        [cardId, userId],
      );

      if (result.rowCount === 0) {
        throw new NotFoundError('User is not assigned to this card');
      }

      res.json({ message: 'User unassigned from card' });
    } catch (err) {
      next(err);
    }
  },
);

// ------------------------------------------------------------------ //
//  POST /:cardId/comments  -  add comment to card                    //
// ------------------------------------------------------------------ //

router.post(
  '/:cardId/comments',
  validate(addCommentSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { cardId } = req.params;
      const { content } = req.body;

      await getCardAndVerifyAccess(cardId, req.user!.id);

      const result = await query(
        `INSERT INTO comments (card_id, user_id, content)
         VALUES ($1, $2, $3)
         RETURNING id, card_id, user_id, content, created_at, updated_at`,
        [cardId, req.user!.id, content],
      );

      const comment = result.rows[0];

      // Fetch user display info
      const userResult = await query(
        'SELECT display_name, avatar_url, email FROM users WHERE id = $1',
        [req.user!.id],
      );
      const user = userResult.rows[0];

      res.status(201).json({
        id: comment.id,
        cardId: comment.card_id,
        userId: comment.user_id,
        content: comment.content,
        displayName: user.display_name,
        avatarUrl: user.avatar_url,
        email: user.email,
        createdAt: comment.created_at,
        updatedAt: comment.updated_at,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ------------------------------------------------------------------ //
//  DELETE /:cardId/comments/:commentId  -  delete comment             //
// ------------------------------------------------------------------ //

router.delete(
  '/:cardId/comments/:commentId',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { cardId, commentId } = req.params;

      const { boardRole } = await getCardAndVerifyAccess(cardId, req.user!.id);

      // Fetch the comment
      const commentResult = await query(
        'SELECT id, user_id FROM comments WHERE id = $1 AND card_id = $2',
        [commentId, cardId],
      );
      if (commentResult.rows.length === 0) {
        throw new NotFoundError('Comment not found');
      }

      const comment = commentResult.rows[0];

      // Only the comment author or a board admin can delete
      if (comment.user_id !== req.user!.id && boardRole !== 'admin') {
        throw new ForbiddenError('You can only delete your own comments');
      }

      await query('DELETE FROM comments WHERE id = $1', [commentId]);

      res.json({ message: 'Comment deleted successfully' });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
