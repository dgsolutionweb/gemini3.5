import React, { useState, useEffect } from 'react';
import { X, Key, HelpCircle } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiMode: 'gemini' | 'openai' | 'openrouter' | 'free';
  geminiKey: string;
  geminiModel: string;
  openaiKey: string;
  openaiModel: string;
  openrouterKey: string;
  openrouterModel: string;
  autoTranslate: boolean;
  ttsVoice: string;
  ttsSpeed: number;
  globalShortcut: string;
  startupRun: boolean;
  windowOpacity: number;
  onRepairScreenPermission: () => void;
  onSave: (settings: {
    apiMode: 'gemini' | 'openai' | 'openrouter' | 'free';
    geminiKey: string;
    geminiModel: string;
    openaiKey: string;
    openaiModel: string;
    openrouterKey: string;
    openrouterModel: string;
    autoTranslate: boolean;
    ttsVoice: string;
    ttsSpeed: number;
    globalShortcut: string;
    startupRun: boolean;
    windowOpacity: number;
  }) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  apiMode: initialApiMode,
  geminiKey: initialGeminiKey,
  geminiModel: initialGeminiModel,
  openaiKey: initialOpenaiKey,
  openaiModel: initialOpenaiModel,
  openrouterKey: initialOpenrouterKey,
  openrouterModel: initialOpenrouterModel,
  autoTranslate: initialAutoTranslate,
  ttsVoice: initialTtsVoice,
  ttsSpeed: initialTtsSpeed,
  globalShortcut: initialGlobalShortcut,
  startupRun: initialStartupRun,
  windowOpacity: initialWindowOpacity,
  onRepairScreenPermission,
  onSave
}) => {
  const [apiMode, setApiMode] = useState<'gemini' | 'openai' | 'openrouter' | 'free'>(initialApiMode);
  const [geminiKey, setGeminiKey] = useState('');
  const [geminiModel, setGeminiModel] = useState(initialGeminiModel);
  const [openaiKey, setOpenaiKey] = useState('');
  const [openaiModel, setOpenaiModel] = useState(initialOpenaiModel);
  const [openrouterKey, setOpenrouterKey] = useState('');
  const [openrouterModel, setOpenrouterModel] = useState(initialOpenrouterModel);
  const [autoTranslate, setAutoTranslate] = useState(initialAutoTranslate);
  const [ttsVoice, setTtsVoice] = useState(initialTtsVoice);
  const [ttsSpeed, setTtsSpeed] = useState(initialTtsSpeed);
  const [globalShortcut, setGlobalShortcut] = useState(initialGlobalShortcut);
  const [startupRun, setStartupRun] = useState(initialStartupRun);
  const [windowOpacity, setWindowOpacity] = useState(initialWindowOpacity);
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
      geminiKey,
      geminiModel,
      openaiKey,
      openaiModel,
      openrouterKey,
      openrouterModel,
      autoTranslate,
      ttsVoice,
      ttsSpeed,
      globalShortcut,
      startupRun,
      windowOpacity
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
                onChange={(e) => setApiMode(e.target.value as 'gemini' | 'openai' | 'openrouter' | 'free')}
              >
                <option value="gemini">Gemini AI (Recomendado - Completo)</option>
                <option value="openai">OpenAI (ChatGPT)</option>
                <option value="openrouter">OpenRouter (Claude, LLaMA, etc.)</option>
                <option value="free">MyMemory (Básico - Sem correções)</option>
              </select>
            </div>

            {apiMode === 'gemini' && (
              <div className="form-group" style={{ marginTop: '8px' }}>
                <label htmlFor="gemini-key-input" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Key size={14} /> Chave API Gemini
                </label>
                <input
                  id="gemini-key-input"
                  type="password"
                  className="form-control"
                  placeholder={initialGeminiKey ? "Chave salva no cofre do sistema. Preencha para substituir." : "Cole sua chave API do Gemini aqui..."}
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                />
                <label htmlFor="gemini-model-select" style={{ display: 'block', marginTop: '8px' }}>Modelo</label>
                <select
                  id="gemini-model-select"
                  className="form-control"
                  value={geminiModel}
                  onChange={(e) => setGeminiModel(e.target.value)}
                >
                  <option value="gemini-1.5-flash">Gemini 1.5 Flash (Rápido)</option>
                  <option value="gemini-1.5-pro">Gemini 1.5 Pro (Mais Inteligente)</option>
                </select>
                <div className="settings-help-box" style={{ marginTop: '8px' }}>
                  <HelpCircle size={14} style={{ inlineSize: '14px', float: 'left', marginRight: '6px' }} />
                  <span>
                    Obtenha sua chave de API do Gemini gratuitamente em{' '}
                    <a href="https://aistudio.google.com/" target="_blank" rel="noreferrer">
                      Google AI Studio
                    </a>.
                  </span>
                </div>
              </div>
            )}

            {apiMode === 'openai' && (
              <div className="form-group" style={{ marginTop: '8px' }}>
                <label htmlFor="openai-key-input" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Key size={14} /> Chave API OpenAI
                </label>
                <input
                  id="openai-key-input"
                  type="password"
                  className="form-control"
                  placeholder={initialOpenaiKey ? "Chave salva no cofre do sistema. Preencha para substituir." : "Cole sua chave API da OpenAI aqui..."}
                  value={openaiKey}
                  onChange={(e) => setOpenaiKey(e.target.value)}
                />
                <label htmlFor="openai-model-select" style={{ display: 'block', marginTop: '8px' }}>Modelo</label>
                <select
                  id="openai-model-select"
                  className="form-control"
                  value={openaiModel}
                  onChange={(e) => setOpenaiModel(e.target.value)}
                >
                  <option value="gpt-4o-mini">gpt-4o-mini (Rápido e Barato)</option>
                  <option value="gpt-4o">gpt-4o (Completo)</option>
                </select>
              </div>
            )}

            {apiMode === 'openrouter' && (
              <div className="form-group" style={{ marginTop: '8px' }}>
                <label htmlFor="openrouter-key-input" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Key size={14} /> Chave API OpenRouter
                </label>
                <input
                  id="openrouter-key-input"
                  type="password"
                  className="form-control"
                  placeholder={initialOpenrouterKey ? "Chave salva no cofre do sistema. Preencha para substituir." : "Cole sua chave API do OpenRouter aqui..."}
                  value={openrouterKey}
                  onChange={(e) => setOpenrouterKey(e.target.value)}
                />
                <label htmlFor="openrouter-model-input" style={{ display: 'block', marginTop: '8px' }}>Modelo (ID do OpenRouter)</label>
                <input
                  id="openrouter-model-input"
                  type="text"
                  className="form-control"
                  placeholder="Ex: google/gemini-flash-1.5 ou anthropic/claude-3.5-sonnet"
                  value={openrouterModel}
                  onChange={(e) => setOpenrouterModel(e.target.value)}
                />
                <div className="settings-help-box" style={{ marginTop: '8px' }}>
                  <HelpCircle size={14} style={{ inlineSize: '14px', float: 'left', marginRight: '6px' }} />
                  <span>
                    Obtenha sua chave e confira a lista de modelos suportados em{' '}
                    <a href="https://openrouter.ai/" target="_blank" rel="noreferrer">
                      OpenRouter.ai
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

            <div className="form-group" style={{ marginTop: '8px' }}>
              <label className="form-checkbox-group">
                <input
                  type="checkbox"
                  checked={startupRun}
                  onChange={(e) => setStartupRun(e.target.checked)}
                />
                <span>Iniciar o aplicativo automaticamente com o sistema</span>
              </label>
            </div>

            <div className="form-group" style={{ marginTop: '12px' }}>
              <label htmlFor="opacity-range" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Transparência da Janela</span>
                <span>{Math.round(windowOpacity * 100)}%</span>
              </label>
              <input
                id="opacity-range"
                type="range"
                min="0.45"
                max="1"
                step="0.05"
                className="form-control"
                style={{ padding: 0, height: 'auto' }}
                value={windowOpacity}
                onChange={(e) => setWindowOpacity(parseFloat(e.target.value))}
              />
            </div>
          </div>

          {/* macOS Screen Recording Section */}
          <div className="settings-section">
            <h4 className="settings-label">Permissão de Captura</h4>
            <div className="settings-help-box">
              <span>
                Se o macOS continuar pedindo Gravação de Tela mesmo com o LingoSnap ativado, repare a permissão e reinicie o app depois de conceder acesso novamente.
              </span>
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ marginTop: '8px', width: '100%' }}
              onClick={onRepairScreenPermission}
            >
              Reparar permissão de gravação de tela
            </button>
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
