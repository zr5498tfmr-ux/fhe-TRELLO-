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

const createBoardSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255),
  description: z.string().max(5000).optional(),
  backgroundColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color').optional(),
});

const updateBoardSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(5000).nullable().optional(),
  backgroundColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color').optional(),
});

const addMemberSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
  role: z.enum(['admin', 'member', 'viewer']).optional().default('member'),
});

// ------------------------------------------------------------------ //
//  Helpers                                                            //
// ------------------------------------------------------------------ //

/**
 * Look up the requesting user's role on a board.
 * Returns the role string or null if not a member.
 */
async function getBoardMemberRole(boardId: string, userId: string): Promise<string | null> {
  const result = await query(
    'SELECT role FROM board_members WHERE board_id = $1 AND user_id = $2',
    [boardId, userId],
  );
  return result.rows.length > 0 ? result.rows[0].role : null;
}

/**
 * Middleware: ensure the board exists (and is not archived) and that
 * the requesting user is a member.  Throws NotFoundError / ForbiddenError.
 */
async function requireBoardMembership(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const boardId = req.params.boardId;
    const userId = req.user!.id;

    // Verify the board exists and is not archived
    const boardResult = await query(
      'SELECT id FROM boards WHERE id = $1 AND is_archived = false',
      [boardId],
    );
    if (boardResult.rows.length === 0) {
      throw new NotFoundError('Board not found');
    }

    // Verify membership
    const role = await getBoardMemberRole(boardId, userId);
    if (!role) {
      throw new ForbiddenError('You are not a member of this board');
    }

    // Attach the board role to the request for downstream use
    (req as any).boardRole = role;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Middleware: additionally require the user to be a board admin.
 */
async function requireBoardAdmin(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const boardRole = (req as any).boardRole as string | undefined;
    if (boardRole !== 'admin') {
      throw new ForbiddenError('Board admin access required');
    }
    next();
  } catch (err) {
    next(err);
  }
}

// ------------------------------------------------------------------ //
//  All routes require authentication                                  //
// ------------------------------------------------------------------ //

router.use(authenticate);

// ------------------------------------------------------------------ //
//  GET /  -  list boards the user is a member of                      //
// ------------------------------------------------------------------ //

router.get(
  '/',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const result = await query(
        `SELECT b.id, b.title, b.description, b.background_color, b.created_at, b.updated_at,
                bm.role AS member_role
         FROM boards b
         JOIN board_members bm ON bm.board_id = b.id
         WHERE bm.user_id = $1 AND b.is_archived = false
         ORDER BY b.updated_at DESC`,
        [req.user!.id],
      );

      const boards = result.rows.map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        backgroundColor: row.background_color,
        memberRole: row.member_role,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));

      res.json(boards);
    } catch (err) {
      next(err);
    }
  },
);

// ------------------------------------------------------------------ //
//  POST /  -  create a new board                                      //
// ------------------------------------------------------------------ //

router.post(
  '/',
  validate(createBoardSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { title, description, backgroundColor } = req.body;
      const userId = req.user!.id;

      // Create the board
      const boardResult = await query(
        `INSERT INTO boards (title, description, background_color, created_by)
         VALUES ($1, $2, $3, $4)
         RETURNING id, title, description, background_color, created_by, created_at, updated_at`,
        [title, description || null, backgroundColor || '#0079BF', userId],
      );

      const board = boardResult.rows[0];

      // Add creator as admin member
      await query(
        `INSERT INTO board_members (board_id, user_id, role)
         VALUES ($1, $2, 'admin')`,
        [board.id, userId],
      );

      // Create default lists
      const defaultLists = ['To Do', 'In Progress', 'Review', 'Done'];
      for (let i = 0; i < defaultLists.length; i++) {
        await query(
          `INSERT INTO lists (board_id, title, position)
           VALUES ($1, $2, $3)`,
          [board.id, defaultLists[i], i],
        );
      }

      // Fetch the created lists to return them
      const listsResult = await query(
        `SELECT id, title, position FROM lists WHERE board_id = $1 ORDER BY position`,
        [board.id],
      );

      res.status(201).json({
        id: board.id,
        title: board.title,
        description: board.description,
        backgroundColor: board.background_color,
        createdBy: board.created_by,
        createdAt: board.created_at,
        updatedAt: board.updated_at,
        lists: listsResult.rows.map((l) => ({
          id: l.id,
          title: l.title,
          position: l.position,
        })),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ------------------------------------------------------------------ //
//  GET /:boardId  -  full board with lists, cards, labels, members    //
// ------------------------------------------------------------------ //

router.get(
  '/:boardId',
  requireBoardMembership,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { boardId } = req.params;

      // Board details
      const boardResult = await query(
        `SELECT id, title, description, background_color, created_by, created_at, updated_at
         FROM boards
         WHERE id = $1`,
        [boardId],
      );
      const board = boardResult.rows[0];

      // Members
      const membersResult = await query(
        `SELECT bm.user_id, bm.role, u.email, u.display_name, u.avatar_url
         FROM board_members bm
         JOIN users u ON u.id = bm.user_id
         WHERE bm.board_id = $1
         ORDER BY bm.created_at`,
        [boardId],
      );

      // Labels
      const labelsResult = await query(
        `SELECT id, name, color FROM labels WHERE board_id = $1 ORDER BY name`,
        [boardId],
      );

      // Lists (non-archived) with their cards
      const listsResult = await query(
        `SELECT id, title, position, auto_archive_day
         FROM lists
         WHERE board_id = $1 AND is_archived = false
         ORDER BY position`,
        [boardId],
      );

      // Cards (non-archived) for all lists on this board
      const cardsResult = await query(
        `SELECT c.id, c.list_id, c.title, c.description, c.position, c.due_date,
                c.cover_color, c.created_by, c.created_at, c.updated_at
         FROM cards c
         JOIN lists l ON l.id = c.list_id
         WHERE l.board_id = $1 AND c.is_archived = false AND l.is_archived = false
         ORDER BY c.position`,
        [boardId],
      );

      // Card labels for all cards on this board
      const cardLabelsResult = await query(
        `SELECT cl.card_id, cl.label_id, lb.name, lb.color
         FROM card_labels cl
         JOIN labels lb ON lb.id = cl.label_id
         JOIN cards c ON c.id = cl.card_id
         JOIN lists l ON l.id = c.list_id
         WHERE l.board_id = $1 AND c.is_archived = false`,
        [boardId],
      );

      // Card assignments for all cards on this board
      const assignmentsResult = await query(
        `SELECT ca.card_id, ca.user_id, u.display_name, u.avatar_url, u.email
         FROM card_assignments ca
         JOIN users u ON u.id = ca.user_id
         JOIN cards c ON c.id = ca.card_id
         JOIN lists l ON l.id = c.list_id
         WHERE l.board_id = $1 AND c.is_archived = false`,
        [boardId],
      );

      // Build label and assignment maps indexed by card_id
      const cardLabelsMap: Record<string, any[]> = {};
      for (const cl of cardLabelsResult.rows) {
        if (!cardLabelsMap[cl.card_id]) cardLabelsMap[cl.card_id] = [];
        cardLabelsMap[cl.card_id].push({
          labelId: cl.label_id,
          name: cl.name,
          color: cl.color,
        });
      }

      const assignmentsMap: Record<string, any[]> = {};
      for (const a of assignmentsResult.rows) {
        if (!assignmentsMap[a.card_id]) assignmentsMap[a.card_id] = [];
        assignmentsMap[a.card_id].push({
          userId: a.user_id,
          displayName: a.display_name,
          avatarUrl: a.avatar_url,
          email: a.email,
        });
      }

      // Build cards grouped by list_id
      const cardsMap: Record<string, any[]> = {};
      for (const c of cardsResult.rows) {
        if (!cardsMap[c.list_id]) cardsMap[c.list_id] = [];
        cardsMap[c.list_id].push({
          id: c.id,
          listId: c.list_id,
          title: c.title,
          description: c.description,
          position: c.position,
          dueDate: c.due_date,
          coverColor: c.cover_color,
          createdBy: c.created_by,
          createdAt: c.created_at,
          updatedAt: c.updated_at,
          labels: cardLabelsMap[c.id] || [],
          assignees: assignmentsMap[c.id] || [],
        });
      }

      res.json({
        id: board.id,
        title: board.title,
        description: board.description,
        backgroundColor: board.background_color,
        createdBy: board.created_by,
        createdAt: board.created_at,
        updatedAt: board.updated_at,
        members: membersResult.rows.map((m) => ({
          userId: m.user_id,
          role: m.role,
          email: m.email,
          displayName: m.display_name,
          avatarUrl: m.avatar_url,
        })),
        labels: labelsResult.rows.map((l) => ({
          id: l.id,
          name: l.name,
          color: l.color,
        })),
        lists: listsResult.rows.map((l) => ({
          id: l.id,
          title: l.title,
          position: l.position,
          autoArchiveDay: l.auto_archive_day ?? null,
          cards: cardsMap[l.id] || [],
        })),
      });
    } catch (err) {
      next(err);
    }
  },
);

// ------------------------------------------------------------------ //
//  GET /:boardId/archived-cards  -  list archived cards for a board   //
// ------------------------------------------------------------------ //

router.get(
  '/:boardId/archived-cards',
  requireBoardMembership,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { boardId } = req.params;

      const result = await query(
        `SELECT c.id, c.list_id, c.title, c.description, c.position,
                c.due_date, c.cover_color, c.is_archived, c.created_by,
                c.created_at, c.updated_at,
                l.title AS list_title
         FROM cards c
         JOIN lists l ON l.id = c.list_id
         WHERE l.board_id = $1 AND c.is_archived = true
         ORDER BY c.updated_at DESC`,
        [boardId],
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
      }));

      res.json(cards);
    } catch (err) {
      next(err);
    }
  },
);

// ------------------------------------------------------------------ //
//  PUT /:boardId  -  update board (admin only)                        //
// ------------------------------------------------------------------ //

router.put(
  '/:boardId',
  requireBoardMembership,
  requireBoardAdmin,
  validate(updateBoardSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { boardId } = req.params;
      const { title, description, backgroundColor } = req.body;

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
      if (backgroundColor !== undefined) {
        setClauses.push(`background_color = $${paramIndex++}`);
        params.push(backgroundColor);
      }

      if (setClauses.length === 0) {
        res.status(400).json({ error: 'No fields to update' });
        return;
      }

      params.push(boardId);

      const result = await query(
        `UPDATE boards
         SET ${setClauses.join(', ')}
         WHERE id = $${paramIndex}
         RETURNING id, title, description, background_color, created_at, updated_at`,
        params,
      );

      const board = result.rows[0];

      res.json({
        id: board.id,
        title: board.title,
        description: board.description,
        backgroundColor: board.background_color,
        createdAt: board.created_at,
        updatedAt: board.updated_at,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ------------------------------------------------------------------ //
//  DELETE /:boardId  -  archive board (admin only)                    //
// ------------------------------------------------------------------ //

router.delete(
  '/:boardId',
  requireBoardMembership,
  requireBoardAdmin,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { boardId } = req.params;

      await query(
        'UPDATE boards SET is_archived = true WHERE id = $1',
        [boardId],
      );

      res.json({ message: 'Board archived successfully' });
    } catch (err) {
      next(err);
    }
  },
);

// ------------------------------------------------------------------ //
//  POST /:boardId/members  -  add member to board                    //
// ------------------------------------------------------------------ //

router.post(
  '/:boardId/members',
  requireBoardMembership,
  requireBoardAdmin,
  validate(addMemberSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { boardId } = req.params;
      const { userId, role } = req.body;

      // Verify the target user exists
      const userResult = await query(
        'SELECT id, email, display_name, avatar_url FROM users WHERE id = $1 AND is_active = true',
        [userId],
      );
      if (userResult.rows.length === 0) {
        throw new NotFoundError('User not found');
      }

      // Check if already a member
      const existing = await query(
        'SELECT id FROM board_members WHERE board_id = $1 AND user_id = $2',
        [boardId, userId],
      );
      if (existing.rows.length > 0) {
        // Update role instead
        await query(
          'UPDATE board_members SET role = $1 WHERE board_id = $2 AND user_id = $3',
          [role, boardId, userId],
        );
      } else {
        await query(
          'INSERT INTO board_members (board_id, user_id, role) VALUES ($1, $2, $3)',
          [boardId, userId, role],
        );
      }

      const user = userResult.rows[0];

      res.status(201).json({
        userId: user.id,
        email: user.email,
        displayName: user.display_name,
        avatarUrl: user.avatar_url,
        role,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ------------------------------------------------------------------ //
//  DELETE /:boardId/members/:userId  -  remove member from board      //
// ------------------------------------------------------------------ //

router.delete(
  '/:boardId/members/:userId',
  requireBoardMembership,
  requireBoardAdmin,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { boardId, userId } = req.params;

      // Prevent removing yourself if you're the last admin
      if (userId === req.user!.id) {
        const adminsResult = await query(
          `SELECT COUNT(*) AS count FROM board_members
           WHERE board_id = $1 AND role = 'admin'`,
          [boardId],
        );
        if (parseInt(adminsResult.rows[0].count, 10) <= 1) {
          throw new ForbiddenError('Cannot remove the last board admin');
        }
      }

      const result = await query(
        'DELETE FROM board_members WHERE board_id = $1 AND user_id = $2',
        [boardId, userId],
      );

      if (result.rowCount === 0) {
        throw new NotFoundError('Member not found on this board');
      }

      res.json({ message: 'Member removed successfully' });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
