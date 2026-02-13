import { Router, Response, NextFunction } from 'express';
import { query } from '../db/pool';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// ------------------------------------------------------------------ //
//  Trello colour name → hex mapping                                   //
// ------------------------------------------------------------------ //

const TRELLO_COLORS: Record<string, string> = {
  green: '#61BD4F',
  yellow: '#F2D600',
  orange: '#FF9F1A',
  red: '#EB5A46',
  purple: '#C377E0',
  blue: '#0079BF',
  sky: '#00C2E0',
  lime: '#51E898',
  pink: '#FF78CB',
  black: '#344563',
  green_dark: '#519839',
  yellow_dark: '#D9B51C',
  orange_dark: '#CD8313',
  red_dark: '#B04632',
  purple_dark: '#89609E',
  blue_dark: '#055A8C',
  sky_dark: '#0098B7',
  lime_dark: '#4BBF6B',
  pink_dark: '#EF7564',
  black_dark: '#091E42',
  green_light: '#B3F1B0',
  yellow_light: '#FCEEA6',
  orange_light: '#FDDEB2',
  red_light: '#F5C4C0',
  purple_light: '#DFC0EB',
  blue_light: '#BDDFEF',
  sky_light: '#B3ECF5',
  lime_light: '#B3F1B0',
  pink_light: '#FFCCE5',
  black_light: '#8C9BAB',
};

function trelloColorToHex(color: string | null): string {
  if (!color) return '#B3B3B3';
  return TRELLO_COLORS[color] || '#B3B3B3';
}

// ------------------------------------------------------------------ //
//  All routes require authentication                                  //
// ------------------------------------------------------------------ //

router.use(authenticate);

// ------------------------------------------------------------------ //
//  POST /trello  -  import a Trello JSON board export                 //
// ------------------------------------------------------------------ //

router.post(
  '/trello',
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const trelloData = req.body;
      const userId = req.user!.id;

      // ------------------------------------------------------------ //
      //  Validate basic structure                                      //
      // ------------------------------------------------------------ //

      if (!trelloData || !trelloData.name) {
        res.status(400).json({
          error: 'Invalid Trello export. Make sure you uploaded the raw JSON file from Trello.',
        });
        return;
      }

      const boardName = trelloData.name || 'Imported Board';
      const boardDesc = trelloData.desc || null;

      // ------------------------------------------------------------ //
      //  1. Create the board                                           //
      // ------------------------------------------------------------ //

      const boardResult = await query(
        `INSERT INTO boards (title, description, background_color, created_by)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [boardName, boardDesc, '#0079BF', userId],
      );
      const boardId = boardResult.rows[0].id;

      // Add the importing user as admin
      await query(
        `INSERT INTO board_members (board_id, user_id, role)
         VALUES ($1, $2, 'admin')`,
        [boardId, userId],
      );

      // ------------------------------------------------------------ //
      //  2. Import lists                                               //
      // ------------------------------------------------------------ //

      const trelloLists: any[] = (trelloData.lists || [])
        .sort((a: any, b: any) => (a.pos || 0) - (b.pos || 0));

      // Map: trello list id → our list id
      const listIdMap: Record<string, string> = {};

      for (let i = 0; i < trelloLists.length; i++) {
        const tl = trelloLists[i];
        const listResult = await query(
          `INSERT INTO lists (board_id, title, position, is_archived)
           VALUES ($1, $2, $3, $4)
           RETURNING id`,
          [boardId, tl.name || 'Untitled List', i, tl.closed === true],
        );
        listIdMap[tl.id] = listResult.rows[0].id;
      }

      // ------------------------------------------------------------ //
      //  3. Import labels                                              //
      // ------------------------------------------------------------ //

      const trelloLabels: any[] = trelloData.labels || [];

      // Map: trello label id → our label id
      const labelIdMap: Record<string, string> = {};

      for (const tl of trelloLabels) {
        // Trello can have labels with no name and only a color
        const name = tl.name || null;
        const color = trelloColorToHex(tl.color);

        const labelResult = await query(
          `INSERT INTO labels (board_id, name, color)
           VALUES ($1, $2, $3)
           RETURNING id`,
          [boardId, name, color],
        );
        labelIdMap[tl.id] = labelResult.rows[0].id;
      }

      // ------------------------------------------------------------ //
      //  4. Import cards                                               //
      // ------------------------------------------------------------ //

      const trelloCards: any[] = (trelloData.cards || [])
        .sort((a: any, b: any) => (a.pos || 0) - (b.pos || 0));

      // We need to assign positions per-list
      const listPositionCounters: Record<string, number> = {};

      // Map: trello card id → our card id
      const cardIdMap: Record<string, string> = {};

      let importedCards = 0;
      let skippedCards = 0;

      for (const tc of trelloCards) {
        const ourListId = listIdMap[tc.idList];
        if (!ourListId) {
          skippedCards++;
          continue; // Card belongs to a list we don't have
        }

        // Track position per list
        if (!(ourListId in listPositionCounters)) {
          listPositionCounters[ourListId] = 0;
        }
        const position = listPositionCounters[ourListId]++;

        const dueDate = tc.due || null;
        const isArchived = tc.closed === true;

        const cardResult = await query(
          `INSERT INTO cards (list_id, title, description, position, due_date, is_archived, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id`,
          [
            ourListId,
            tc.name || 'Untitled Card',
            tc.desc || null,
            position,
            dueDate,
            isArchived,
            userId,
          ],
        );
        cardIdMap[tc.id] = cardResult.rows[0].id;
        importedCards++;

        // ---------------------------------------------------------- //
        //  4a. Card labels                                             //
        // ---------------------------------------------------------- //

        const cardLabels: any[] = tc.labels || tc.idLabels || [];
        for (const cl of cardLabels) {
          // cl might be an object with .id or just a string id
          const trelloLabelId = typeof cl === 'string' ? cl : cl.id;
          const ourLabelId = labelIdMap[trelloLabelId];
          if (ourLabelId) {
            await query(
              `INSERT INTO card_labels (card_id, label_id)
               VALUES ($1, $2)
               ON CONFLICT (card_id, label_id) DO NOTHING`,
              [cardResult.rows[0].id, ourLabelId],
            );
          }
        }
      }

      // ------------------------------------------------------------ //
      //  5. Import checklists                                          //
      // ------------------------------------------------------------ //

      const trelloChecklists: any[] = trelloData.checklists || [];
      let importedChecklists = 0;

      for (const tcl of trelloChecklists) {
        const ourCardId = cardIdMap[tcl.idCard];
        if (!ourCardId) continue;

        const clResult = await query(
          `INSERT INTO checklists (card_id, title, position)
           VALUES ($1, $2, $3)
           RETURNING id`,
          [ourCardId, tcl.name || 'Checklist', tcl.pos || 0],
        );
        const checklistId = clResult.rows[0].id;
        importedChecklists++;

        // Checklist items
        const items: any[] = (tcl.checkItems || [])
          .sort((a: any, b: any) => (a.pos || 0) - (b.pos || 0));

        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          await query(
            `INSERT INTO checklist_items (checklist_id, content, is_checked, position)
             VALUES ($1, $2, $3, $4)`,
            [
              checklistId,
              item.name || item.text || 'Item',
              item.state === 'complete',
              i,
            ],
          );
        }
      }

      // ------------------------------------------------------------ //
      //  6. Return summary                                             //
      // ------------------------------------------------------------ //

      res.status(201).json({
        message: 'Trello board imported successfully',
        boardId,
        boardName,
        summary: {
          lists: Object.keys(listIdMap).length,
          cards: importedCards,
          skippedCards,
          labels: Object.keys(labelIdMap).length,
          checklists: importedChecklists,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
