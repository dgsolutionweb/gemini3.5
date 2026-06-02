import React, { useState } from 'react';
import { Search, Trash2, Settings, History, ChevronLeft } from 'lucide-react';

export interface HistoryItem {
  id: string;
  sourceText: string;
  translatedText: string;
  sourceLang: string;
  targetLang: string;
  timestamp: number;
}

interface SidebarProps {
  history: HistoryItem[];
  activeItemId: string | null;
  onSelectItem: (item: HistoryItem) => void;
  onDeleteItem: (id: string) => void;
  onClearHistory: () => void;
  onOpenSettings: () => void;
  onWindowDrag: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  apiMode: 'gemini' | 'openai' | 'openrouter' | 'free';
  apiKey: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  history,
  activeItemId,
  onSelectItem,
  onDeleteItem,
  onClearHistory,
  onOpenSettings,
  onWindowDrag,
  collapsed,
  onToggleCollapse,
  apiMode,
  apiKey
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const safeHistory = Array.isArray(history) ? history : [];
  const filteredHistory = safeHistory.filter(item => {
    const source = item?.sourceText || '';
    const translated = item?.translatedText || '';
    return source.toLowerCase().includes(searchQuery.toLowerCase()) ||
      translated.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const isApiConfigured = apiMode === 'free' || (['gemini', 'openai', 'openrouter'].includes(apiMode) && apiKey.trim() !== '');

  const getApiLabel = () => {
    switch (apiMode) {
      case 'gemini': return 'Gemini AI';
      case 'openai': return 'OpenAI';
      case 'openrouter': return 'OpenRouter';
      default: return 'Grátis (Básico)';
    }
  };

  const getDotColor = () => {
    if (apiMode === 'free') return 'green';
    return apiKey ? 'green' : 'orange';
  };

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        <div className="drag-handle" onMouseDown={onWindowDrag}></div>
        <button 
          className="footer-btn" 
          onClick={onToggleCollapse} 
          title="Ocultar Barra Lateral"
          style={{ marginRight: '4px' }}
        >
          <ChevronLeft size={16} />
        </button>
      </div>

      <div className="sidebar-search-box">
        <div className="search-input-wrapper">
          <Search size={14} className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder="Buscar histórico..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="history-list">
        <div className="history-section-title">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <History size={12} />
            <span>Histórico</span>
          </div>
        </div>

        {filteredHistory.length === 0 ? (
          <div style={{ padding: '20px 8px', textAlign: 'center', fontSize: '12px', color: 'var(--text-tertiary)' }}>
            Nenhum histórico encontrado
          </div>
        ) : (
          filteredHistory.map((item) => (
            <div
              key={item.id}
              className={`history-item ${activeItemId === item.id ? 'active' : ''}`}
              onClick={() => onSelectItem(item)}
            >
              <div className="history-item-texts">
                {item.sourceText}
              </div>
              <div className="history-item-translated">
                {item.translatedText}
              </div>
              <div className="history-item-meta">
                <span className="history-item-time">
                  {formatTime(item.timestamp)} • {item.sourceLang.toUpperCase()} → {item.targetLang.toUpperCase()}
                </span>
                <button
                  className="history-delete-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteItem(item.id);
                  }}
                  title="Apagar"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="sidebar-footer">
        <div className="api-indicator" title={isApiConfigured ? "Serviço de Tradução Ativo" : "Requer Configuração"}>
          <div className={`api-dot ${getDotColor()}`}></div>
          <span style={{ fontSize: '11px', textTransform: 'capitalize' }}>
            {getApiLabel()}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '4px' }}>
          {history.length > 0 && (
            <button
              className="footer-btn"
              onClick={onClearHistory}
              title="Limpar Histórico"
            >
              <Trash2 size={14} />
            </button>
          )}
          <button
            className="footer-btn"
            onClick={onOpenSettings}
            title="Configurações"
          >
            <Settings size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
};
