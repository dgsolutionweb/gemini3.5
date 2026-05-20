import { useState, useEffect, useRef, useCallback } from "react";
import { 
  ArrowLeftRight, 
  Volume2, 
  Copy, 
  Check, 
  Settings, 
  CornerDownLeft, 
  AlertCircle,
  Menu,
  Crop
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { Sidebar, HistoryItem } from "./components/Sidebar";
import { SettingsModal } from "./components/SettingsModal";
import { CorrectionPanel } from "./components/CorrectionPanel";
import { translateText, Correction } from "./services/translationService";

function App() {
  // --- Persisted States via localStorage ---
  const [apiMode, setApiMode] = useState<'gemini' | 'openai' | 'openrouter' | 'free'>(() => {
    return (localStorage.getItem('tr_api_mode') as 'gemini' | 'openai' | 'openrouter' | 'free') || 'free';
  });
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem('tr_gemini_key') || '');
  const [geminiModel, setGeminiModel] = useState(() => localStorage.getItem('tr_gemini_model') || 'gemini-1.5-flash');
  const [openaiKey, setOpenaiKey] = useState(() => localStorage.getItem('tr_openai_key') || '');
  const [openaiModel, setOpenaiModel] = useState(() => localStorage.getItem('tr_openai_model') || 'gpt-4o-mini');
  const [openrouterKey, setOpenrouterKey] = useState(() => localStorage.getItem('tr_openrouter_key') || '');
  const [openrouterModel, setOpenrouterModel] = useState(() => localStorage.getItem('tr_openrouter_model') || 'google/gemini-flash-1.5');
  const [startupRun, setStartupRun] = useState<boolean>(false);

  const [autoTranslate, setAutoTranslate] = useState<boolean>(() => {
    const val = localStorage.getItem('tr_auto_translate');
    return val !== null ? val === 'true' : true;
  });
  const [ttsVoice, setTtsVoice] = useState(() => {
    return localStorage.getItem('tr_tts_voice') || '';
  });
  const [ttsSpeed, setTtsSpeed] = useState<number>(() => {
    const val = localStorage.getItem('tr_tts_speed');
    return val !== null ? parseFloat(val) : 1.0;
  });
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    const raw = localStorage.getItem('tr_history');
    return raw ? JSON.parse(raw) : [];
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('tr_sidebar_collapsed') === 'true';
  });
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>(() => {
    return (localStorage.getItem('tr_theme') as 'light' | 'dark' | 'system') || 'system';
  });
  const [globalShortcut, setGlobalShortcut] = useState<string>(() => {
    return localStorage.getItem('tr_global_shortcut') || 'CommandOrControl+Shift+T';
  });

  const getActiveKeyAndModel = useCallback((mode: typeof apiMode) => {
    if (mode === 'gemini') return { key: geminiKey, model: geminiModel };
    if (mode === 'openai') return { key: openaiKey, model: openaiModel };
    if (mode === 'openrouter') return { key: openrouterKey, model: openrouterModel };
    return { key: '', model: '' };
  }, [geminiKey, geminiModel, openaiKey, openaiModel, openrouterKey, openrouterModel]);

  const activeInfo = getActiveKeyAndModel(apiMode);

  // Load autostart setting from OS on mount
  useEffect(() => {
    invoke('plugin:autostart|is_enabled')
      .then((enabled) => {
        setStartupRun(!!enabled);
      })
      .catch((err) => {
        console.error("Erro ao verificar autostart:", err);
      });
  }, []);

  // --- UI States ---
  const [sourceText, setSourceText] = useState("");
  const [translatedText, setTranslatedText] = useState("");
  const [corrections, setCorrections] = useState<Correction[]>([]);
  
  const [sourceLang, setSourceLang] = useState<'pt' | 'en'>("pt");
  const [targetLang, setTargetLang] = useState<'pt' | 'en'>("en");
  
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Feedback states for copy button
  const [copiedSource, setCopiedSource] = useState(false);
  const [copiedTarget, setCopiedTarget] = useState(false);

  // Debounce and abort controller references
  const debounceTimerRef = useRef<any | null>(null);
  const historyTimerRef = useRef<any | null>(null);

  // Apply visual theme to the document element
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('light-theme', 'dark-theme');
    
    if (theme === 'system') {
      // Handled by CSS prefers-color-scheme media queries, but clean classing is nice
    } else {
      root.classList.add(`${theme}-theme`);
    }
    localStorage.setItem('tr_theme', theme);

    // Call Rust to update native theme so vibrancy matches!
    invoke("set_app_theme", { theme }).catch(err => {
      console.error("Failed to set native theme:", err);
    });
  }, [theme]);

  // Manage global hotkey registration
  useEffect(() => {
    const registerShortcut = async () => {
      try {
        await invoke("register_global_shortcut", { shortcutStr: globalShortcut });
        console.log(`Global shortcut registered successfully: ${globalShortcut}`);
      } catch (err) {
        console.error(`Failed to register shortcut ${globalShortcut}:`, err);
      }
    };

    registerShortcut();

    return () => {
      invoke("unregister_global_shortcut", { shortcutStr: globalShortcut }).catch(err => {
        console.error(`Failed to unregister shortcut ${globalShortcut} during cleanup:`, err);
      });
    };
  }, [globalShortcut]);

  // Persist sidebar collapsed status
  useEffect(() => {
    localStorage.setItem('tr_sidebar_collapsed', String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  // Persist history changes
  useEffect(() => {
    localStorage.setItem('tr_history', JSON.stringify(history));
  }, [history]);

  // --- Translation Core Logic ---
  const performTranslation = useCallback(async (textToTranslate: string, sLang: 'pt' | 'en', tLang: 'pt' | 'en') => {
    const query = textToTranslate.trim();
    if (!query) {
      setTranslatedText("");
      setCorrections([]);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    const { key, model } = getActiveKeyAndModel(apiMode);

    try {
      const result = await translateText(query, sLang, tLang, apiMode, key, model);
      setTranslatedText(result.translatedText);
      setCorrections(result.corrections);

      // Setup a timer to commit this translation to history after typing pauses
      if (historyTimerRef.current) clearTimeout(historyTimerRef.current);
      historyTimerRef.current = setTimeout(() => {
        commitToHistory(query, result.translatedText, sLang, tLang);
      }, 2500);

    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Ocorreu um erro ao realizar a tradução.");
    } finally {
      setIsLoading(false);
    }
  }, [apiMode, getActiveKeyAndModel]);

  // Handle input change and triggers
  useEffect(() => {
    if (!autoTranslate) return;

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    if (!sourceText.trim()) {
      setTranslatedText("");
      setCorrections([]);
      setError(null);
      return;
    }

    debounceTimerRef.current = setTimeout(() => {
      performTranslation(sourceText, sourceLang, targetLang);
    }, 600);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [sourceText, sourceLang, targetLang, autoTranslate, performTranslation]);

  // Commit history entry with duplicate control and incremental grouping
  const commitToHistory = (source: string, translated: string, sLang: 'pt' | 'en', tLang: 'pt' | 'en') => {
    if (!source.trim() || !translated.trim()) return;

    setHistory(prev => {
      const now = Date.now();
      const lastItem = prev[0];

      // If the last item is very recent (under 15s) and matches the language pair, replace/extend it
      if (lastItem && (now - lastItem.timestamp < 15000) && lastItem.sourceLang === sLang && lastItem.targetLang === tLang) {
        const updated = [...prev];
        updated[0] = {
          id: lastItem.id,
          sourceText: source,
          translatedText: translated,
          sourceLang: sLang,
          targetLang: tLang,
          timestamp: now
        };
        return updated;
      }

      // Check if it's an exact duplicate of the last entry
      if (lastItem && lastItem.sourceText === source && lastItem.translatedText === translated && lastItem.sourceLang === sLang) {
        return prev;
      }

      // Prepend new history entry
      const newItem: HistoryItem = {
        id: Math.random().toString(36).substring(2, 9),
        sourceText: source,
        translatedText: translated,
        sourceLang: sLang,
        targetLang: tLang,
        timestamp: now
      };
      
      return [newItem, ...prev].slice(0, 100);
    });
  };

  // --- Handlers ---
  const handleManualTranslate = () => {
    performTranslation(sourceText, sourceLang, targetLang);
  };

  const handleScreenCaptureOCR = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const recognizedText = await invoke<string>("capture_and_ocr");
      if (recognizedText) {
        setSourceText(recognizedText);
        
        // Auto-detect language of the OCR text (basic heuristic)
        const isEnglish = /[a-zA-Z]/g.test(recognizedText) && 
          (/\b(the|and|of|to|a|is|in|that|it|you|was|for|on|are|as|with|his|they|i|at|be|this|have|from|or|one|had|by|word|but|not|what|all|were|we|when|your|can|said|there|use|an|each|which|she|do|how|their|if|will|up|other|about|out|many|then|them|these|so|some|her|would|make|like|him|into|time|has|look|two|more|write|go|see|number|no|way|could|people|my|than|first|water|been|call|who|oil|its|now|find|long|down|day|did|get|come|made|may|part)\b/i.test(recognizedText));

        const newSourceLang = isEnglish ? "en" : "pt";
        const newTargetLang = isEnglish ? "pt" : "en";
        
        setSourceLang(newSourceLang);
        setTargetLang(newTargetLang);
        setCorrections([]);
        
        // Trigger translation manually if autoTranslate is off
        if (!autoTranslate) {
          setIsLoading(true);
          try {
            const { key, model } = getActiveKeyAndModel(apiMode);
            const result = await translateText(recognizedText, newSourceLang, newTargetLang, apiMode, key, model);
            setTranslatedText(result.translatedText);
            setCorrections(result.corrections);
            // Save to history
            commitToHistory(recognizedText, result.translatedText, newSourceLang, newTargetLang);
          } catch (err: any) {
            setError(err?.message || "Erro na tradução do texto capturado");
          } finally {
            setIsLoading(false);
          }
        }
      }
    } catch (err: any) {
      // Don't show cancel as error
      if (err !== "Captura cancelada ou falhou") {
        setError(err?.toString() || "Erro ao capturar a tela");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // CMD + Enter or CTRL + Enter triggers manual translation
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleManualTranslate();
    }
  };

  const handleInvertLanguages = () => {
    const tempSource = sourceText;
    const tempTarget = translatedText;

    // Swap text and language pairs
    setSourceText(tempTarget);
    setTranslatedText(tempSource);
    setSourceLang(targetLang);
    setTargetLang(sourceLang);
    setCorrections([]);
    setError(null);

    // If auto translate is enabled, trigger translate immediately for the new text
    if (autoTranslate && tempTarget.trim()) {
      performTranslation(tempTarget, targetLang, sourceLang);
    }
  };

  const handleClearSource = () => {
    setSourceText("");
    setTranslatedText("");
    setCorrections([]);
    setError(null);
    setActiveItemId(null);
  };

  const handleSelectHistoryItem = (item: HistoryItem) => {
    setSourceText(item.sourceText);
    setTranslatedText(item.translatedText);
    setSourceLang(item.sourceLang);
    setTargetLang(item.targetLang);
    setCorrections([]); // Clear corrections since history items represent compiled state
    setActiveItemId(item.id);
  };

  const handleDeleteHistoryItem = (id: string) => {
    setHistory(prev => prev.filter(item => item.id !== id));
    if (activeItemId === id) {
      setActiveItemId(null);
    }
  };

  const handleClearHistory = () => {
    if (confirm("Deseja apagar todo o seu histórico de tradução?")) {
      setHistory([]);
      setActiveItemId(null);
    }
  };

  const handleSaveSettings = async (newSettings: {
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
  }) => {
    setApiMode(newSettings.apiMode);
    setGeminiKey(newSettings.geminiKey);
    setGeminiModel(newSettings.geminiModel);
    setOpenaiKey(newSettings.openaiKey);
    setOpenaiModel(newSettings.openaiModel);
    setOpenrouterKey(newSettings.openrouterKey);
    setOpenrouterModel(newSettings.openrouterModel);
    setAutoTranslate(newSettings.autoTranslate);
    setTtsVoice(newSettings.ttsVoice);
    setTtsSpeed(newSettings.ttsSpeed);
    setGlobalShortcut(newSettings.globalShortcut);

    localStorage.setItem('tr_api_mode', newSettings.apiMode);
    localStorage.setItem('tr_gemini_key', newSettings.geminiKey);
    localStorage.setItem('tr_gemini_model', newSettings.geminiModel);
    localStorage.setItem('tr_openai_key', newSettings.openaiKey);
    localStorage.setItem('tr_openai_model', newSettings.openaiModel);
    localStorage.setItem('tr_openrouter_key', newSettings.openrouterKey);
    localStorage.setItem('tr_openrouter_model', newSettings.openrouterModel);
    localStorage.setItem('tr_auto_translate', String(newSettings.autoTranslate));
    localStorage.setItem('tr_tts_voice', newSettings.ttsVoice);
    localStorage.setItem('tr_tts_speed', String(newSettings.ttsSpeed));
    localStorage.setItem('tr_global_shortcut', newSettings.globalShortcut);

    // Sync autostart plugin with OS
    if (newSettings.startupRun !== startupRun) {
      try {
        const isEnabled = await invoke<boolean>('plugin:autostart|is_enabled');
        if (newSettings.startupRun && !isEnabled) {
          await invoke('plugin:autostart|enable');
        } else if (!newSettings.startupRun && isEnabled) {
          await invoke('plugin:autostart|disable');
        }
        setStartupRun(newSettings.startupRun);
      } catch (err) {
        console.error("Falha ao configurar autostart:", err);
      }
    }

    // Force clear corrections and trigger translation with new settings if content exists
    if (sourceText.trim()) {
      setCorrections([]);
      const activeKey = newSettings.apiMode === 'gemini' ? newSettings.geminiKey
        : newSettings.apiMode === 'openai' ? newSettings.openaiKey
        : newSettings.apiMode === 'openrouter' ? newSettings.openrouterKey
        : '';
      const activeModel = newSettings.apiMode === 'gemini' ? newSettings.geminiModel
        : newSettings.apiMode === 'openai' ? newSettings.openaiModel
        : newSettings.apiMode === 'openrouter' ? newSettings.openrouterModel
        : '';

      translateText(sourceText.trim(), sourceLang, targetLang, newSettings.apiMode, activeKey, activeModel)
        .then(result => {
          setTranslatedText(result.translatedText);
          setCorrections(result.corrections);
        })
        .catch(err => {
          setError(err?.message || "Erro com o novo motor de tradução");
        });
    }
  };

  // Clipboard copies
  const copyToClipboard = async (text: string, isSource: boolean) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      if (isSource) {
        setCopiedSource(true);
        setTimeout(() => setCopiedSource(false), 2000);
      } else {
        setCopiedTarget(true);
        setTimeout(() => setCopiedTarget(false), 2000);
      }
    } catch (err) {
      console.error("Copy failed", err);
    }
  };

  // Web Speech synthesis
  const speakText = (text: string, lang: 'pt' | 'en') => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    
    window.speechSynthesis.cancel();
    
    if (!text) return;
    
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    let selectedVoice = null;
    
    if (ttsVoice) {
      selectedVoice = voices.find(v => v.name === ttsVoice);
    }
    
    if (!selectedVoice) {
      const langCode = lang === 'pt' ? 'pt-BR' : 'en-US';
      selectedVoice = voices.find(v => v.lang.includes(langCode)) || 
                      voices.find(v => v.lang.startsWith(lang.toLowerCase()));
    }
    
    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }
    
    utterance.rate = ttsSpeed;
    window.speechSynthesis.speak(utterance);
  };

  return (
    <div className="app-container">
      {/* Sidebar Component */}
      <Sidebar
        history={history}
        activeItemId={activeItemId}
        onSelectItem={handleSelectHistoryItem}
        onDeleteItem={handleDeleteHistoryItem}
        onClearHistory={handleClearHistory}
        onOpenSettings={() => setSettingsOpen(true)}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        apiMode={apiMode}
        apiKey={activeInfo.key}
      />

      {/* Main Translation View */}
      <main className="main-view">
        {/* custom macOS style header */}
        <header className={`main-header ${sidebarCollapsed ? 'sidebar-collapsed-padding' : ''}`}>
          <div className="header-title-bar-drag" data-tauri-drag-region></div>
          <div className="header-controls">
            <div className="header-left">
              {sidebarCollapsed && (
                <button 
                  className="footer-btn" 
                  onClick={() => setSidebarCollapsed(false)}
                  title="Mostrar Barra Lateral"
                >
                  <Menu size={16} />
                </button>
              )}
            </div>

            <div className="header-center">
              <span className="language-label">
                {sourceLang === 'pt' ? 'Português' : 'Inglês'}
              </span>
              <button 
                className="lang-swap-btn" 
                onClick={handleInvertLanguages}
                title="Inverter Idiomas"
              >
                <ArrowLeftRight size={13} />
              </button>
              <span className="language-label">
                {targetLang === 'pt' ? 'Português' : 'Inglês'}
              </span>
            </div>

            <div className="header-right">
              {/* Theme toggler at header */}
              <button 
                className="footer-btn"
                onClick={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
                title="Alternar Modo Escuro / Claro"
              >
                {theme === 'dark' ? '☀️' : '🌙'}
              </button>
              <button 
                className="footer-btn" 
                onClick={() => setSettingsOpen(true)}
                title="Configurações"
              >
                <Settings size={16} />
              </button>
            </div>
          </div>
        </header>

        {/* Translation work area */}
        <div className="content-body">
          <div className="panes-container">
            {/* Source Text Pane (Left) */}
            <div className="pane pane-left">
              <div className="pane-header">
                <span className="pane-title">Texto Original</span>
                {sourceText && (
                  <button 
                    className="footer-btn" 
                    onClick={handleClearSource}
                    style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '4px' }}
                  >
                    Limpar
                  </button>
                )}
              </div>
              <div className="pane-textarea-wrapper">
                <textarea
                  className="pane-textarea"
                  placeholder={sourceLang === 'pt' ? 'Digite o texto em português...' : 'Write text in English...'}
                  value={sourceText}
                  onChange={(e) => setSourceText(e.target.value)}
                  onKeyDown={handleKeyDown}
                />
                <span className="character-count">{sourceText.length} caracteres</span>
              </div>
              <div className="pane-footer">
                <div className="action-group">
                  <button 
                    className="action-btn"
                    onClick={() => speakText(sourceText, sourceLang)}
                    disabled={!sourceText.trim()}
                    title="Ouvir texto original"
                  >
                    <Volume2 size={14} />
                  </button>
                  <button 
                    className="action-btn"
                    onClick={() => copyToClipboard(sourceText, true)}
                    disabled={!sourceText.trim()}
                    title="Copiar texto original"
                  >
                    {copiedSource ? <Check size={14} style={{ color: 'var(--success-color)' }} /> : <Copy size={14} />}
                  </button>
                  <button 
                    className="action-btn"
                    onClick={handleScreenCaptureOCR}
                    title="Capturar e ler texto da tela (Recortar)"
                  >
                    <Crop size={14} />
                    <span>Recortar Tela</span>
                  </button>
                </div>

                {!autoTranslate && (
                  <button 
                    className="action-btn translate-trigger-btn"
                    onClick={handleManualTranslate}
                    disabled={isLoading || !sourceText.trim()}
                  >
                    {isLoading ? (
                      <div className="spinner" />
                    ) : (
                      <>
                        <span>Traduzir</span>
                        <CornerDownLeft size={12} />
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Translated Target Pane (Right) */}
            <div className="pane">
              <div className="pane-header">
                <span className="pane-title">Tradução</span>
                {isLoading && autoTranslate && <div className="spinner" style={{ borderColor: 'rgba(0,0,0,0.1)', borderTopColor: 'var(--accent-color)' }} />}
              </div>
              <div className="pane-textarea-wrapper">
                {error ? (
                  <div style={{ color: 'var(--error-color)', display: 'flex', gap: '8px', fontSize: '13px', padding: '8px', borderRadius: '6px', backgroundColor: 'rgba(255, 59, 48, 0.08)' }}>
                    <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                    <div>{error}</div>
                  </div>
                ) : (
                  <div 
                    className="pane-target-display" 
                    data-placeholder="A tradução aparecerá aqui..."
                  >
                    {translatedText}
                  </div>
                )}
              </div>
              <div className="pane-footer">
                <div className="action-group">
                  <button 
                    className="action-btn"
                    onClick={() => speakText(translatedText, targetLang)}
                    disabled={!translatedText}
                    title="Ouvir tradução"
                  >
                    <Volume2 size={14} />
                  </button>
                  <button 
                    className="action-btn"
                    onClick={() => copyToClipboard(translatedText, false)}
                    disabled={!translatedText}
                    title="Copiar tradução"
                  >
                    {copiedTarget ? <Check size={14} style={{ color: 'var(--success-color)' }} /> : <Copy size={14} />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Grammar & Corrections Panel */}
          <CorrectionPanel
            corrections={corrections}
            apiMode={apiMode}
            apiKey={activeInfo.key}
          />
        </div>
      </main>

      {/* Preferences Dialog */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        apiMode={apiMode}
        geminiKey={geminiKey}
        geminiModel={geminiModel}
        openaiKey={openaiKey}
        openaiModel={openaiModel}
        openrouterKey={openrouterKey}
        openrouterModel={openrouterModel}
        autoTranslate={autoTranslate}
        ttsVoice={ttsVoice}
        ttsSpeed={ttsSpeed}
        globalShortcut={globalShortcut}
        startupRun={startupRun}
        onSave={handleSaveSettings}
      />
    </div>
  );
}

export default App;
