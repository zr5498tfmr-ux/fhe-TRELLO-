import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { importApi, TrelloImportResult } from '../services/api';

// ------------------------------------------------------------------ //
//  Styles                                                              //
// ------------------------------------------------------------------ //

const COLORS = {
  primary: '#0079BF',
  primaryHover: '#026AA7',
  bg: '#F4F5F7',
  text: '#172B4D',
  textSecondary: '#5E6C84',
  success: '#61BD4F',
  danger: '#EB5A46',
  card: '#FFFFFF',
};

const styles: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 640,
    margin: '40px auto',
    padding: '0 20px',
  },
  heading: {
    fontSize: 24,
    fontWeight: 700,
    color: COLORS.text,
    marginBottom: 8,
  },
  subheading: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 32,
    lineHeight: 1.6,
  },
  stepCard: {
    background: COLORS.card,
    borderRadius: 8,
    padding: '20px 24px',
    marginBottom: 16,
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  },
  stepNumber: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    borderRadius: '50%',
    background: COLORS.primary,
    color: '#fff',
    fontSize: 13,
    fontWeight: 700,
    marginRight: 10,
    flexShrink: 0,
  },
  stepTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: COLORS.text,
    display: 'flex',
    alignItems: 'center',
    marginBottom: 10,
  },
  stepDesc: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 1.6,
    marginLeft: 38,
  },
  dropZone: {
    border: '2px dashed #C1C7D0',
    borderRadius: 8,
    padding: '40px 20px',
    textAlign: 'center' as const,
    cursor: 'pointer',
    transition: 'border-color 0.2s, background 0.2s',
    marginTop: 16,
  },
  dropZoneActive: {
    borderColor: COLORS.primary,
    background: 'rgba(0,121,191,0.05)',
  },
  dropZoneText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  browseLink: {
    color: COLORS.primary,
    fontWeight: 600,
    cursor: 'pointer',
    textDecoration: 'underline',
  },
  fileName: {
    fontSize: 13,
    color: COLORS.text,
    marginTop: 12,
    padding: '8px 12px',
    background: COLORS.bg,
    borderRadius: 4,
    display: 'inline-block',
  },
  importBtn: {
    display: 'block',
    width: '100%',
    padding: '12px 20px',
    fontSize: 15,
    fontWeight: 600,
    color: '#fff',
    background: COLORS.primary,
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    marginTop: 24,
    transition: 'background 0.15s',
  },
  importBtnDisabled: {
    background: '#C1C7D0',
    cursor: 'not-allowed',
  },
  errorMsg: {
    background: 'rgba(235,90,70,0.1)',
    color: COLORS.danger,
    padding: '12px 16px',
    borderRadius: 6,
    fontSize: 13,
    marginTop: 16,
  },
  successCard: {
    background: '#E4FCE4',
    borderRadius: 8,
    padding: '24px',
    textAlign: 'center' as const,
    marginTop: 24,
  },
  successTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: COLORS.success,
    marginBottom: 12,
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 12,
    marginTop: 16,
    marginBottom: 20,
  },
  summaryItem: {
    background: COLORS.card,
    borderRadius: 6,
    padding: '12px',
    textAlign: 'center' as const,
  },
  summaryNumber: {
    fontSize: 22,
    fontWeight: 700,
    color: COLORS.text,
  },
  summaryLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  goBtn: {
    display: 'inline-block',
    padding: '10px 24px',
    fontSize: 14,
    fontWeight: 600,
    color: '#fff',
    background: COLORS.primary,
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    textDecoration: 'none',
    transition: 'background 0.15s',
  },
};

// ------------------------------------------------------------------ //
//  Component                                                           //
// ------------------------------------------------------------------ //

export default function ImportPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<any>(null);
  const [dragOver, setDragOver] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TrelloImportResult | null>(null);

  // Preview info from parsed JSON
  const preview = parsedData
    ? {
        name: parsedData.name || 'Unknown Board',
        lists: (parsedData.lists || []).length,
        cards: (parsedData.cards || []).length,
        labels: (parsedData.labels || []).filter((l: any) => l.name).length,
        checklists: (parsedData.checklists || []).length,
      }
    : null;

  const handleFileSelect = (f: File) => {
    setError(null);
    setResult(null);

    if (!f.name.endsWith('.json')) {
      setError('Please select a .json file exported from Trello.');
      return;
    }

    setFile(f);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        if (!data.name && !data.cards) {
          setError('This doesn\'t look like a Trello board export. Make sure you exported the board as JSON from Trello.');
          setParsedData(null);
          return;
        }
        setParsedData(data);
      } catch {
        setError('Could not parse the JSON file. Make sure the file is not corrupted.');
        setParsedData(null);
      }
    };
    reader.readAsText(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFileSelect(f);
  };

  const handleImport = async () => {
    if (!parsedData || importing) return;
    setImporting(true);
    setError(null);

    try {
      const res = await importApi.trello(parsedData);
      setResult(res);
    } catch (err: any) {
      setError(err.message || 'Import failed. Please try again.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div style={styles.page}>
      <h1 style={styles.heading}>Import from Trello</h1>
      <p style={styles.subheading}>
        Bring your existing Trello boards into FHE Project Board. Your lists, cards,
        labels, checklists, and due dates will all be imported.
      </p>

      {/* Step 1 */}
      <div style={styles.stepCard}>
        <div style={styles.stepTitle}>
          <span style={styles.stepNumber}>1</span>
          Export from Trello
        </div>
        <div style={styles.stepDesc}>
          Open your Trello board &rarr; click <strong>Menu</strong> (top right) &rarr;{' '}
          <strong>More</strong> &rarr; <strong>Print and Export</strong> &rarr;{' '}
          <strong>Export as JSON</strong>. Save the .json file to your computer.
        </div>
      </div>

      {/* Step 2 */}
      <div style={styles.stepCard}>
        <div style={styles.stepTitle}>
          <span style={styles.stepNumber}>2</span>
          Upload the JSON file
        </div>

        {!result && (
          <>
            <div
              style={{
                ...styles.dropZone,
                ...(dragOver ? styles.dropZoneActive : {}),
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <div style={styles.dropZoneText}>
                Drag & drop your Trello JSON file here
              </div>
              <div>
                or <span style={styles.browseLink}>browse files</span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileSelect(f);
                }}
              />
            </div>

            {file && (
              <div style={styles.fileName}>
                {file.name} ({(file.size / 1024).toFixed(1)} KB)
              </div>
            )}

            {/* Preview */}
            {preview && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: COLORS.text, marginBottom: 8 }}>
                  Preview: {preview.name}
                </div>
                <div style={styles.summaryGrid}>
                  <div style={styles.summaryItem}>
                    <div style={styles.summaryNumber}>{preview.lists}</div>
                    <div style={styles.summaryLabel}>Lists</div>
                  </div>
                  <div style={styles.summaryItem}>
                    <div style={styles.summaryNumber}>{preview.cards}</div>
                    <div style={styles.summaryLabel}>Cards</div>
                  </div>
                  <div style={styles.summaryItem}>
                    <div style={styles.summaryNumber}>{preview.checklists}</div>
                    <div style={styles.summaryLabel}>Checklists</div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {error && <div style={styles.errorMsg}>{error}</div>}
      </div>

      {/* Step 3: Import button or result */}
      {!result && parsedData && (
        <button
          style={{
            ...styles.importBtn,
            ...(importing ? styles.importBtnDisabled : {}),
          }}
          onClick={handleImport}
          disabled={importing}
          onMouseEnter={(e) => {
            if (!importing) e.currentTarget.style.background = COLORS.primaryHover;
          }}
          onMouseLeave={(e) => {
            if (!importing) e.currentTarget.style.background = COLORS.primary;
          }}
        >
          {importing ? 'Importing...' : `Import "${preview?.name}" into FHE`}
        </button>
      )}

      {/* Success result */}
      {result && (
        <div style={styles.successCard}>
          <div style={styles.successTitle}>Import Complete</div>
          <div style={{ fontSize: 14, color: COLORS.text, marginBottom: 4 }}>
            <strong>{result.boardName}</strong> has been imported successfully.
          </div>
          <div style={styles.summaryGrid}>
            <div style={styles.summaryItem}>
              <div style={styles.summaryNumber}>{result.summary.lists}</div>
              <div style={styles.summaryLabel}>Lists</div>
            </div>
            <div style={styles.summaryItem}>
              <div style={styles.summaryNumber}>{result.summary.cards}</div>
              <div style={styles.summaryLabel}>Cards</div>
            </div>
            <div style={styles.summaryItem}>
              <div style={styles.summaryNumber}>{result.summary.labels}</div>
              <div style={styles.summaryLabel}>Labels</div>
            </div>
            <div style={styles.summaryItem}>
              <div style={styles.summaryNumber}>{result.summary.checklists}</div>
              <div style={styles.summaryLabel}>Checklists</div>
            </div>
            {result.summary.skippedCards > 0 && (
              <div style={styles.summaryItem}>
                <div style={{ ...styles.summaryNumber, color: COLORS.danger }}>
                  {result.summary.skippedCards}
                </div>
                <div style={styles.summaryLabel}>Skipped</div>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button
              style={styles.goBtn}
              onClick={() => navigate(`/board/${result.boardId}`)}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = COLORS.primaryHover;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = COLORS.primary;
              }}
            >
              Open Board
            </button>
            <button
              style={{
                ...styles.goBtn,
                background: 'transparent',
                color: COLORS.primary,
                border: `1px solid ${COLORS.primary}`,
              }}
              onClick={() => {
                setFile(null);
                setParsedData(null);
                setResult(null);
                setError(null);
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(0,121,191,0.08)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              Import Another
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
