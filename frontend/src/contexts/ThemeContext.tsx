import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { apiService } from '@/services/api';
import { isEditorTheme, isEditorBg, isConsoleBg } from '@/lib/editorThemes';

type Theme = 'light' | 'dark' | 'system';

export type Palette =
  | 'mono'
  | 'grey'
  | 'anthropic'
  | 'ocean'
  | 'forest'
  | 'terracotta'
  | 'sage'
  | 'rose'
  | 'sand'
  | 'midnight';

export const PALETTES: { id: Palette; label: string; blurb: string }[] = [
  { id: 'mono', label: 'White / Black', blurb: 'Pure monochrome — white paper, black ink' },
  { id: 'grey', label: 'Grey', blurb: 'Cool neutral greys, slate ink' },
  { id: 'anthropic', label: 'Warm Ivory', blurb: 'Warm ivory & charcoal' },
  { id: 'ocean', label: 'Ocean', blurb: 'Cool blue-teal accents' },
  { id: 'forest', label: 'Forest', blurb: 'Deep green accents' },
  { id: 'terracotta', label: 'Terracotta', blurb: 'Warm clay accents' },
  { id: 'sage', label: 'Sage', blurb: 'Muted green-grey accents' },
  { id: 'rose', label: 'Rose', blurb: 'Muted berry accents' },
  { id: 'sand', label: 'Sand', blurb: 'Warm tan accents' },
  { id: 'midnight', label: 'Midnight', blurb: 'Deep navy accents' },
];

export type Backdrop = 'none' | 'beach' | 'forest' | 'sunset' | 'mountains';

export const BACKDROPS: { id: Backdrop; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'beach', label: 'Beach' },
  { id: 'forest', label: 'Forest' },
  { id: 'sunset', label: 'Sunset' },
  { id: 'mountains', label: 'Mountains' },
];

const DEFAULT_PALETTE: Palette = 'mono';
const DEFAULT_BACKDROP: Backdrop = 'none';

const isPalette = (v: unknown): v is Palette => PALETTES.some((p) => p.id === v);
const isBackdrop = (v: unknown): v is Backdrop => BACKDROPS.some((b) => b.id === v);
const isTheme = (v: unknown): v is Theme => v === 'light' || v === 'dark' || v === 'system';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: 'light' | 'dark';
  palette: Palette;
  setPalette: (palette: Palette) => void;
  backdrop: Backdrop;
  setBackdrop: (backdrop: Backdrop) => void;
  editorTheme: string;
  setEditorTheme: (theme: string) => void;
  editorBg: string;
  setEditorBg: (bg: string) => void;
  consoleBg: string;
  setConsoleBg: (bg: string) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    // Check localStorage first, fallback to system
    const stored = localStorage.getItem('theme') as Theme;
    return stored || 'system';
  });

  const [palette, setPalette] = useState<Palette>(() => {
    const stored = localStorage.getItem('palette');
    return isPalette(stored) ? stored : DEFAULT_PALETTE;
  });

  const [backdrop, setBackdrop] = useState<Backdrop>(() => {
    const stored = localStorage.getItem('backdrop');
    return isBackdrop(stored) ? stored : DEFAULT_BACKDROP;
  });

  const [editorTheme, setEditorTheme] = useState<string>(() => {
    const stored = localStorage.getItem('editorTheme');
    return isEditorTheme(stored) ? (stored as string) : 'vscode';
  });

  const [editorBg, setEditorBg] = useState<string>(() => {
    const stored = localStorage.getItem('editorBg');
    return isEditorBg(stored) ? (stored as string) : 'theme';
  });

  const [consoleBg, setConsoleBg] = useState<string>(() => {
    const stored = localStorage.getItem('consoleBg');
    return isConsoleBg(stored) ? (stored as string) : 'default';
  });

  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('dark');

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const prefsLoadedRef = useRef(false);

  useEffect(() => {
    const updateResolvedTheme = () => {
      let resolved: 'light' | 'dark';

      if (theme === 'system') {
        resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      } else {
        resolved = theme;
      }

      setResolvedTheme(resolved);

      // Apply theme to document
      const root = document.documentElement;
      root.classList.remove('light', 'dark');
      root.classList.add(resolved);

      // Update meta theme-color for mobile browsers
      const metaThemeColor = document.querySelector('meta[name="theme-color"]');
      if (metaThemeColor) {
        metaThemeColor.setAttribute('content', resolved === 'dark' ? '#1f1e1d' : '#ffffff');
      }
    };

    updateResolvedTheme();

    // Listen for system theme changes when in system mode
    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = () => updateResolvedTheme();

      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-palette', palette);
  }, [palette]);

  useEffect(() => {
    document.documentElement.setAttribute('data-backdrop', backdrop);
  }, [backdrop]);

  useEffect(() => {
    document.documentElement.setAttribute('data-console-bg', consoleBg);
  }, [consoleBg]);

  // Load server-side preferences once per login; they win over localStorage.
  useEffect(() => {
    if (!isAuthenticated) {
      prefsLoadedRef.current = false;
      return;
    }
    if (prefsLoadedRef.current) return;
    prefsLoadedRef.current = true;

    apiService
      .getUserPreferences()
      .then((prefs) => {
        if (isPalette(prefs.palette)) {
          setPalette(prefs.palette);
          localStorage.setItem('palette', prefs.palette);
        }
        if (isTheme(prefs.mode)) {
          setTheme(prefs.mode);
          localStorage.setItem('theme', prefs.mode);
        }
        if (isBackdrop(prefs.backdrop)) {
          setBackdrop(prefs.backdrop);
          localStorage.setItem('backdrop', prefs.backdrop);
        }
        if (isEditorTheme(prefs.editor_theme)) {
          setEditorTheme(prefs.editor_theme as string);
          localStorage.setItem('editorTheme', prefs.editor_theme as string);
        }
        if (isEditorBg(prefs.editor_bg)) {
          setEditorBg(prefs.editor_bg as string);
          localStorage.setItem('editorBg', prefs.editor_bg as string);
        }
        if (isConsoleBg(prefs.console_bg)) {
          setConsoleBg(prefs.console_bg as string);
          localStorage.setItem('consoleBg', prefs.console_bg as string);
        }
      })
      .catch(() => {
        // Offline / older backend: keep local values.
      });
  }, [isAuthenticated]);

  // Persist a preference change: apply instantly, mirror to localStorage,
  // and save to the user's DB profile when signed in (fire-and-forget).
  const persist = (patch: {
    palette?: Palette;
    mode?: Theme;
    backdrop?: Backdrop;
    editor_theme?: string;
    editor_bg?: string;
    console_bg?: string;
  }) => {
    if (useAuthStore.getState().isAuthenticated) {
      apiService.updateUserPreferences(patch).catch(() => {});
    }
  };

  const handleSetTheme = (newTheme: Theme) => {
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    persist({ mode: newTheme });
  };

  const handleSetPalette = (newPalette: Palette) => {
    setPalette(newPalette);
    localStorage.setItem('palette', newPalette);
    persist({ palette: newPalette });
  };

  const handleSetBackdrop = (newBackdrop: Backdrop) => {
    setBackdrop(newBackdrop);
    localStorage.setItem('backdrop', newBackdrop);
    persist({ backdrop: newBackdrop });
  };

  const handleSetEditorTheme = (value: string) => {
    setEditorTheme(value);
    localStorage.setItem('editorTheme', value);
    persist({ editor_theme: value });
  };

  const handleSetEditorBg = (value: string) => {
    setEditorBg(value);
    localStorage.setItem('editorBg', value);
    persist({ editor_bg: value });
  };

  const handleSetConsoleBg = (value: string) => {
    setConsoleBg(value);
    localStorage.setItem('consoleBg', value);
    persist({ console_bg: value });
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme: handleSetTheme,
        resolvedTheme,
        palette,
        setPalette: handleSetPalette,
        backdrop,
        setBackdrop: handleSetBackdrop,
        editorTheme,
        setEditorTheme: handleSetEditorTheme,
        editorBg,
        setEditorBg: handleSetEditorBg,
        consoleBg,
        setConsoleBg: handleSetConsoleBg,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
