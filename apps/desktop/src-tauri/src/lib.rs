use std::env;

use tauri::{Manager, TitleBarStyle, WebviewUrl, WebviewWindowBuilder};

fn dashboard_url() -> String {
    if let Ok(url) = env::var("DASHBOARD_URL") {
        if !url.trim().is_empty() {
            return url;
        }
    }

    let env_name = env::var("DESKTOP_ENV").unwrap_or_else(|_| "development".to_string());

    match env_name.as_str() {
        "development" | "dev" => "http://localhost:3094".to_string(),
        "staging" => "https://staging-dashboard.ewatrade.com".to_string(),
        "production" | "prod" => "https://dashboard.ewatrade.com".to_string(),
        _ => "http://localhost:3094".to_string(),
    }
}

fn is_external_url(url: &str, dashboard_url: &str) -> bool {
    if let (Ok(target), Ok(base)) = (tauri::Url::parse(url), tauri::Url::parse(dashboard_url)) {
        let is_http = target.scheme() == "http" || target.scheme() == "https";
        return is_http && target.host() != base.host();
    }

    false
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let dashboard_url = dashboard_url();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(move |app| {
            let navigation_base_url = dashboard_url.clone();
            let opener = app.handle().clone();
            let window = WebviewWindowBuilder::new(
                app,
                "main",
                WebviewUrl::External(tauri::Url::parse(&dashboard_url).unwrap()),
            )
            .title("EwaTrade")
            .inner_size(1440.0, 900.0)
            .min_inner_size(1180.0, 760.0)
            .user_agent("Mozilla/5.0 (compatible; EwaTrade Desktop App)")
            .title_bar_style(TitleBarStyle::Overlay)
            .on_navigation(move |url| {
                let url_string = url.as_str().to_string();

                if is_external_url(&url_string, &navigation_base_url) {
                    let opener = opener.clone();
                    tauri::async_runtime::spawn(async move {
                        let _ = tauri_plugin_opener::OpenerExt::opener(&opener)
                            .open_url(url_string, None::<String>);
                    });
                    return false;
                }

                true
            })
            .build()?;

            window.show()?;
            window.set_focus()?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running EwaTrade desktop app")
}
