use egui::{Color32, Ui};
use egui_plot::{Line, Plot, PlotPoints};

/// Renders an OHLCV close-price sparkline.
/// `data` is a slice of `(unix_timestamp_secs, close_price_usd)`.
pub fn show_price_chart(ui: &mut Ui, data: &[(f64, f64)]) {
    if data.is_empty() {
        // Demo placeholder with a sine-wave shape
        let demo: PlotPoints = (0..60)
            .map(|i| {
                let x = i as f64;
                let y = 100.0 + 8.0 * (x * 0.3).sin() + 3.0 * (x * 0.7).cos();
                [x, y]
            })
            .collect();

        Plot::new("price_chart_demo")
            .height(100.0)
            .show_axes([false, true])
            .allow_zoom(false)
            .allow_drag(false)
            .show(ui, |plot_ui| {
                plot_ui.line(
                    Line::new(demo)
                        .color(Color32::from_rgb(0x42, 0xE8, 0xF5))
                        .width(1.5),
                );
            });

        ui.label(
            egui::RichText::new("Chart data loading…")
                .size(10.0)
                .color(Color32::from_rgb(0x55, 0x55, 0x55)),
        );
        return;
    }

    let points: PlotPoints = data
        .iter()
        .enumerate()
        .map(|(i, (_ts, close))| [i as f64, *close])
        .collect();

    // Colour the line green if trending up, red if down
    let trend_color = if data.len() >= 2 && data.last().map(|d| d.1).unwrap_or(0.0)
        >= data.first().map(|d| d.1).unwrap_or(0.0)
    {
        Color32::from_rgb(0x8B, 0xF5, 0x42)
    } else {
        Color32::from_rgb(0xF5, 0x42, 0x42)
    };

    Plot::new("price_chart")
        .height(100.0)
        .show_axes([false, true])
        .allow_zoom(false)
        .allow_drag(false)
        .show(ui, |plot_ui| {
            plot_ui.line(Line::new(points).color(trend_color).width(1.5));
        });
}
