/// Step-by-step guide type returned by Claude Vision.
///
/// Claude is prompted to emit one step per line, optionally ending with
/// [POINT:x,y:label] where x,y are physical pixel coordinates on the screenshot.

#[derive(Debug, Clone, Default)]
pub struct GuideStep {
    pub text:  String,
    pub point: Option<(f32, f32)>,  // physical pixel coords on captured screenshot
    pub label: Option<String>,
}

impl GuideStep {
    /// Parse Claude's multi-line response into a Vec of steps.
    pub fn parse_response(response: &str) -> Vec<Self> {
        let mut steps = Vec::new();
        for line in response.lines() {
            let line = line.trim();
            if line.is_empty() { continue; }

            let (raw_text, point, label) = extract_point_tag(line);
            let text = strip_step_prefix(&raw_text).to_string();
            if !text.is_empty() {
                steps.push(GuideStep { text, point, label });
            }
        }
        steps
    }
}

/// Pull [POINT:x,y:label] out of a line and return (cleaned_text, coords, label).
fn extract_point_tag(line: &str) -> (String, Option<(f32, f32)>, Option<String>) {
    if let Some(start) = line.find("[POINT:") {
        if let Some(rel_end) = line[start..].find(']') {
            let end = start + rel_end;
            let inner = &line[start + 7..end];
            let (coord_part, label_part) = inner.split_once(':').unwrap_or((inner, ""));

            let point = {
                let xy: Vec<&str> = coord_part.split(',').collect();
                if xy.len() == 2 {
                    let x = xy[0].trim().parse::<f32>().ok();
                    let y = xy[1].trim().parse::<f32>().ok();
                    x.zip(y)
                } else {
                    None
                }
            };
            let label = if label_part.is_empty() { None } else { Some(label_part.trim().to_string()) };
            let suffix = if end + 1 < line.len() { &line[end + 1..] } else { "" };
            let clean  = format!("{}{}", &line[..start], suffix).trim().to_string();
            return (clean, point, label);
        }
    }
    (line.to_string(), None, None)
}

/// Strip "1. ", "Step 2: ", "Step 3 — " prefixes from step text.
fn strip_step_prefix(text: &str) -> &str {
    let t = text.trim();
    // Strip leading digits + separator (e.g. "1. " or "2: ")
    let bytes = t.as_bytes();
    let mut i = 0;
    while i < bytes.len() && bytes[i].is_ascii_digit() { i += 1; }
    if i > 0 && i < bytes.len() && matches!(bytes[i], b'.' | b':' | b')') {
        return t[i + 1..].trim();
    }
    // Strip "Step N: " or "Step N — "
    let prefix5: String = t.chars().take(5).collect();
    if prefix5.eq_ignore_ascii_case("step ") {
        if let Some((sep_idx, sep_char)) = t.char_indices().find(|(_, c)| matches!(c, ':' | '-' | '\u{2014}')) {
            return t[sep_idx + sep_char.len_utf8()..].trim();
        }
    }
    t
}
