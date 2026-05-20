import React, { useState, useEffect } from 'react';
import { X, Key, HelpCircle } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiMode: 'gemini' | 'free';
  apiKey: string;
  autoTranslate: boolean;
  ttsVoice: string;
  ttsSpeed: number;
  globalShortcut: string;
  onSave: (settings: {
    apiMode: 'gemini' | 'free';
    apiKey: string;
    autoTranslate: boolean;
    ttsVoice: string;
    ttsSpeed: number;
    globalShortcut: string;
  }) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  apiMode: initialApiMode,
  apiKey: initialApiKey,
  autoTranslate: initialAutoTranslate,
  ttsVoice: initialTtsVoice,
  ttsSpeed: initialTtsSpeed,
  globalShortcut: initialGlobalShortcut,
  onSave
}) => {
  const [apiMode, setApiMode] = useState<'gemini' | 'free'>(initialApiMode);
  const [apiKey, setApiKey] = useState(initialApiKey);
  const [autoTranslate, setAutoTranslate] = useState(initialAutoTranslate);
  const [ttsVoice, setTtsVoice] = useState(initialTtsVoice);
  const [ttsSpeed, setTtsSpeed] = useState(initialTtsSpeed);
  const [globalShortcut, setGlobalShortcut] = useState(initialGlobalShortcut);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    const loadVoices = () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        setVoices(window.speechSynthesis.getVoices());
      }
    };
    loadVoices();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

  if (!isOpen) return null;

  const handleSave = () => {
    onSave({
      apiMode,
      apiKey,
      autoTranslate,
      ttsVoice,
      ttsSpeed,
      globalShortcut
    });
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Preferências</h3>
          <button className="modal-close-btn" onClick={onClose} title="Fechar">
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          {/* Translation Engine Section */}
          <div className="settings-section">
            <h4 className="settings-label">Motor de Tradução</h4>
            <div className="form-group">
              <label htmlFor="api-mode-select">Modo</label>
              <select
                id="api-mode-select"
                className="form-control"
                value={apiMode}
                onChange={(e) => setApiMode(e.target.value as 'gemini' | 'free')}
              >
                <option value="gemini">Gemini AI (Recomendado - Completo)</option>
                <option value="free">MyMemory (Básico - Sem correções)</option>
              </select>
            </div>

            {apiMode === 'gemini' && (
              <div className="form-group" style={{ marginTop: '8px' }}>
                <label htmlFor="api-key-input" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Key size={14} /> Chave API Gemini
                </label>
                <input
                  id="api-key-input"
                  type="password"
                  className="form-control"
                  placeholder="Cole sua chave API do Gemini aqui..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                />
                <div className="settings-help-box" style={{ marginTop: '8px' }}>
                  <HelpCircle size={14} style={{ inlineSize: '14px', float: 'left', marginRight: '6px' }} />
                  <span>
                    A tradução inteligente com correções ortográficas e gramaticais detalhadas utiliza a inteligência artificial do Gemini. 
                    Obtenha sua chave de API gratuitamente em{' '}
                    <a href="https://aistudio.google.com/" target="_blank" rel="noreferrer">
                      Google AI Studio
                    </a>.
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Preferences Section */}
          <div className="settings-section">
            <h4 className="settings-label">Opções Gerais</h4>
            <div className="form-group">
              <label className="form-checkbox-group">
                <input
                  type="checkbox"
                  checked={autoTranslate}
                  onChange={(e) => setAutoTranslate(e.target.checked)}
                />
                <span>Traduzir automaticamente ao digitar (Debounce 500ms)</span>
              </label>
            </div>
          </div>

          {/* Global Shortcut Section */}
          <div className="settings-section">
            <h4 className="settings-label">Atalho Global</h4>
            <div className="form-group">
              <label htmlFor="shortcut-input">Atalho de Teclado</label>
              <input
                id="shortcut-input"
                type="text"
                className="form-control"
                placeholder="Ex: CommandOrControl+Shift+T"
                value={globalShortcut}
                onChange={(e) => setGlobalShortcut(e.target.value)}
              />
              <div className="settings-help-box" style={{ marginTop: '6px' }}>
                <span>
                  Atalho para ocultar/mostrar a janela de qualquer lugar. Use <code>CommandOrControl</code> (⌘ no Mac) e junte modificadores usando <code>+</code>. Ex: <code>CommandOrControl+Shift+T</code> ou <code>Control+Shift+T</code>.
                </span>
              </div>
            </div>
          </div>

          {/* Voice/Text to Speech Section */}
          <div className="settings-section">
            <h4 className="settings-label">Leitura de Texto (Voz)</h4>
            <div className="form-group">
              <label htmlFor="voice-select">Voz Padrão</label>
              <select
                id="voice-select"
                className="form-control"
                value={ttsVoice}
                onChange={(e) => setTtsVoice(e.target.value)}
              >
                <option value="">(Voz do Sistema Padrão)</option>
                {voices.map((voice) => (
                  <option key={voice.name} value={voice.name}>
                    {voice.name} ({voice.lang})
                  </option>
                ))}
              </select>
            </div>
            
            <div className="form-group">
              <label htmlFor="speed-range" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Velocidade de Leitura</span>
                <span>{ttsSpeed}x</span>
              </label>
              <input
                id="speed-range"
                type="range"
                min="0.5"
                max="2"
                step="0.1"
                className="form-control"
                style={{ padding: 0, height: 'auto' }}
                value={ttsSpeed}
                onChange={(e) => setTtsSpeed(parseFloat(e.target.value))}
              />
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleSave}>Salvar</button>
        </div>
      </div>
    </div>
  );
};
