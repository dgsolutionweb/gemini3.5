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
  Crop,
  BookOpen
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { Sidebar, HistoryItem } from "./components/Sidebar";
import { SettingsModal } from "./components/SettingsModal";
import { CorrectionPanel } from "./components/CorrectionPanel";
import { translateText, Correction } from "./services/translationService";
import { generateLesson, LessonResult } from "./services/lessonService";

const languageNames: Record<string, string> = {
  auto: "Auto-Detectar",
  pt: "Português",
  en: "Inglês",
  es: "Espanhol",
  fr: "Francês",
  de: "Alemão",
  it: "Italiano"
};

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
  
  const [sourceLang, setSourceLang] = useState<string>("auto");
  const [targetLang, setTargetLang] = useState<string>("pt");

  // --- Study Tab & Lesson States ---
  const [activeTab, setActiveTab] = useState<'translation' | 'lesson'>('translation');
  const [lesson, setLesson] = useState<LessonResult | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [isGeneratingLesson, setIsGeneratingLesson] = useState(false);
  
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
  const performTranslation = useCallback(async (textToTranslate: string, sLang: string, tLang: string) => {
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

      const finalSourceLang = sLang === 'auto' ? (result.detectedLanguage || 'en') : sLang;
      let finalTargetLang = tLang;
      if (sLang === 'auto') {
        if (finalSourceLang === 'en') finalTargetLang = 'pt';
        else if (finalSourceLang === 'pt') finalTargetLang = 'en';
      }

      // Setup a timer to commit this translation to history after typing pauses
      if (historyTimerRef.current) clearTimeout(historyTimerRef.current);
      historyTimerRef.current = setTimeout(() => {
        commitToHistory(query, result.translatedText, finalSourceLang, finalTargetLang);
      }, 2500);

      // Clear lessons when text updates
      setLesson(null);
      setSelectedAnswer(null);

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
  const commitToHistory = (source: string, translated: string, sLang: string, tLang: string) => {
    if (!source.trim() || !translated.trim()) return;

    setHistory(prev => {
      const now = Date.now();
      const prevHistory = Array.isArray(prev) ? prev : [];
      const lastItem = prevHistory[0];

      // If the last item is very recent (under 15s) and matches the language pair, replace/extend it
      if (lastItem && (now - lastItem.timestamp < 15000) && lastItem.sourceLang === sLang && lastItem.targetLang === tLang) {
        const updated = [...prevHistory];
        updated[0] = {
          ...lastItem,
          sourceText: source,
          translatedText: translated,
          timestamp: now
        };
        return updated;
      }

      // If text is duplicate, don't re-add
      if (lastItem && lastItem.sourceText === source && lastItem.translatedText === translated && lastItem.sourceLang === sLang) {
        return prevHistory;
      }

      const newItem: HistoryItem = {
        id: Math.random().toString(36).substring(2, 9),
        sourceText: source,
        translatedText: translated,
        sourceLang: sLang,
        targetLang: tLang,
        timestamp: now
      };
      return [newItem, ...prevHistory].slice(0, 100);
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
        setLesson(null);
        setSelectedAnswer(null);
        
        // Trigger translation manually if autoTranslate is off
        if (!autoTranslate) {
          setIsLoading(true);
          try {
            const { key, model } = getActiveKeyAndModel(apiMode);
            const result = await translateText(recognizedText, sourceLang, targetLang, apiMode, key, model);
            setTranslatedText(result.translatedText);
            setCorrections(result.corrections);

            const finalSourceLang = sourceLang === 'auto' ? (result.detectedLanguage || 'en') : sourceLang;
            let finalTargetLang = targetLang;
            if (sourceLang === 'auto') {
              if (finalSourceLang === 'en') finalTargetLang = 'pt';
              else if (finalSourceLang === 'pt') finalTargetLang = 'en';
            }

            // Save to history
            commitToHistory(recognizedText, result.translatedText, finalSourceLang, finalTargetLang);
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
    
    let newSourceLang = targetLang;
    let newTargetLang = sourceLang === 'auto' ? 'pt' : sourceLang;
    
    setSourceLang(newSourceLang);
    setTargetLang(newTargetLang);
    setCorrections([]);
    setError(null);
    setLesson(null);
    setSelectedAnswer(null);

    // If auto translate is enabled, trigger translate immediately for the new text
    if (autoTranslate && tempTarget.trim()) {
      performTranslation(tempTarget, newSourceLang, newTargetLang);
    }
  };

  const handleGenerateLesson = async () => {
    if (!sourceText.trim() || !translatedText.trim()) return;
    setIsGeneratingLesson(true);
    setSelectedAnswer(null);
    try {
      const { key, model } = getActiveKeyAndModel(apiMode);
      let actualSource = sourceLang;
      if (sourceLang === 'auto') {
        const englishWords = /\b(the|and|of|to|is|in|that|it|he|was|for|on|are|as|with|his|they|i|at|be|this|have|from|or|one|had|by|word|but|not|what|all|were|we|when|your|can|said|there|use|an|each|which|she|do|how|their|if)\b/i;
        actualSource = englishWords.test(sourceText) ? 'en' : 'pt';
      }
      const lessonResult = await generateLesson(
        sourceText,
        translatedText,
        actualSource,
        targetLang,
        apiMode,
        key,
        model
      );
      setLesson(lessonResult);
    } catch (err: any) {
      console.error("Erro ao gerar lição:", err);
    } finally {
      setIsGeneratingLesson(false);
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
  const speakText = (text: string, lang: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    
    window.speechSynthesis.cancel();
    
    if (!text) return;
    
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    let selectedVoice = null;
    
    if (ttsVoice) {
      selectedVoice = voices.find(v => v.name === ttsVoice);
    }
    
    let actualLang = lang;
    if (lang === 'auto') {
      const englishWords = /\b(the|and|of|to|is|in|that|it|he|was|for|on|are|as|with|his|they|i|at|be|this|have|from|or|one|had|by|word|but|not|what|all|were|we|when|your|can|said|there|use|an|each|which|she|do|how|their|if)\b/i;
      actualLang = englishWords.test(text) ? 'en' : 'pt';
    }
    
    if (!selectedVoice) {
      const langCodeMap: Record<string, string> = {
        pt: 'pt-BR',
        en: 'en-US',
        es: 'es-ES',
        fr: 'fr-FR',
        de: 'de-DE',
        it: 'it-IT'
      };
      const langCode = langCodeMap[actualLang] || 'en-US';
      selectedVoice = voices.find(v => v.lang.includes(langCode)) || 
                      voices.find(v => v.lang.startsWith(actualLang.toLowerCase()));
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
              <select 
                className="lang-select" 
                value={sourceLang}
                onChange={(e) => {
                  const val = e.target.value;
                  setSourceLang(val);
                  if (sourceText.trim()) {
                    performTranslation(sourceText, val, targetLang);
                  }
                }}
              >
                <option value="auto">Auto-Detectar</option>
                <option value="pt">Português</option>
                <option value="en">Inglês</option>
                <option value="es">Espanhol</option>
                <option value="fr">Francês</option>
                <option value="de">Alemão</option>
                <option value="it">Italiano</option>
              </select>
              
              <button 
                className="lang-swap-btn" 
                onClick={handleInvertLanguages}
                title="Inverter Idiomas"
              >
                <ArrowLeftRight size={13} />
              </button>

              <select 
                className="lang-select" 
                value={targetLang}
                onChange={(e) => {
                  const val = e.target.value;
                  setTargetLang(val);
                  if (sourceText.trim()) {
                    performTranslation(sourceText, sourceLang, val);
                  }
                }}
              >
                <option value="pt">Português</option>
                <option value="en">Inglês</option>
                <option value="es">Espanhol</option>
                <option value="fr">Francês</option>
                <option value="de">Alemão</option>
                <option value="it">Italiano</option>
              </select>
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
                  placeholder={
                    sourceLang === 'auto' ? 'Recorte a tela ou digite seu texto aqui...' :
                    sourceLang === 'pt' ? 'Digite o texto em português...' :
                    sourceLang === 'en' ? 'Write text in English...' :
                    `Escreva no idioma selecionado (${languageNames[sourceLang] || sourceLang})...`
                  }
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
              <div className="pane-header" style={{ justifyContent: 'space-between' }}>
                <span className="pane-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  Resultado
                  {isLoading && autoTranslate && <div className="spinner" style={{ borderColor: 'rgba(0,0,0,0.1)', borderTopColor: 'var(--accent-color)', width: '12px', height: '12px', borderWidth: '2px' }} />}
                </span>
                <div className="pane-tabs">
                  <button 
                    className={`pane-tab ${activeTab === 'translation' ? 'active' : ''}`}
                    onClick={() => setActiveTab('translation')}
                  >
                    Tradução
                  </button>
                  <button 
                    className={`pane-tab ${activeTab === 'lesson' ? 'active' : ''}`}
                    onClick={() => {
                      setActiveTab('lesson');
                      if (!lesson && sourceText.trim() && translatedText.trim()) {
                        handleGenerateLesson();
                      }
                    }}
                    disabled={!sourceText.trim() || !translatedText.trim()}
                  >
                    Mini-Aula IA
                  </button>
                </div>
              </div>
              <div className="pane-textarea-wrapper">
                {activeTab === 'translation' ? (
                  error ? (
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
                  )
                ) : (
                  <div className="lesson-container">
                    {isGeneratingLesson ? (
                      <div className="lesson-empty-state">
                        <div className="spinner" style={{ width: '24px', height: '24px', borderWidth: '3px', marginBottom: '8px' }} />
                        <span>Gerando lição de fixação personalizada...</span>
                      </div>
                    ) : lesson ? (
                      <>
                        <div className="lesson-header" style={{ marginBottom: '12px' }}>
                          <h3 className="lesson-title">{lesson.lessonTitle}</h3>
                        </div>

                        {/* Grammar Section */}
                        {lesson.grammarPoints && lesson.grammarPoints.length > 0 && (
                          <div style={{ marginBottom: '16px' }}>
                            <div className="lesson-section-title">
                              Gramática e Dicas
                            </div>
                            {lesson.grammarPoints.map((gp, i) => (
                              <div key={i} className="lesson-card" style={{ marginBottom: '8px' }}>
                                <div className="grammar-point-title">{gp.point}</div>
                                <div className="grammar-point-desc">{gp.explanation}</div>
                                <div className="lesson-example">
                                  <strong>Exemplo:</strong> "{gp.exampleOriginal}"
                                  <div style={{ color: 'var(--text-secondary)', marginTop: '2px' }}>{gp.exampleTranslated}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Vocabulary Section */}
                        {lesson.vocabulary && lesson.vocabulary.length > 0 && (
                          <div style={{ marginBottom: '16px' }}>
                            <div className="lesson-section-title">
                              Vocabulário
                            </div>
                            <div className="vocab-list">
                              {lesson.vocabulary.map((vocab, i) => (
                                <div key={i} className="lesson-card" style={{ marginBottom: '4px' }}>
                                  <div className="vocab-word">{vocab.word}</div>
                                  <div className="vocab-meaning">{vocab.meaning}</div>
                                  <div className="vocab-usage">"{vocab.usage}"</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Quiz Section */}
                        {lesson.quiz && lesson.quiz.question && (
                          <div className="quiz-section">
                            <div className="lesson-section-title">
                              Quiz de Fixação
                            </div>
                            <div className="quiz-question">{lesson.quiz.question}</div>
                            <div className="quiz-options">
                              {lesson.quiz.options.map((option, idx) => {
                                const isCorrect = idx === lesson.quiz.correctIndex;
                                const isSelected = idx === selectedAnswer;
                                
                                let optionClass = "";
                                if (selectedAnswer !== null) {
                                  if (isCorrect) optionClass = "correct";
                                  else if (isSelected) optionClass = "incorrect";
                                }
                                
                                return (
                                  <button
                                    key={idx}
                                    className={`quiz-option ${optionClass} ${selectedAnswer !== null ? 'disabled' : ''}`}
                                    onClick={() => selectedAnswer === null && setSelectedAnswer(idx)}
                                    disabled={selectedAnswer !== null}
                                    style={{ width: '100%' }}
                                  >
                                    {option}
                                  </button>
                                );
                              })}
                            </div>

                            {selectedAnswer !== null && (
                              <div className={`quiz-feedback ${selectedAnswer === lesson.quiz.correctIndex ? 'success' : 'fail'}`}>
                                <strong style={{ display: 'block', marginBottom: '4px' }}>
                                  {selectedAnswer === lesson.quiz.correctIndex ? "Correto! 🎉" : "Incorreto ❌"}
                                </strong>
                                <span>{lesson.quiz.explanation}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="lesson-empty-state">
                        <span>Nenhuma lição disponível. Recorte um texto e clique em Gerar Aula.</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="pane-footer">
                {activeTab === 'translation' ? (
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
                ) : (
                  <div className="action-group" style={{ width: '100%', justifyContent: 'center' }}>
                    <button 
                      className="lesson-generate-btn"
                      onClick={handleGenerateLesson}
                      disabled={isGeneratingLesson || !sourceText.trim() || !translatedText.trim()}
                    >
                      <BookOpen size={13} />
                      <span>{lesson ? "Recriar Lição por IA" : "Gerar Lição por IA"}</span>
                    </button>
                  </div>
                )}
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
