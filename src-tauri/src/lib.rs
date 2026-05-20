use tauri::{AppHandle, Manager, Theme};
use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use std::process::Command;
use std::fs;
use std::env;

#[tauri::command]
fn register_global_shortcut(app: AppHandle, shortcut_str: String) -> Result<(), String> {
    let shortcut: Shortcut = shortcut_str.parse()
        .map_err(|e| format!("Shortcut inválido: {}", e))?;
    
    let global_shortcut = app.global_shortcut();
    
    // Register the shortcut
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
async fn capture_and_ocr(app: AppHandle) -> Result<String, String> {
    let window = app.get_webview_window("main")
        .ok_or_else(|| "Janela principal não encontrada".to_string())?;
    
    // Hide the window so it doesn't block the screen
    let _ = window.hide();
    
    // Wait a brief moment to let window disappear
    std::thread::sleep(std::time::Duration::from_millis(250));
    
    // Create a temporary path
    let temp_dir = env::temp_dir();
    let temp_image_path = temp_dir.join("tauri_translator_capture.png");
    let temp_image_str = temp_image_path.to_string_lossy().to_string();
    
    // Run macOS screencapture interactive command: screencapture -i <file>
    let capture_status = Command::new("screencapture")
        .args(&["-i", &temp_image_str])
        .status()
        .map_err(|e| {
            let _ = window.show();
            let _ = window.set_focus();
            format!("Erro ao executar screencapture: {}", e)
        })?;
    
    // Show window back and focus it
    let _ = window.show();
    let _ = window.set_focus();
    #[cfg(target_os = "macos")]
    {
        use tauri::ActivationPolicy;
        app.set_activation_policy(ActivationPolicy::Regular).ok();
    }
    
    // Check if the file was created (screencapture -i creates the file if selection is successful)
    if !temp_image_path.exists() || !capture_status.success() {
        return Err("Captura cancelada ou falhou".to_string());
    }
    
    let temp_swift_path = temp_dir.join("tauri_translator_ocr.swift");
    let swift_code = include_str!("ocr.swift");
    fs::write(&temp_swift_path, swift_code)
        .map_err(|e| format!("Erro ao escrever ocr.swift temporário: {}", e))?;
    
    // Run the swift command: swift /path/to/ocr.swift /path/to/image.png
    let ocr_output = Command::new("swift")
        .args(&[temp_swift_path.to_string_lossy().to_string(), temp_image_str.clone()])
        .output()
        .map_err(|e| format!("Erro ao executar script Swift OCR: {}", e))?;
    
    // Clean up temporary files
    let _ = fs::remove_file(temp_image_path);
    let _ = fs::remove_file(temp_swift_path);
    
    if !ocr_output.status.success() {
        let err_msg = String::from_utf8_lossy(&ocr_output.stderr).trim().to_string();
        return Err(format!("Erro no OCR Swift: {}", err_msg));
    }
    
    let recognized_text = String::from_utf8_lossy(&ocr_output.stdout).trim().to_string();
    
    if recognized_text.is_empty() {
        return Err("Nenhum texto reconhecido na imagem.".to_string());
    }
    
    Ok(recognized_text)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
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
                            #[cfg(target_os = "macos")]
                            {
                                use tauri::ActivationPolicy;
                                app.set_activation_policy(ActivationPolicy::Regular).ok();
                            }
                        }
                    }
                }
            })
            .build()
        )
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = apply_vibrancy(&window, NSVisualEffectMaterial::Sidebar, None, None);
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            register_global_shortcut,
            unregister_global_shortcut,
            set_app_theme,
            capture_and_ocr
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

