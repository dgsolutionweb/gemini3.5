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
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Sidebar, HistoryItem } from "./components/Sidebar";
import { SettingsModal } from "./components/SettingsModal";
import { CorrectionPanel } from "./components/CorrectionPanel";
import { RegistryPanel } from "./components/RegistryPanel";
import { CaptureCenter, CaptureRecord } from "./components/CaptureCenter";
import { translateText, Correction } from "./services/translationService";
import { lookupBrazilianIdentifiers, LookupResult } from "./services/brDataService";

const languageNames: Record<string, string> = {
  auto: "Auto-Detectar",
  pt: "Português",
  en: "Inglês",
  es: "Espanhol",
  fr: "Francês",
  de: "Alemão",
  it: "Italiano"
};

const isTauriRuntime = () => (
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
);

function App() {
  // --- Persisted States via localStorage ---
  const [apiMode, setApiMode] = useState<'gemini' | 'openai' | 'openrouter' | 'free'>(() => {
    return (localStorage.getItem('tr_api_mode') as 'gemini' | 'openai' | 'openrouter' | 'free') || 'free';
  });
  const [geminiKey, setGeminiKey] = useState('');
  const [geminiModel, setGeminiModel] = useState(() => localStorage.getItem('tr_gemini_model') || 'gemini-1.5-flash');
  const [openaiKey, setOpenaiKey] = useState('');
  const [openaiModel, setOpenaiModel] = useState(() => localStorage.getItem('tr_openai_model') || 'gpt-4o-mini');
  const [openrouterKey, setOpenrouterKey] = useState('');
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
  const [windowOpacity, setWindowOpacity] = useState<number>(() => {
    const val = localStorage.getItem('tr_window_opacity');
    return val !== null ? Math.min(1, Math.max(0.45, parseFloat(val))) : 0.82;
  });

  const getActiveKeyAndModel = useCallback((mode: typeof apiMode) => {
    if (mode === 'gemini') return { key: geminiKey, model: geminiModel };
    if (mode === 'openai') return { key: openaiKey, model: openaiModel };
    if (mode === 'openrouter') return { key: openrouterKey, model: openrouterModel };
    return { key: '', model: '' };
  }, [geminiKey, geminiModel, openaiKey, openaiModel, openrouterKey, openrouterModel]);

  const activeInfo = getActiveKeyAndModel(apiMode);

  useEffect(() => {
    const loadSecureKeys = async () => {
      const providers = [
        { name: 'gemini', setter: setGeminiKey, legacyKey: 'tr_gemini_key' },
        { name: 'openai', setter: setOpenaiKey, legacyKey: 'tr_openai_key' },
        { name: 'openrouter', setter: setOpenrouterKey, legacyKey: 'tr_openrouter_key' },
      ];

      for (const provider of providers) {
        const legacyValue = localStorage.getItem(provider.legacyKey) || '';
        if (!isTauriRuntime()) {
          provider.setter(legacyValue);
          continue;
        }

        try {
          const saved = await invoke<string | null>('get_api_secret', { provider: provider.name });
          if (saved) {
            provider.setter(saved);
            localStorage.removeItem(provider.legacyKey);
          } else if (legacyValue) {
            await invoke('save_api_secret', { provider: provider.name, secret: legacyValue });
            provider.setter(legacyValue);
            localStorage.removeItem(provider.legacyKey);
          }
        } catch (err) {
          console.error(`Falha ao carregar credencial ${provider.name}:`, err);
          provider.setter(legacyValue);
        }
      }
    };

    loadSecureKeys();
  }, []);

  // Load autostart setting from OS on mount
  useEffect(() => {
    if (!isTauriRuntime()) return;

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

  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [activeCaptureId, setActiveCaptureId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRegistryLoading, setIsRegistryLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registryResults, setRegistryResults] = useState<LookupResult[]>([]);
  const [captures, setCaptures] = useState<CaptureRecord[]>(() => {
    const raw = localStorage.getItem('tr_captures');
    try {
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

interface CodeInfo {
  data: string;
  format: string;
}

interface CapturedData {
  text: string;
  qr_codes: CodeInfo[];
  barcodes: CodeInfo[];
  image_data_url?: string;
}

const [detectedCodes, setDetectedCodes] = useState<CodeInfo[] | null>(null);
  
  // Feedback states for copy button
  const [copiedSource, setCopiedSource] = useState(false);
  const [copiedTarget, setCopiedTarget] = useState(false);

  // Debounce and abort controller references
  const debounceTimerRef = useRef<any | null>(null);
  const historyTimerRef = useRef<any | null>(null);
  const skipNextAutoTranslateRef = useRef(false);

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

    if (isTauriRuntime()) {
      invoke("set_app_theme", { theme }).catch(err => {
        console.error("Failed to set native theme:", err);
      });
    }
  }, [theme]);

  useEffect(() => {
    document.documentElement.style.setProperty('--window-opacity', String(windowOpacity));
    localStorage.setItem('tr_window_opacity', String(windowOpacity));
  }, [windowOpacity]);

  // Manage global hotkey registration
  useEffect(() => {
    if (!isTauriRuntime()) return;

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

  useEffect(() => {
    localStorage.setItem('tr_captures', JSON.stringify(captures.slice(0, 40)));
  }, [captures]);

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

    if (skipNextAutoTranslateRef.current) {
      skipNextAutoTranslateRef.current = false;
      return;
    }

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
    if (!isTauriRuntime()) {
      setError("A captura de tela esta disponivel apenas no aplicativo desktop.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setDetectedCodes(null);
    setRegistryResults([]);
    try {
      const result = await invoke<CapturedData>("capture_and_ocr");
      const allCodes = [...result.qr_codes, ...result.barcodes];
      if (allCodes.length > 0) {
        setDetectedCodes(allCodes);
      }
      const textToProcess = result.text || "";
      const lookupText = [textToProcess, ...allCodes.map((code) => code.data)].filter(Boolean).join("\n");
      let lookupResults: LookupResult[] = [];

      if (lookupText) {
        setIsRegistryLoading(true);
        try {
          lookupResults = await lookupBrazilianIdentifiers(lookupText);
          setRegistryResults(lookupResults);
        } catch (err) {
          console.error("Erro ao consultar CNPJ/CEP:", err);
        } finally {
          setIsRegistryLoading(false);
        }
      }

      if (textToProcess) {
        skipNextAutoTranslateRef.current = true;
        setSourceText(textToProcess);
        try {
          const { key, model } = getActiveKeyAndModel(apiMode);
          const transResult = await translateText(textToProcess, sourceLang, targetLang, apiMode, key, model);
          setTranslatedText(transResult.translatedText);
          setCorrections(transResult.corrections);

          const finalSourceLang = sourceLang === 'auto' ? (transResult.detectedLanguage || 'en') : sourceLang;
          let finalTargetLang = targetLang;
          if (sourceLang === 'auto') {
            if (finalSourceLang === 'en') finalTargetLang = 'pt';
            else if (finalSourceLang === 'pt') finalTargetLang = 'en';
          }

          commitToHistory(textToProcess, transResult.translatedText, finalSourceLang, finalTargetLang);

          const capture: CaptureRecord = {
            id: `cap-${Date.now()}`,
            timestamp: Date.now(),
            sourceText: textToProcess,
            translatedText: transResult.translatedText,
            sourceLang: finalSourceLang,
            targetLang: finalTargetLang,
            imageDataUrl: result.image_data_url,
            registryResults: lookupResults,
            codes: allCodes,
          };

          setActiveCaptureId(capture.id);
          setCaptures(prev => [capture, ...prev].slice(0, 40));
        } catch (err: any) {
          setError(err?.message || "Erro na tradução do texto capturado");
        }
      }
    } catch (err: any) {
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

    // If auto translate is enabled, trigger translate immediately for the new text
    if (autoTranslate && tempTarget.trim()) {
      performTranslation(tempTarget, newSourceLang, newTargetLang);
    }
  };

  const handleClearSource = () => {
    setSourceText("");
    setTranslatedText("");
    setCorrections([]);
    setRegistryResults([]);
    setError(null);
    setActiveItemId(null);
    setActiveCaptureId(null);
  };

  const handleSelectHistoryItem = (item: HistoryItem) => {
    skipNextAutoTranslateRef.current = true;
    setSourceText(item.sourceText);
    setTranslatedText(item.translatedText);
    setSourceLang(item.sourceLang);
    setTargetLang(item.targetLang);
    setCorrections([]); // Clear corrections since history items represent compiled state
    setRegistryResults([]);
    setActiveItemId(item.id);
    setActiveCaptureId(null);
  };

  const handleSelectCapture = (capture: CaptureRecord) => {
    skipNextAutoTranslateRef.current = true;
    setSourceText(capture.sourceText);
    setTranslatedText(capture.translatedText);
    setSourceLang(capture.sourceLang);
    setTargetLang(capture.targetLang);
    setCorrections([]);
    setRegistryResults(capture.registryResults);
    setDetectedCodes(capture.codes.length > 0 ? capture.codes : null);
    setActiveCaptureId(capture.id);
    setActiveItemId(null);
  };

  const handleDeleteCapture = (id: string) => {
    setCaptures(prev => prev.filter(capture => capture.id !== id));
    if (activeCaptureId === id) {
      setActiveCaptureId(null);
    }
  };

  const handleClearCaptures = () => {
    if (confirm("Deseja apagar todas as capturas salvas?")) {
      setCaptures([]);
      setActiveCaptureId(null);
    }
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
    windowOpacity: number;
  }) => {
    const finalGeminiKey = newSettings.geminiKey.trim() || geminiKey;
    const finalOpenaiKey = newSettings.openaiKey.trim() || openaiKey;
    const finalOpenrouterKey = newSettings.openrouterKey.trim() || openrouterKey;

    setApiMode(newSettings.apiMode);
    setGeminiKey(finalGeminiKey);
    setGeminiModel(newSettings.geminiModel);
    setOpenaiKey(finalOpenaiKey);
    setOpenaiModel(newSettings.openaiModel);
    setOpenrouterKey(finalOpenrouterKey);
    setOpenrouterModel(newSettings.openrouterModel);
    setAutoTranslate(newSettings.autoTranslate);
    setTtsVoice(newSettings.ttsVoice);
    setTtsSpeed(newSettings.ttsSpeed);
    setGlobalShortcut(newSettings.globalShortcut);
    setWindowOpacity(newSettings.windowOpacity);

    localStorage.setItem('tr_api_mode', newSettings.apiMode);
    localStorage.setItem('tr_gemini_model', newSettings.geminiModel);
    localStorage.setItem('tr_openai_model', newSettings.openaiModel);
    localStorage.setItem('tr_openrouter_model', newSettings.openrouterModel);
    localStorage.setItem('tr_auto_translate', String(newSettings.autoTranslate));
    localStorage.setItem('tr_tts_voice', newSettings.ttsVoice);
    localStorage.setItem('tr_tts_speed', String(newSettings.ttsSpeed));
    localStorage.setItem('tr_global_shortcut', newSettings.globalShortcut);
    localStorage.setItem('tr_window_opacity', String(newSettings.windowOpacity));
    localStorage.removeItem('tr_gemini_key');
    localStorage.removeItem('tr_openai_key');
    localStorage.removeItem('tr_openrouter_key');

    if (isTauriRuntime()) {
      const secretWrites = [
        newSettings.geminiKey.trim() ? invoke('save_api_secret', { provider: 'gemini', secret: newSettings.geminiKey }) : null,
        newSettings.openaiKey.trim() ? invoke('save_api_secret', { provider: 'openai', secret: newSettings.openaiKey }) : null,
        newSettings.openrouterKey.trim() ? invoke('save_api_secret', { provider: 'openrouter', secret: newSettings.openrouterKey }) : null,
      ].filter(Boolean);

      Promise.all(secretWrites).catch(err => {
        setError(err?.toString() || "Nao foi possivel salvar as chaves no cofre do sistema.");
      });
    }

    // Sync autostart plugin with OS
    if (isTauriRuntime() && newSettings.startupRun !== startupRun) {
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
      const activeKey = newSettings.apiMode === 'gemini' ? finalGeminiKey
        : newSettings.apiMode === 'openai' ? finalOpenaiKey
        : newSettings.apiMode === 'openrouter' ? finalOpenrouterKey
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

  const handleWindowDrag = () => {
    if (!isTauriRuntime()) return;
    getCurrentWindow().startDragging().catch(err => {
      console.error("Failed to start window drag:", err);
    });
  };

  const handleRepairScreenPermission = () => {
    if (!isTauriRuntime()) return;
    invoke("reset_screen_recording_permission").catch(err => {
      setError(err?.toString() || "Nao foi possivel reparar a permissao de gravacao de tela.");
    });
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
        onWindowDrag={handleWindowDrag}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        apiMode={apiMode}
        apiKey={activeInfo.key}
      />

      {/* Main Translation View */}
      <main className="main-view">
        {/* custom macOS style header */}
        <header className={`main-header ${sidebarCollapsed ? 'sidebar-collapsed-padding' : ''}`}>
          <div className="header-title-bar-drag" onMouseDown={handleWindowDrag}></div>
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
                {detectedCodes && detectedCodes.length > 0 && (
                  <div style={{ padding: '8px', borderTop: '1px solid var(--border-color)', fontSize: '12px' }}>
                    <div style={{ fontWeight: 600, marginBottom: '4px', color: 'var(--accent-color)' }}>
                      Códigos detectados:
                    </div>
                    {detectedCodes.map((code, i) => (
                      <div key={i} style={{ display: 'flex', gap: '6px', alignItems: 'baseline', marginBottom: '2px' }}>
                        <span style={{ background: 'var(--accent-color)', color: '#fff', borderRadius: '3px', padding: '1px 5px', fontSize: '10px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                          {code.format.replace('_', ' ')}
                        </span>
                        <span style={{ wordBreak: 'break-all', color: 'var(--text-secondary)' }}>{code.data}</span>
                      </div>
                    ))}
                  </div>
                )}
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

          <RegistryPanel
            results={registryResults}
            isLoading={isRegistryLoading}
          />

          <CaptureCenter
            captures={captures}
            activeCaptureId={activeCaptureId}
            onSelect={handleSelectCapture}
            onDelete={handleDeleteCapture}
            onClear={handleClearCaptures}
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
        windowOpacity={windowOpacity}
        onRepairScreenPermission={handleRepairScreenPermission}
        onSave={handleSaveSettings}
      />
    </div>
  );
}

export default App;
