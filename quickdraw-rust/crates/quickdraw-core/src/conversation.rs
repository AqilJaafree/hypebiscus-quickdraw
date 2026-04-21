use std::time::{Duration, Instant};
use serde::{Deserialize, Serialize};
use solana_sdk::pubkey::Pubkey;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub role: Role,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Role {
    User,
    Assistant,
}

#[derive(Debug, Clone)]
pub enum ConversationTopic {
    Token(Pubkey),
    Swap { from: Pubkey, to: Pubkey },
    Yield(Pubkey),
    General,
}

pub struct ConversationThread {
    pub topic: ConversationTopic,
    pub messages: Vec<Message>,
    pub token: Option<Pubkey>,
    pub started_at: Instant,
    pub last_activity: Instant,
}

impl ConversationThread {
    pub fn new(topic: ConversationTopic, token: Option<Pubkey>) -> Self {
        let now = Instant::now();
        Self {
            topic,
            messages: Vec::new(),
            token,
            started_at: now,
            last_activity: now,
        }
    }

    pub fn is_expired(&self) -> bool {
        self.last_activity.elapsed() > Duration::from_secs(180)
    }

    pub fn push(&mut self, message: Message) {
        self.last_activity = Instant::now();
        self.messages.push(message);
    }

    pub fn estimated_tokens(&self) -> usize {
        self.messages.iter().map(|m| m.content.len() / 4).sum()
    }

    /// Compress by keeping only the most recent messages when over budget.
    pub fn maybe_compress(&mut self, budget: usize) {
        if self.estimated_tokens() <= budget {
            return;
        }
        let keep = self.messages.len().saturating_sub(4);
        self.messages.drain(0..keep);
    }
}
