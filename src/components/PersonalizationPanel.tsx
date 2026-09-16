import { useEffect } from 'react';
import { Check, RotateCcw, X } from 'lucide-react';

export type ColorMode = 'light' | 'dark' | 'system';
export type Density = 'compact' | 'comfortable' | 'spacious';
export type ThemePreset = 'ibm' | 'vault' | 'boundary' | 'neutral' | 'contrast';

export interface PersonalizationSettings {
  preset: ThemePreset;
  colorMode: ColorMode;
  accent: string;
  sidebarTint: string;
  density: Density;
  fontSize: number;
  sidebarWidth: number;
  rightPanelWidth: number;
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  reducedMotion: boolean;
}

export const THEME_PRESETS: Record<ThemePreset, { label: string; description: string; accent: string; sidebarTint: string; colorMode?: ColorMode }> = {
  ibm:      { label: 'IBM Blue', description: 'Focused and familiar', accent: '#0f62fe', sidebarTint: '#0f62fe' },
  vault:    { label: 'Vault', description: 'Warm gold workspace', accent: '#b28600', sidebarTint: '#ffd814' },
  boundary: { label: 'Boundary', description: 'Bold support workspace', accent: '#e5484d', sidebarTint: '#f24c53' },
  neutral:  { label: 'Neutral', description: 'Quiet graphite tones', accent: '#687078', sidebarTint: '#687078' },
  contrast: { label: 'High contrast', description: 'Maximum separation', accent: '#78a9ff', sidebarTint: '#ffffff', colorMode: 'dark' },
};

interface Props {
  open: boolean;
  workspaceName: string;
  settings: PersonalizationSettings;
  onChange: (settings: PersonalizationSettings) => void;
  onClose: () => void;
  onReset: () => void;
}

export function PersonalizationPanel({ open, workspaceName, settings, onChange, onClose, onReset }: Props) {
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [open, onClose]);

  if (!open) return null;
  const update = <K extends keyof PersonalizationSettings>(key: K, value: PersonalizationSettings[K]) => onChange({ ...settings, [key]: value });

  return (
    <>
      <button className="personalization-scrim" onClick={onClose} aria-label="Close appearance settings" />
      <aside className="personalization-panel" aria-label="Appearance and layout settings">
        <header className="personalization-header">
          <div><strong>Customize Bob</strong><span>Only for {workspaceName}</span></div>
          <button className="icon-button" onClick={onClose} aria-label="Close appearance settings"><X size={17} /></button>
        </header>

        <div className="personalization-scroll">
          <section className="preference-section">
            <div className="preference-title"><strong>Workspace theme</strong><span>Choose a starting point</span></div>
            <div className="theme-preset-grid">
              {(Object.entries(THEME_PRESETS) as [ThemePreset, typeof THEME_PRESETS[ThemePreset]][]).map(([id, preset]) => (
                <button key={id} className={`theme-preset ${settings.preset === id ? 'selected' : ''}`} onClick={() => onChange({ ...settings, preset: id, accent: preset.accent, sidebarTint: preset.sidebarTint, colorMode: preset.colorMode ?? settings.colorMode })}>
                  <span className="theme-preset-preview" style={{ background: `linear-gradient(135deg, ${preset.sidebarTint} 0 36%, ${preset.accent} 36% 48%, var(--surface2) 48%)` }} />
                  <span><strong>{preset.label}</strong><small>{preset.description}</small></span>
                  {settings.preset === id && <Check size={14} />}
                </button>
              ))}
            </div>
          </section>

          <section className="preference-section">
            <div className="preference-title"><strong>Color mode</strong><span>Match your environment</span></div>
            <div className="segmented-control">
              {(['light', 'dark', 'system'] as ColorMode[]).map(value => <button key={value} className={settings.colorMode === value ? 'selected' : ''} onClick={() => update('colorMode', value)}>{value === 'system' ? 'System' : value[0].toUpperCase() + value.slice(1)}</button>)}
            </div>
            <div className="color-controls">
              <label><span>Accent</span><input type="color" value={settings.accent} onChange={event => onChange({ ...settings, preset: 'neutral', accent: event.target.value })} /></label>
              <label><span>Sidebar tint</span><input type="color" value={settings.sidebarTint} onChange={event => onChange({ ...settings, preset: 'neutral', sidebarTint: event.target.value })} /></label>
            </div>
          </section>

          <section className="preference-section">
            <div className="preference-title"><strong>Display density</strong><span>Control how much fits on screen</span></div>
            <div className="segmented-control">
              {(['compact', 'comfortable', 'spacious'] as Density[]).map(value => <button key={value} className={settings.density === value ? 'selected' : ''} onClick={() => update('density', value)}>{value[0].toUpperCase() + value.slice(1)}</button>)}
            </div>
            <label className="range-setting"><span><strong>Text size</strong><output>{settings.fontSize}px</output></span><input type="range" min="12" max="17" step="1" value={settings.fontSize} onChange={event => update('fontSize', Number(event.target.value))} /></label>
          </section>

          <section className="preference-section">
            <div className="preference-title"><strong>Layout</strong><span>Tune your working space</span></div>
            <label className="range-setting"><span><strong>Sidebar width</strong><output>{settings.sidebarWidth}px</output></span><input type="range" min="220" max="360" step="10" value={settings.sidebarWidth} onChange={event => update('sidebarWidth', Number(event.target.value))} /></label>
            <label className="range-setting"><span><strong>Viewer width</strong><output>{settings.rightPanelWidth}px</output></span><input type="range" min="300" max="700" step="20" value={settings.rightPanelWidth} onChange={event => update('rightPanelWidth', Number(event.target.value))} /></label>
            <Toggle label="Show sidebar" checked={settings.leftPanelOpen} onChange={value => update('leftPanelOpen', value)} />
            <Toggle label="Show code viewer" checked={settings.rightPanelOpen} onChange={value => update('rightPanelOpen', value)} />
            <Toggle label="Reduce motion" checked={settings.reducedMotion} onChange={value => update('reducedMotion', value)} />
          </section>
        </div>

        <footer className="personalization-footer">
          <button onClick={onReset}><RotateCcw size={14} /> Reset workspace</button>
          <button className="primary-action" onClick={onClose}>Done</button>
        </footer>
      </aside>
    </>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="toggle-setting"><span>{label}</span><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} /><i aria-hidden="true" /></label>;
}
