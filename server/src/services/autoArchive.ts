import { query } from '../db/pool';

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // check every hour
let lastArchivedDay: number | null = null;

async function runAutoArchive(): Promise<void> {
  const now = new Date();
  const currentDay = now.getDay(); // 0 = Sunday, 6 = Saturday

  // Only run once per day (skip if we already archived today)
  if (lastArchivedDay === currentDay) return;

  try {
    // Find all non-archived lists that have auto_archive_day matching today
    const listsResult = await query(
      `SELECT l.id, l.title, b.title AS board_title
       FROM lists l
       JOIN boards b ON b.id = l.board_id
       WHERE l.auto_archive_day = $1
         AND l.is_archived = false
         AND b.is_archived = false`,
      [currentDay],
    );

    if (listsResult.rows.length === 0) {
      lastArchivedDay = currentDay;
      return;
    }

    for (const list of listsResult.rows) {
      const result = await query(
        `UPDATE cards SET is_archived = true
         WHERE list_id = $1 AND is_archived = false`,
        [list.id],
      );

      const count = result.rowCount ?? 0;
      if (count > 0) {
        console.log(
          `[Auto-Archive] Archived ${count} card(s) from "${list.title}" on board "${list.board_title}"`,
        );
      }
    }

    lastArchivedDay = currentDay;
  } catch (error) {
    console.error('[Auto-Archive] Error running auto-archive:', error);
  }
}

export function startAutoArchiveScheduler(): void {
  console.log('[Auto-Archive] Scheduler started (checks every hour)');

  // Run an initial check on startup
  runAutoArchive();

  // Then check every hour
  setInterval(runAutoArchive, CHECK_INTERVAL_MS);
}
