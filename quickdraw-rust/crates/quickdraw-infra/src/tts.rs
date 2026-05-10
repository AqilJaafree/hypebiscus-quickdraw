/// ElevenLabs text-to-speech — streams MP3, decodes with rodio/symphonia.

use anyhow::{bail, Result};
use reqwest::Client;
use rodio::{Decoder, OutputStream, Sink};
use std::io::Cursor;
use std::time::Duration;

const ELEVENLABS_VOICE_ID: &str = "21m00Tcm4TlvDq8ikWAM"; // Rachel — calm, clear
const ELEVENLABS_BASE: &str = "https://api.elevenlabs.io/v1";

pub struct Tts {
    client: Client,
    api_key: String,
}

impl Tts {
    pub fn new(api_key: impl Into<String>) -> Self {
        Self {
            client: Client::builder()
                .timeout(Duration::from_secs(30))
                .local_address("0.0.0.0".parse::<std::net::IpAddr>().ok())
                .build()
                .expect("reqwest"),
            api_key: api_key.into(),
        }
    }

    /// Synthesize text to speech and play it through the default audio output.
    /// Non-blocking — spawns a background task.
    pub fn speak(&self, text: impl Into<String>) {
        let client  = self.client.clone();
        let api_key = self.api_key.clone();
        let text    = text.into();

        tokio::task::spawn_blocking(move || {
            if let Err(e) = play_speech_blocking(&client, &api_key, &text) {
                tracing::warn!("TTS playback failed: {e}");
            }
        });
    }
}

fn play_speech_blocking(client: &Client, api_key: &str, text: &str) -> Result<()> {
    let rt = tokio::runtime::Handle::current();

    let mp3_bytes = rt.block_on(async {
        let resp = client
            .post(format!("{}/text-to-speech/{}/stream", ELEVENLABS_BASE, ELEVENLABS_VOICE_ID))
            .header("xi-api-key", api_key)
            .json(&serde_json::json!({
                "text": text,
                "model_id": "eleven_turbo_v2",
                "voice_settings": { "stability": 0.5, "similarity_boost": 0.75 }
            }))
            .send()
            .await?;

        if !resp.status().is_success() {
            bail!("ElevenLabs error: {}", resp.status());
        }

        resp.bytes().await.map_err(Into::into)
    })?;

    let cursor  = Cursor::new(mp3_bytes);
    let decoder = Decoder::new(cursor)?;

    let (_stream, stream_handle) = OutputStream::try_default()?;
    let sink = Sink::try_new(&stream_handle)?;
    sink.append(decoder);
    sink.sleep_until_end();

    Ok(())
}
