# LingoSnap

LingoSnap e um aplicativo desktop para macOS e Windows que captura trechos da tela, executa OCR, traduz o texto, detecta codigos e consulta dados publicos brasileiros como CNPJ e CEP.

Ele foi pensado para uso rapido no dia a dia: recortar uma parte da tela, entender o conteudo, copiar a traducao, consultar dados de empresa/endereco e manter um historico organizado das capturas.

## Principais recursos

- Captura de tela por recorte.
- OCR nativo no macOS e Windows.
- Traducao automatica ou manual.
- Suporte a Gemini, OpenAI, OpenRouter e modo gratuito via MyMemory.
- Correcoes gramaticais e ortograficas quando uma IA esta configurada.
- Deteccao de QR Code e codigo de barras.
- Deteccao e consulta de CNPJ e CEP.
- Central de Capturas com miniatura, texto OCR, traducao, codigos e dados publicos.
- Exportacao de capturas em Markdown e HTML imprimivel.
- Historico pesquisavel de traducoes.
- Leitura em voz alta com vozes do sistema.
- Atalho global para mostrar/ocultar a janela.
- Inicializacao automatica com o sistema.
- Transparencia ajustavel da janela.
- Armazenamento seguro das chaves de API no cofre do sistema.

## Como funciona

1. Clique em **Recortar Tela**.
2. Selecione uma area da tela.
3. O app executa OCR sobre a imagem capturada.
4. O texto e traduzido para o idioma de destino.
5. Se houver CNPJ ou CEP, o app consulta APIs publicas e mostra os dados encontrados.
6. A captura fica salva na **Central de Capturas** para revisao e exportacao.

## Motores de traducao

O app pode trabalhar em quatro modos:

| Modo | Uso |
| --- | --- |
| MyMemory | Traducao basica gratuita, sem correcoes inteligentes detalhadas. |
| Gemini | Traducao e analise com IA do Google. |
| OpenAI | Traducao e analise com modelos OpenAI. |
| OpenRouter | Permite usar modelos de varios provedores via OpenRouter. |

As chaves de API sao salvas no Keychain do macOS ou no gerenciador de credenciais do Windows. Elas nao ficam gravadas no codigo.

## Dados brasileiros

Quando o OCR encontra CNPJ ou CEP, o LingoSnap tenta consultar automaticamente:

- BrasilAPI
- Minha Receita, como fallback para CNPJ
- ViaCEP, como fallback para CEP

Os dados aparecem em um painel dedicado e tambem entram na exportacao da captura.

## Instalacao no macOS

Baixe o arquivo `.dmg` gerado em Releases ou em `src-tauri/target/release/bundle/dmg/`.

1. Abra o `.dmg`.
2. Arraste `LingoSnap.app` para `/Applications`.
3. Abra o app.
4. Ao usar **Recortar Tela**, permita o acesso em:

```text
Ajustes do Sistema > Privacidade e Seguranca > Gravacao do Audio do Sistema e da Tela
```

Depois de ativar a permissao, reinicie o LingoSnap.

### Instalacao limpa no macOS

Se o macOS continuar pedindo permissao mesmo com o app ativado, remova tudo e instale novamente:

```bash
npm run clean:mac
```

Esse comando remove:

- app instalado em `/Applications`
- caches
- WebKit/localStorage
- LaunchAgent
- estado salvo
- permissao antiga de gravacao de tela
- registro antigo do LaunchServices

Depois disso, instale o `.dmg` novamente e conceda a permissao do zero.

## Instalacao no Windows

O Windows e buildado via GitHub Actions em `windows-latest`.

Artefatos esperados:

- `.msi`
- `.exe` NSIS, quando gerado pelo bundle

No Windows, o recorte usa PowerShell internamente, mas o app executa os scripts em modo oculto para evitar abrir uma janela separada. O OCR usa APIs nativas do Windows.

## Configuracao inicial

Abra **Preferencias** no app e configure:

- Motor de traducao.
- Chave da API, se usar Gemini/OpenAI/OpenRouter.
- Modelo.
- Traducao automatica.
- Inicializacao com o sistema.
- Atalho global.
- Transparencia da janela.
- Voz e velocidade de leitura.

Se uma chave ja estiver salva, o campo aparece vazio com a indicacao de que existe uma chave no cofre do sistema. Preencha novamente apenas se quiser substituir.

## Atalhos e uso rapido

- **CommandOrControl + Shift + T**: mostra ou oculta o app.
- **Command/Ctrl + Enter**: traduz manualmente quando a traducao automatica esta desativada.
- **Recortar Tela**: captura uma area da tela e processa OCR/traducao.
- **Copiar**: copia texto original ou traducao.
- **Ouvir**: le texto original ou traducao com a voz do sistema.

## Central de Capturas

Cada captura pode guardar:

- miniatura da imagem capturada
- texto OCR
- traducao
- idioma de origem e destino
- CNPJ/CEP encontrados
- QR Codes e codigos de barras

A Central permite:

- reabrir uma captura antiga
- apagar uma captura
- limpar todas
- exportar Markdown
- exportar HTML imprimivel

## Desenvolvimento local

Requisitos:

- Node.js 20+
- npm
- Rust stable
- Tauri CLI
- macOS ou Windows para testar recursos nativos de captura/OCR

Instale dependencias:

```bash
npm ci
```

Rode o frontend:

```bash
npm run dev
```

Rode o app Tauri em desenvolvimento:

```bash
npm run tauri -- dev
```

Build web:

```bash
npm run build
```

Build desktop:

```bash
npm run tauri -- build
```

Build apenas DMG no macOS:

```bash
npm run tauri -- build --bundles dmg
```

## GitHub Actions

O workflow em `.github/workflows/release.yml` compila em:

- `macos-latest`
- `windows-latest`

Ele roda em:

- push na branch `main`
- tags `v*`
- execucao manual via `workflow_dispatch`

Os artefatos sao enviados pelo workflow:

- DMG/macOS
- app macOS, quando disponivel
- MSI/Windows
- EXE/NSIS, quando disponivel

## Assinatura e notarizacao macOS

O projeto usa assinatura ad-hoc por padrao:

```json
"macOS": {
  "signingIdentity": "-"
}
```

Isso deixa a estrutura do app valida para desenvolvimento local, mas nao substitui notarizacao Apple.

Para distribuicao publica sem alerta do Gatekeeper, configure:

- Apple Developer ID Application certificate
- `APPLE_ID`
- `APPLE_PASSWORD` ou App Specific Password
- `APPLE_TEAM_ID`

ou o fluxo por API Key da Apple.

## Solucao de problemas

### O macOS diz que a gravacao de tela esta ativada, mas o app ainda falha

Use:

```bash
npm run clean:mac
```

Depois reinstale o app, abra, tente recortar e permita novamente a gravacao de tela.

### A janela nao aparece ao fechar

O LingoSnap fica no tray/menu bar. Fechar a janela apenas oculta o app. Use o icone do tray ou o atalho global para abrir novamente.

### A IA nao retorna correcoes detalhadas

Verifique se o modo esta em Gemini, OpenAI ou OpenRouter e se a chave de API esta configurada.

### O modo gratuito nao detecta tudo

O MyMemory e usado como fallback gratuito e tem capacidade limitada. Para melhor qualidade, configure um motor com IA.

### O Windows abre ou pisca PowerShell no recorte

O app ja executa PowerShell em modo oculto. Se isso voltar a ocorrer, faca um build novo a partir da branch atual e substitua a instalacao antiga.

## Stack

- Tauri 2
- React 19
- TypeScript
- Vite
- Rust
- Vision OCR no macOS
- Windows OCR via Windows Runtime
- Keychain/Credential Manager via `keyring`

## Estrutura principal

```text
src/
  App.tsx
  components/
    CaptureCenter.tsx
    CorrectionPanel.tsx
    RegistryPanel.tsx
    SettingsModal.tsx
    Sidebar.tsx
  services/
    brDataService.ts
    translationService.ts

src-tauri/
  src/
    lib.rs
    ocr.swift
    capture_windows.ps1
    ocr_windows.ps1
  tauri.conf.json
```

## Licenca

Defina a licenca do projeto antes de distribuir publicamente.
