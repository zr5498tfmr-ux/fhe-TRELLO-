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

const createListSchema = z.object({
  boardId: z.string().uuid('Invalid board ID'),
  title: z.string().min(1, 'Title is required').max(255),
});

const updateListSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255),
});

const moveListSchema = z.object({
  newPosition: z.number().int().min(0, 'Position must be non-negative'),
});

// ------------------------------------------------------------------ //
//  Helpers                                                            //
// ------------------------------------------------------------------ //

async function verifyBoardMembership(boardId: string, userId: string): Promise<void> {
  const boardResult = await query(
    'SELECT id FROM boards WHERE id = $1 AND is_archived = false',
    [boardId],
  );
  if (boardResult.rows.length === 0) {
    throw new NotFoundError('Board not found');
  }

  const memberResult = await query(
    'SELECT role FROM board_members WHERE board_id = $1 AND user_id = $2',
    [boardId, userId],
  );
  if (memberResult.rows.length === 0) {
    throw new ForbiddenError('You are not a member of this board');
  }
}

/**
 * Fetch a list by ID and verify that the requesting user is a member
 * of the board that the list belongs to.  Returns the list row.
 */
async function getListAndVerifyAccess(listId: string, userId: string) {
  const listResult = await query(
    `SELECT l.id, l.board_id, l.title, l.position, l.is_archived
     FROM lists l
     WHERE l.id = $1`,
    [listId],
  );

  if (listResult.rows.length === 0) {
    throw new NotFoundError('List not found');
  }

  const list = listResult.rows[0];
  await verifyBoardMembership(list.board_id, userId);

  return list;
}

// ------------------------------------------------------------------ //
//  All routes require authentication                                  //
// ------------------------------------------------------------------ //

router.use(authenticate);

// ------------------------------------------------------------------ //
//  POST /  -  create a new list on a board                            //
// ------------------------------------------------------------------ //

router.post(
  '/',
  validate(createListSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { boardId, title } = req.body;

      await verifyBoardMembership(boardId, req.user!.id);

      // Determine next position
      const posResult = await query(
        `SELECT COALESCE(MAX(position), -1) + 1 AS next_pos
         FROM lists
         WHERE board_id = $1 AND is_archived = false`,
        [boardId],
      );
      const nextPosition = posResult.rows[0].next_pos;

      const result = await query(
        `INSERT INTO lists (board_id, title, position)
         VALUES ($1, $2, $3)
         RETURNING id, board_id, title, position, is_archived, created_at, updated_at`,
        [boardId, title, nextPosition],
      );

      const list = result.rows[0];

      res.status(201).json({
        id: list.id,
        boardId: list.board_id,
        title: list.title,
        position: list.position,
        isArchived: list.is_archived,
        createdAt: list.created_at,
        updatedAt: list.updated_at,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ------------------------------------------------------------------ //
//  PUT /:listId  -  update list title                                 //
// ------------------------------------------------------------------ //

router.put(
  '/:listId',
  validate(updateListSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { listId } = req.params;
      const { title } = req.body;

      await getListAndVerifyAccess(listId, req.user!.id);

      const result = await query(
        `UPDATE lists SET title = $1 WHERE id = $2
         RETURNING id, board_id, title, position, is_archived, created_at, updated_at`,
        [title, listId],
      );

      const list = result.rows[0];

      res.json({
        id: list.id,
        boardId: list.board_id,
        title: list.title,
        position: list.position,
        isArchived: list.is_archived,
        createdAt: list.created_at,
        updatedAt: list.updated_at,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ------------------------------------------------------------------ //
//  PUT /:listId/move  -  reorder list within the board                //
// ------------------------------------------------------------------ //

router.put(
  '/:listId/move',
  validate(moveListSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { listId } = req.params;
      const { newPosition } = req.body;

      const list = await getListAndVerifyAccess(listId, req.user!.id);
      const oldPosition = list.position;
      const boardId = list.board_id;

      if (oldPosition === newPosition) {
        res.json({ message: 'Position unchanged' });
        return;
      }

      // Shift other lists to make room
      if (newPosition < oldPosition) {
        // Moving left: shift lists in [newPosition, oldPosition) right by 1
        await query(
          `UPDATE lists
           SET position = position + 1
           WHERE board_id = $1 AND is_archived = false
             AND position >= $2 AND position < $3 AND id != $4`,
          [boardId, newPosition, oldPosition, listId],
        );
      } else {
        // Moving right: shift lists in (oldPosition, newPosition] left by 1
        await query(
          `UPDATE lists
           SET position = position - 1
           WHERE board_id = $1 AND is_archived = false
             AND position > $2 AND position <= $3 AND id != $4`,
          [boardId, oldPosition, newPosition, listId],
        );
      }

      // Set the list to its new position
      await query(
        'UPDATE lists SET position = $1 WHERE id = $2',
        [newPosition, listId],
      );

      res.json({ message: 'List moved successfully', newPosition });
    } catch (err) {
      next(err);
    }
  },
);

// ------------------------------------------------------------------ //
//  POST /:listId/archive-all-cards  -  archive every card on a list   //
// ------------------------------------------------------------------ //

router.post(
  '/:listId/archive-all-cards',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { listId } = req.params;

      await getListAndVerifyAccess(listId, req.user!.id);

      const result = await query(
        `UPDATE cards SET is_archived = true
         WHERE list_id = $1 AND is_archived = false`,
        [listId],
      );

      res.json({
        message: 'All cards archived',
        archivedCount: result.rowCount ?? 0,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ------------------------------------------------------------------ //
//  PUT /:listId/auto-archive  -  set weekly auto-archive day          //
// ------------------------------------------------------------------ //

const autoArchiveSchema = z.object({
  day: z.number().int().min(0).max(6).nullable(),
});

router.put(
  '/:listId/auto-archive',
  validate(autoArchiveSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { listId } = req.params;
      const { day } = req.body;

      await getListAndVerifyAccess(listId, req.user!.id);

      await query(
        'UPDATE lists SET auto_archive_day = $1 WHERE id = $2',
        [day, listId],
      );

      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

      res.json({
        message: day !== null
          ? `Auto-archive set for every ${dayNames[day]}`
          : 'Auto-archive disabled',
        autoArchiveDay: day,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ------------------------------------------------------------------ //
//  DELETE /:listId  -  archive list                                   //
// ------------------------------------------------------------------ //

router.delete(
  '/:listId',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { listId } = req.params;

      await getListAndVerifyAccess(listId, req.user!.id);

      await query(
        'UPDATE lists SET is_archived = true WHERE id = $1',
        [listId],
      );

      res.json({ message: 'List archived successfully' });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
