use serde::Serialize;
use tauri::{AppHandle, Manager, Theme};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use std::process::Command;
use std::fs;
use std::env;
use std::io::Cursor;
use std::path::{Path, PathBuf};
use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};
use rxing::Reader;
use base64::{engine::general_purpose, Engine as _};
use image::imageops::FilterType;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Debug, Clone, Serialize)]
pub struct CodeInfo {
    pub data: String,
    pub format: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct CapturedData {
    pub text: String,
    pub qr_codes: Vec<CodeInfo>,
    pub barcodes: Vec<CodeInfo>,
    pub image_data_url: Option<String>,
}

const KEYCHAIN_SERVICE: &str = "LingoSnap";

#[tauri::command]
fn register_global_shortcut(app: AppHandle, shortcut_str: String) -> Result<(), String> {
    let shortcut: Shortcut = shortcut_str.parse()
        .map_err(|e| format!("Shortcut inválido: {}", e))?;
    
    let global_shortcut = app.global_shortcut();
    
    global_shortcut.register(shortcut)
        .map_err(|e| format!("Falha ao registrar atalho: {}", e))?;
    
    Ok(())
}

#[tauri::command]
fn unregister_global_shortcut(app: AppHandle, shortcut_str: String) -> Result<(), String> {
    let shortcut: Shortcut = shortcut_str.parse()
        .map_err(|e| format!("Shortcut inválido: {}", e))?;
    
    let global_shortcut = app.global_shortcut();
    
    global_shortcut.unregister(shortcut)
        .map_err(|e| format!("Falha ao desregistrar atalho: {}", e))?;
    
    Ok(())
}

#[tauri::command]
fn set_app_theme(app: AppHandle, theme: String) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let tauri_theme = match theme.as_str() {
            "light" => Some(Theme::Light),
            "dark" => Some(Theme::Dark),
            _ => None,
        };
        let _ = window.set_theme(tauri_theme);
    }
    Ok(())
}

#[tauri::command]
fn save_api_secret(provider: String, secret: String) -> Result<(), String> {
    let account = format!("api-key-{}", provider);
    let entry = keyring::Entry::new(KEYCHAIN_SERVICE, &account)
        .map_err(|e| format!("Erro ao acessar cofre de credenciais: {}", e))?;

    if secret.trim().is_empty() {
        let _ = entry.delete_credential();
        return Ok(());
    }

    entry
        .set_password(secret.trim())
        .map_err(|e| format!("Erro ao salvar credencial: {}", e))
}

#[tauri::command]
fn get_api_secret(provider: String) -> Result<Option<String>, String> {
    let account = format!("api-key-{}", provider);
    let entry = keyring::Entry::new(KEYCHAIN_SERVICE, &account)
        .map_err(|e| format!("Erro ao acessar cofre de credenciais: {}", e))?;

    match entry.get_password() {
        Ok(secret) => Ok(Some(secret)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("Erro ao ler credencial: {}", e)),
    }
}

#[cfg(target_os = "macos")]
#[tauri::command]
fn reset_screen_recording_permission() -> Result<(), String> {
    if let Some(app_bundle_path) = current_app_bundle_path() {
        let _ = Command::new("/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister")
            .arg("-f")
            .arg(app_bundle_path)
            .status();
    }

    let _reset_status = Command::new("tccutil")
        .args(["reset", "ScreenCapture", "com.douglasrodrigues.lingosnap"])
        .status()
        .map_err(|e| format!("Erro ao resetar permissão de gravação de tela: {}", e))?;

    Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture")
        .status()
        .map_err(|e| format!("Erro ao abrir Ajustes do Sistema: {}", e))?;

    Ok(())
}

#[cfg(target_os = "macos")]
fn current_app_bundle_path() -> Option<PathBuf> {
    let exe = env::current_exe().ok()?;
    exe.ancestors()
        .find(|path| path.extension().is_some_and(|ext| ext == "app"))
        .map(Path::to_path_buf)
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
fn reset_screen_recording_permission() -> Result<(), String> {
    Ok(())
}

#[cfg(target_os = "macos")]
#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGPreflightScreenCaptureAccess() -> bool;
    fn CGRequestScreenCaptureAccess() -> bool;
}

#[cfg(target_os = "macos")]
fn capture_screen_macos(temp_image_str: &str) -> Result<(), String> {
    unsafe {
        if !CGPreflightScreenCaptureAccess() {
            CGRequestScreenCaptureAccess();
            return Err("Permissão de Gravação de Tela necessária. Se o LingoSnap já estiver marcado em Ajustes do Sistema, clique em Reparar permissão nas Preferências, ative novamente e reinicie o app.".to_string());
        }
    }

    let capture_status = Command::new("screencapture")
        .args(&["-i", temp_image_str])
        .status()
        .map_err(|e| format!("Erro ao executar screencapture: {}", e))?;

    if !capture_status.success() || !Path::new(temp_image_str).exists() {
        unsafe {
            if !CGPreflightScreenCaptureAccess() {
                return Err("Permissão de Gravação de Tela necessária. Por favor, ative o acesso do LingoSnap em 'Ajustes do Sistema > Privacidade e Segurança > Gravação de Tela' e tente novamente.".to_string());
            }
        }
        return Err("Captura cancelada ou falhou".to_string());
    }

    Ok(())
}

#[cfg(target_os = "windows")]
fn capture_screen_windows(temp_image_str: &str) -> Result<(), String> {
    let temp_dir = env::temp_dir();
    let ps_path = temp_dir.join("lingosnap_capture.ps1");
    let ps_code = include_str!("capture_windows.ps1");
    fs::write(&ps_path, ps_code)
        .map_err(|e| format!("Erro ao escrever script de captura: {}", e))?;

    let output = Command::new("powershell.exe")
        .args(&[
            "-NoProfile",
            "-NonInteractive",
            "-WindowStyle", "Hidden",
            "-ExecutionPolicy", "Bypass",
            "-File", &ps_path.to_string_lossy().to_string(),
            temp_image_str,
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("Erro ao executar captura de tela: {}", e))?;

    let _ = fs::remove_file(&ps_path);

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();

    if stdout != "OK" || !Path::new(temp_image_str).exists() {
        return Err("Captura cancelada ou falhou".to_string());
    }

    Ok(())
}

#[cfg(target_os = "macos")]
fn run_ocr_macos(temp_image_str: &str, temp_swift_path: &Path) -> Result<String, String> {
    let swift_code = include_str!("ocr.swift");
    fs::write(temp_swift_path, swift_code)
        .map_err(|e| format!("Erro ao escrever ocr.swift temporário: {}", e))?;

    let ocr_output = Command::new("swift")
        .args(&[
            temp_swift_path.to_string_lossy().to_string(),
            temp_image_str.to_string(),
        ])
        .output()
        .map_err(|e| format!("Erro ao executar script Swift OCR: {}", e))?;

    let _ = fs::remove_file(temp_swift_path);

    if !ocr_output.status.success() {
        let err_msg = String::from_utf8_lossy(&ocr_output.stderr).trim().to_string();
        return Err(format!("Erro no OCR Swift: {}", err_msg));
    }

    let recognized_text = String::from_utf8_lossy(&ocr_output.stdout).trim().to_string();
    Ok(recognized_text)
}

#[cfg(target_os = "windows")]
fn run_ocr_windows(temp_image_str: &str) -> Result<String, String> {
    let temp_dir = env::temp_dir();
    let ps_path = temp_dir.join("lingosnap_ocr.ps1");
    let ps_code = include_str!("ocr_windows.ps1");
    fs::write(&ps_path, ps_code)
        .map_err(|e| format!("Erro ao escrever script OCR: {}", e))?;

    let output = Command::new("powershell.exe")
        .args(&[
            "-NoProfile",
            "-NonInteractive",
            "-WindowStyle", "Hidden",
            "-ExecutionPolicy", "Bypass",
            "-File", &ps_path.to_string_lossy().to_string(),
            temp_image_str,
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| format!("Erro ao executar OCR Windows: {}", e))?;

    let _ = fs::remove_file(&ps_path);

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();

    if !output.status.success() {
        if stdout.starts_with("ERROR:") {
            return Err(stdout[6..].to_string());
        }
        return Err(format!("Falha no OCR do Windows: {}", stdout));
    }

    Ok(stdout)
}

fn detect_codes_in_image(img_path: &str) -> (Vec<CodeInfo>, Vec<CodeInfo>) {
    let img = match image::open(img_path) {
        Ok(img) => img,
        Err(_) => return (vec![], vec![]),
    };

    let luma = img.to_luma8();
    let (w, h) = luma.dimensions();
    let raw = luma.into_raw();

    let source = rxing::Luma8LuminanceSource::new(raw, w, h);
    let mut bitmap = rxing::BinaryBitmap::new(rxing::common::HybridBinarizer::new(source));

    let mut reader = rxing::MultiFormatReader::default();

    let mut qr_codes = Vec::new();
    let mut barcodes = Vec::new();

    if let Ok(result) = reader.decode(&mut bitmap) {
        let data = result.getText().to_string();
        let format_val = result.getBarcodeFormat();
        let format_str = format!("{:?}", format_val);

        let info = CodeInfo {
            data,
            format: format_str,
        };

        match format_val {
            rxing::BarcodeFormat::QR_CODE => qr_codes.push(info),
            _ => barcodes.push(info),
        }
    }

    (qr_codes, barcodes)
}

fn create_capture_thumbnail_data_url(img_path: &str) -> Option<String> {
    let img = image::open(img_path).ok()?;
    let thumbnail = img.resize(420, 260, FilterType::Triangle);
    let mut bytes = Cursor::new(Vec::new());
    thumbnail.write_to(&mut bytes, image::ImageFormat::Png).ok()?;
    let encoded = general_purpose::STANDARD.encode(bytes.into_inner());
    Some(format!("data:image/png;base64,{}", encoded))
}

#[tauri::command]
async fn capture_and_ocr(app: AppHandle) -> Result<CapturedData, String> {
    let window = app.get_webview_window("main")
        .ok_or_else(|| "Janela principal não encontrada".to_string())?;

    let _ = window.hide();
    std::thread::sleep(std::time::Duration::from_millis(250));

    let temp_dir = env::temp_dir();
    let temp_image_path = temp_dir.join("tauri_translator_capture.png");
    let temp_image_str = temp_image_path.to_string_lossy().to_string();

    #[cfg(target_os = "macos")]
    {
        if let Err(e) = capture_screen_macos(&temp_image_str) {
            let _ = window.show();
            let _ = window.set_focus();
            return Err(e);
        }
    }

    #[cfg(target_os = "windows")]
    {
        if let Err(e) = capture_screen_windows(&temp_image_str) {
            let _ = window.show();
            let _ = window.set_focus();
            return Err(e);
        }
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        let _ = window.show();
        let _ = window.set_focus();
        return Err("Sistema operacional não suportado para captura de tela".to_string());
    }

    let _ = window.show();
    let _ = window.set_focus();

    if !temp_image_path.exists() {
        return Err("Captura cancelada ou falhou".to_string());
    }

    let temp_swift_path = temp_dir.join("tauri_translator_ocr.swift");

    #[cfg(target_os = "macos")]
    let ocr_text = run_ocr_macos(&temp_image_str, &temp_swift_path).unwrap_or_default();

    #[cfg(target_os = "windows")]
    let ocr_text = run_ocr_windows(&temp_image_str).unwrap_or_default();

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let ocr_text = String::new();

    let (qr_codes, barcodes) = detect_codes_in_image(&temp_image_str);
    let image_data_url = create_capture_thumbnail_data_url(&temp_image_str);

    let _ = fs::remove_file(&temp_image_path);

    Ok(CapturedData {
        text: ocr_text,
        qr_codes,
        barcodes,
        image_data_url,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
        .plugin(tauri_plugin_global_shortcut::Builder::new()
            .with_handler(|app, _shortcut, event| {
                if event.state() == ShortcutState::Pressed {
                    if let Some(window) = app.get_webview_window("main") {
                        let is_visible = window.is_visible().unwrap_or(false);
                        let is_focused = window.is_focused().unwrap_or(false);
                        
                        if is_visible && is_focused {
                            let _ = window.hide();
                        } else {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                }
            })
            .build()
        )
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let quit_i = tauri::menu::MenuItem::with_id(app, "quit", "Sair do Tradutor", true, None::<&str>)?;
            let menu = tauri::menu::Menu::with_items(app, &[&quit_i])?;

            let _tray = tauri::tray::TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app, event| {
                    if event.id.as_ref() == "quit" {
                        app.exit(0);
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click { button: tauri::tray::MouseButton::Left, .. } = event {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let is_visible = window.is_visible().unwrap_or(false);
                            if is_visible {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            #[cfg(target_os = "macos")]
            {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = apply_vibrancy(&window, NSVisualEffectMaterial::Sidebar, None, None);
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            register_global_shortcut,
            unregister_global_shortcut,
            set_app_theme,
            save_api_secret,
            get_api_secret,
            reset_screen_recording_permission,
            capture_and_ocr
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
