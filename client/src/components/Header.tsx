import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { cards as cardsApi } from '../services/api';

// ------------------------------------------------------------------ //
//  Colour palette                                                      //
// ------------------------------------------------------------------ //

const COLORS = {
  primary: '#0079BF',
  primaryDark: '#026AA7',
  card: '#FFFFFF',
  text: '#172B4D',
  textSecondary: '#5E6C84',
};

// ------------------------------------------------------------------ //
//  Styles                                                              //
// ------------------------------------------------------------------ //

const styles: Record<string, React.CSSProperties> = {
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 48,
    padding: '0 16px',
    background: COLORS.primaryDark,
    color: '#fff',
    flexShrink: 0,
  },
  left: {
    display: 'flex',
    alignItems: 'center',
    gap: 16,
  },
  brand: {
    fontSize: 18,
    fontWeight: 700,
    color: '#fff',
    textDecoration: 'none',
    letterSpacing: '-0.3px',
    whiteSpace: 'nowrap' as const,
  },
  navLink: {
    color: 'rgba(255,255,255,0.85)',
    textDecoration: 'none',
    fontSize: 13,
    fontWeight: 500,
    padding: '4px 10px',
    borderRadius: 4,
    transition: 'background 0.15s',
    whiteSpace: 'nowrap' as const,
  },
  center: {
    flex: 1,
    display: 'flex',
    justifyContent: 'center',
    maxWidth: 480,
    margin: '0 16px',
    position: 'relative' as const,
  },
  searchWrapper: {
    position: 'relative' as const,
    width: '100%',
  },
  searchInput: {
    width: '100%',
    padding: '6px 12px 6px 32px',
    fontSize: 13,
    border: 'none',
    borderRadius: 4,
    background: 'rgba(255,255,255,0.2)',
    color: '#fff',
    outline: 'none',
    boxSizing: 'border-box' as const,
    transition: 'background 0.2s, width 0.2s',
  },
  searchInputFocused: {
    background: '#fff',
    color: COLORS.text,
  },
  searchIcon: {
    position: 'absolute' as const,
    left: 10,
    top: '50%',
    transform: 'translateY(-50%)',
    fontSize: 14,
    pointerEvents: 'none' as const,
  },
  dropdown: {
    position: 'absolute' as const,
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 4,
    background: '#fff',
    borderRadius: 6,
    boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
    maxHeight: 400,
    overflowY: 'auto' as const,
    zIndex: 1000,
  },
  dropdownItem: {
    display: 'flex',
    flexDirection: 'column' as const,
    padding: '10px 14px',
    cursor: 'pointer',
    borderBottom: '1px solid #f0f0f0',
    textDecoration: 'none',
    transition: 'background 0.1s',
  },
  dropdownTitle: {
    fontSize: 14,
    fontWeight: 500,
    color: COLORS.text,
    marginBottom: 2,
  },
  dropdownMeta: {
    fontSize: 11,
    color: COLORS.textSecondary,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  archivedBadge: {
    fontSize: 10,
    fontWeight: 600,
    color: '#fff',
    background: '#EB5A46',
    padding: '1px 5px',
    borderRadius: 3,
  },
  noResults: {
    padding: '14px',
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center' as const,
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 13,
    fontWeight: 700,
    color: '#fff',
    overflow: 'hidden',
    flexShrink: 0,
  },
  avatarImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover' as const,
    borderRadius: '50%',
  },
  userName: {
    fontSize: 13,
    fontWeight: 500,
    color: '#fff',
    whiteSpace: 'nowrap' as const,
  },
  logoutButton: {
    background: 'rgba(255,255,255,0.15)',
    border: 'none',
    color: '#fff',
    fontSize: 13,
    fontWeight: 500,
    padding: '5px 12px',
    borderRadius: 4,
    cursor: 'pointer',
    transition: 'background 0.15s',
    whiteSpace: 'nowrap' as const,
  },
};

// ------------------------------------------------------------------ //
//  Component                                                           //
// ------------------------------------------------------------------ //

export default function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searching, setSearching] = useState(false);
  const [focused, setFocused] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }
    setSearching(true);
    try {
      const results = await cardsApi.search(q);
      setSearchResults(results);
      setShowDropdown(true);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 300);
  };

  const handleResultClick = (result: any) => {
    setShowDropdown(false);
    setSearchQuery('');
    navigate(`/board/${result.boardId}`);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const initials = user?.displayName
    ? user.displayName
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : '?';

  return (
    <header style={styles.header}>
      {/* Left: brand + nav */}
      <div style={styles.left}>
        <Link to="/" style={styles.brand}>
          FHE Project Board
        </Link>

        <Link
          to="/"
          style={styles.navLink}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.15)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
          }}
        >
          Boards
        </Link>

        {user?.role === 'admin' && (
          <Link
            to="/email-rules"
            style={styles.navLink}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.15)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            Email Rules
          </Link>
        )}
      </div>

      {/* Center: search bar */}
      <div style={styles.center} ref={searchRef}>
        <div style={styles.searchWrapper}>
          <span
            style={{
              ...styles.searchIcon,
              color: focused ? COLORS.textSecondary : 'rgba(255,255,255,0.7)',
            }}
          >
            &#128269;
          </span>
          <input
            type="text"
            placeholder="Search cards..."
            value={searchQuery}
            onChange={handleSearchChange}
            onFocus={() => {
              setFocused(true);
              if (searchQuery.trim() && searchResults.length > 0) {
                setShowDropdown(true);
              }
            }}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setShowDropdown(false);
                (e.target as HTMLInputElement).blur();
              }
            }}
            style={{
              ...styles.searchInput,
              ...(focused ? styles.searchInputFocused : {}),
            }}
          />

          {/* Search results dropdown */}
          {showDropdown && (
            <div style={styles.dropdown}>
              {searching ? (
                <div style={styles.noResults}>Searching...</div>
              ) : searchResults.length === 0 ? (
                <div style={styles.noResults}>No cards found</div>
              ) : (
                searchResults.map((r) => (
                  <div
                    key={r.id}
                    style={styles.dropdownItem}
                    onMouseDown={() => handleResultClick(r)}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#F4F5F7';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <div style={styles.dropdownTitle}>{r.title}</div>
                    <div style={styles.dropdownMeta}>
                      <span>{r.boardTitle}</span>
                      <span>&rsaquo;</span>
                      <span>{r.listTitle}</span>
                      {r.isArchived && (
                        <span style={styles.archivedBadge}>Archived</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right: user info + logout */}
      <div style={styles.right}>
        <div style={styles.avatar}>
          {user?.avatarUrl ? (
            <img src={user.avatarUrl} alt={user.displayName} style={styles.avatarImg} />
          ) : (
            initials
          )}
        </div>
        <span style={styles.userName}>{user?.displayName ?? 'User'}</span>
        <button
          type="button"
          style={styles.logoutButton}
          onClick={handleLogout}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.3)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.15)';
          }}
        >
          Log out
        </button>
      </div>
    </header>
  );
}
